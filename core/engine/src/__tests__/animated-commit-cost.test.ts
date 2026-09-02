// What ONE animation frame costs, counted rather than timed.
//
// The JS-driven Animated path flushes a frame by calling `setNativeProps` on each animated leaf
// (`animated/graph.ts` flushValue -> `animated/props.ts` update()), and `setNativeProps` commits
// its surface synchronously. So the cost of a frame is set by how many leaves are animating and by
// how much of the tree each of those commits walks - neither of which is visible in the committed
// output, because a correct-and-cheap engine and a correct-and-expensive one emit the same Fabric
// tree. Only counters separate them, so these rows assert counters.
//
// Written 2026-08-22 as the reproduction for a specific claim: N concurrent JS-driven animations
// cost N full commits per frame. Read the numbers here beside `reconcile.bench.ts`'s app-shaped
// series, which times the same shapes.

import { beforeAll, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  readCommitProfile,
  registerPostCommit,
  setNativeProps,
  setProp,
  setText,
  unregisterPostCommit,
  type ISymbioteNode,
} from '../index';
// Not on the public barrel: apps and adapters never need to force the flush, only this suite does
// (and only to keep the counters deterministic — the microtask row below proves it self-schedules).
import { flushNativeProps } from '../commit';

const fabric = installFabric();

// A navigation stack the way react-navigation leaves it: previous screens stay MOUNTED behind the
// top one. Small enough to assert exact numbers, same SHAPE as the bench fixture.
const SCREENS = 6;
const ROWS_PER_SCREEN = 5;
const surface = createSurface(6100);
const animTargets: ISymbioteNode[] = [];

beforeAll(() => {
  for (let screenIndex = 0; screenIndex < SCREENS; screenIndex += 1) {
    const screen = createElement('RCTView');
    setProp(screen, 'testID', `screen-${screenIndex}`);
    const list = createElement('RCTScrollView');
    const content = createElement('RCTView');
    appendChild(list, content);
    appendChild(screen, list);

    for (let rowIndex = 0; rowIndex < ROWS_PER_SCREEN; rowIndex += 1) {
      const row = createElement('RCTView');
      setProp(row, 'testID', `row-${screenIndex}-${rowIndex}`);
      const label = createElement('RCTText', true);
      const raw = createElement('RCTRawText');
      setText(raw, `cell ${screenIndex}.${rowIndex}`);
      appendChild(label, raw);
      appendChild(row, label);
      appendChild(content, row);
      // Five animated leaves, all on the TOP screen — five concurrent animations on one screen.
      if (screenIndex === SCREENS - 1) animTargets.push(row);
    }
    surface.appendChild(screen);
  }
  surface.commit();
});

function findByTestID(node: IFakeNode, testID: string): IFakeNode | undefined {
  if (node.props.testID === testID) return node;
  for (const child of node.children) {
    const hit = findByTestID(child, testID);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

interface IFrameCost {
  commits: number;
  visited: number;
  clones: number;
}

// Drive one animation frame and report what it cost. Reading the profile zeroes it, so each call
// measures exactly the frame it drove. The explicit flush stands in for the task boundary the host
// gives a real frame: setNativeProps queues, and the queue publishes when the stack empties.
function frame(drive: () => void): IFrameCost {
  readCommitProfile();
  const clonesBefore = fabric.counts.clone;
  const completeRootBefore = fabric.counts.completeRoot;
  drive();
  flushNativeProps();
  const profile = readCommitProfile();
  return {
    commits: fabric.counts.completeRoot - completeRootBefore,
    visited: profile.nodesVisited,
    clones: fabric.counts.clone - clonesBefore,
  };
}

describe('the general commit path pays for the whole app on every frame', () => {
  it('walks the untouched screens to re-commit one node', () => {
    let tick = 0;
    const cost = frame(() => {
      tick += 1;
      // setProp + commit: what a framework re-render does, and the path an animation frame took
      // before commitTargeted existed.
      setProp(animTargets[0], 'opacity', (tick % 20) / 20);
      surface.commit();
    });

    // The chain that genuinely has to be re-cloned is short: container -> screen -> list ->
    // content -> row. Everything beyond that is overhead of walking DOWN from the root:
    //   - the 5 sibling screens and the 4 sibling rows, visited only to early-exit;
    //   - the animated row's own child, because the update path always recurses into a dirty
    //     node's children to collect their handles, even when only props changed.
    // Both scale with the app, not with the animation, and neither is work the commit must do:
    // every one of those nodes hands back the handle its committed record already held.
    const CHAIN = 5;
    const SIBLINGS_ON_THE_PATH = SCREENS - 1 + (ROWS_PER_SCREEN - 1);
    const CHILDREN_OF_THE_DIRTY_NODE = 1;
    expect(cost.visited).toBe(
      CHAIN + SIBLINGS_ON_THE_PATH + CHILDREN_OF_THE_DIRTY_NODE,
    );
    // Stated as a ratio too, because that is the claim: two thirds of this frame's walk is the
    // app's size, not the animation's.
    expect(cost.visited / CHAIN).toBeGreaterThan(2);
  });
});

describe('the targeted animation path clones the chain and nothing else', () => {
  it('commits ONCE per frame, however many leaves animate', () => {
    // A value sequence of its own. Two tests landing on the SAME opacity would make the second
    // write a genuine no-op (Fabric already holds it) and commit nothing — correct behaviour, and
    // an order-dependent test. Each block below picks a disjoint range.
    let tick = 300;
    const oneLeaf = frame(() => {
      tick += 1;
      setNativeProps(animTargets[0], { opacity: 0.11 + tick / 1000 });
    });
    const fiveLeaves = frame(() => {
      tick += 1;
      for (const target of animTargets)
        setNativeProps(target, { opacity: 0.22 + tick / 1000 });
    });
    // Was 5 before the flush was coalesced, and that number was the cost: the shared ancestors
    // (container -> screen -> list -> content) re-cloned five times over, each re-appending the
    // whole child list. One commit publishes all five values instead.
    expect(oneLeaf.commits).toBe(1);
    expect(fiveLeaves.commits).toBe(1);
  });

  it('visits only the ancestor chain, not the siblings', () => {
    let tick = 400;
    const cost = frame(() => {
      tick += 1;
      setNativeProps(animTargets[0], { opacity: 0.33 + tick / 1000 });
    });
    // container -> screen -> list -> content, plus the node itself. No siblings, no children.
    const CHAIN = 5;
    expect(cost.visited).toBe(CHAIN);
    // The clone-bubble is NOT removed and must not be: a persistent parent points at specific child
    // handles, so every ancestor still re-clones. One props clone plus one children clone per
    // ancestor is the floor Fabric's protocol sets.
    expect(cost.clones).toBe(CHAIN);
  });

  // THE ORACLE. The general commit is the reference implementation, so the targeted one is correct
  // exactly when it leaves the general one nothing to do. If commitTargeted missed a clone, skipped
  // an ancestor, or wrote a handle to the wrong place, the follow-up commit finds work here.
  it('leaves the general commit nothing to do', () => {
    let tick = 500;
    tick += 1;
    setNativeProps(animTargets[2], { opacity: 0.44 + tick / 1000 });
    flushNativeProps();

    const clonesBefore = fabric.counts.clone;
    const completeRootBefore = fabric.counts.completeRoot;
    surface.commit();
    expect(fabric.counts.clone).toBe(clonesBefore);
    expect(fabric.counts.completeRoot).toBe(completeRootBefore);
  });

  it('delivers every animated value to Fabric, siblings intact and in order', () => {
    let tick = 600;
    tick += 1;
    const value = 0.55 + tick / 1000;
    for (const target of animTargets)
      setNativeProps(target, { opacity: value });
    flushNativeProps();

    for (let index = 0; index < animTargets.length; index += 1) {
      // Read the COMMITTED tree, not `created`: a clone is a new object, so the recorder's
      // create-list still holds the node as it was minted.
      const committed = findByTestID(
        fabric.appRoot(),
        `row-${SCREENS - 1}-${index}`,
      );
      expect(committed?.props.opacity).toBe(value);
    }

    // The other screens must still be mounted, in order, with their rows - the whole risk of
    // rebuilding a child set by hand is dropping or reordering a sibling.
    const root = fabric.appRoot();
    expect(root.children.length).toBe(SCREENS);
    for (let index = 0; index < SCREENS; index += 1) {
      expect(root.children[index].props.testID).toBe(`screen-${index}`);
    }
    const topContent = root.children[SCREENS - 1].children[0].children[0];
    expect(topContent.children.length).toBe(ROWS_PER_SCREEN);
    for (let index = 0; index < ROWS_PER_SCREEN; index += 1) {
      expect(topContent.children[index].props.testID).toBe(
        `row-${SCREENS - 1}-${index}`,
      );
    }
  });

  it('falls back when the animated node itself gained a child', () => {
    // The other half of the structural precondition: this path never descends into the node, so a
    // pending change BELOW it would be published as if it had not happened. Checked separately from
    // the ancestor case because a different flag read guards each.
    const target = animTargets[3];
    const late = createElement('RCTView');
    setProp(late, 'testID', 'late-child');
    appendChild(target, late);

    setNativeProps(target, { opacity: 0.625 });
    flushNativeProps();

    expect(
      findByTestID(fabric.appRoot(), `row-${SCREENS - 1}-3`)?.props.opacity,
    ).toBe(0.625);
    expect(findByTestID(fabric.appRoot(), 'late-child')).toBeDefined();
  });

  it('falls back to the general commit when a sibling is not committed yet', () => {
    // A structural change is pending: the new row has no committed record, so the targeted path
    // cannot rebuild its parent's child set from committed handles and must bail. The value still
    // has to arrive, and the new sibling has to appear.
    const parent = animTargets[0].parent!;
    const late = createElement('RCTView');
    setProp(late, 'testID', 'late-row');
    appendChild(parent, late);

    setNativeProps(animTargets[0], { opacity: 0.375 });
    flushNativeProps();

    expect(
      findByTestID(fabric.appRoot(), `row-${SCREENS - 1}-0`)?.props.opacity,
    ).toBe(0.375);
    expect(findByTestID(fabric.appRoot(), 'late-row')).toBeDefined();
  });
});

// The coalescing contract, stated as three rows rather than left implicit. The whole objection to
// batching an animation is "a dropped value is a dropped frame", and the answer is that merging is
// only ever applied where there is nothing to drop — different nodes carry different values. The
// one shape that WOULD drop a value is the second row, and it is the one shape that is not merged.
describe('coalescing the flush never drops a value', () => {
  // Every value Fabric was handed, in commit order. A post-commit hook is the only vantage point
  // that sees the INTERMEDIATE states: the fake's tree only ever shows the newest clone, so reading
  // it at the end cannot tell "both values were published" from "only the last one was".
  function recordPublished(testID: string, drive: () => void): unknown[] {
    const published: unknown[] = [];
    const hook = (): void => {
      published.push(findByTestID(fabric.appRoot(), testID)?.props.opacity);
    };
    registerPostCommit(hook);
    try {
      drive();
      flushNativeProps();
    } finally {
      unregisterPostCommit(hook);
    }
    return published;
  }

  it('merges writes to DIFFERENT nodes into one commit, all values landing', () => {
    const published = recordPublished(`row-${SCREENS - 1}-0`, () => {
      for (let index = 0; index < animTargets.length; index += 1)
        setNativeProps(animTargets[index], { opacity: 0.71 + index / 1000 });
    });

    expect(published.length).toBe(1);
    for (let index = 0; index < animTargets.length; index += 1) {
      expect(
        findByTestID(fabric.appRoot(), `row-${SCREENS - 1}-${index}`)?.props
          .opacity,
      ).toBe(0.71 + index / 1000);
    }
  });

  it('does NOT merge a second write to the same node — both values reach Fabric, in order', () => {
    const testID = `row-${SCREENS - 1}-1`;
    const published = recordPublished(testID, () => {
      setNativeProps(animTargets[1], { opacity: 0.81 });
      setNativeProps(animTargets[1], { opacity: 0.82 });
    });

    // Two commits, and — the actual point — the intermediate 0.81 was really published, not skipped
    // over. Merging here is what option A would have done and what this rules out.
    expect(published).toEqual([0.81, 0.82]);
  });

  // The union is the reason batching is worth anything, and it is also the riskiest part: it
  // rebuilds one child set from several branches at once. Counted, because a union that quietly
  // degraded to "clone each chain separately" would emit the identical tree.
  it('clones each shared ancestor ONCE, not once per animated leaf', () => {
    const cost = frame(() => {
      for (let index = 0; index < animTargets.length; index += 1)
        setNativeProps(animTargets[index], { opacity: 0.61 + index / 1000 });
    });

    // Five row clones, plus ONE clone each for the four ancestors they share
    // (content -> list -> screen -> container).
    const SHARED_ANCESTORS = 4;
    expect(cost.clones).toBe(animTargets.length + SHARED_ANCESTORS);
    // What it would have cost as five separate targeted commits: five full chains.
    expect(cost.clones).toBeLessThan(
      animTargets.length * (SHARED_ANCESTORS + 1),
    );
  });

  // THE ORACLE, for the batch. Same contract as the single-node row above: the general commit is
  // the reference implementation, so a union commit is correct exactly when it leaves that
  // reference nothing to find. A dropped branch or a handle written to the wrong slot shows up
  // here and essentially nowhere else.
  it('leaves the general commit nothing to do after a batched flush', () => {
    for (let index = 0; index < animTargets.length; index += 1)
      setNativeProps(animTargets[index], { opacity: 0.51 + index / 1000 });
    flushNativeProps();

    const clonesBefore = fabric.counts.clone;
    const completeRootBefore = fabric.counts.completeRoot;
    surface.commit();
    expect(fabric.counts.clone).toBe(clonesBefore);
    expect(fabric.counts.completeRoot).toBe(completeRootBefore);
  });

  it('publishes on its own at the microtask boundary, with no explicit flush', async () => {
    // The flush() calls everywhere above stand in for the task boundary; this row proves the
    // boundary is real. Without it the whole suite would pass against an engine that never
    // scheduled anything and only ever committed when a test asked it to.
    const completeRootBefore = fabric.counts.completeRoot;
    setNativeProps(animTargets[4], { opacity: 0.91 });
    expect(fabric.counts.completeRoot).toBe(completeRootBefore);

    await Promise.resolve();

    expect(fabric.counts.completeRoot).toBe(completeRootBefore + 1);
    expect(
      findByTestID(fabric.appRoot(), `row-${SCREENS - 1}-4`)?.props.opacity,
    ).toBe(0.91);
  });
});
