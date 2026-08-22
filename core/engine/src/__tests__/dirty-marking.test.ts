// Co-located unit test for the dirty flag (`markDirty` in ../node.ts, the early exit in
// ../commit.ts). Two separate things are locked in here, and they fail in opposite directions:
//
//   1. The walk really does SKIP a clean subtree. Asserted through `readCommitProfile().
//      nodesVisited`, because a skip is invisible in the committed output - a correct engine and
//      a correct-but-slow engine produce byte-identical Fabric calls. Without this assertion the
//      optimisation can be reverted by accident and nothing goes red.
//   2. Every mutation entry point MARKS. This is the failure mode the flag introduces: forget one
//      mark and the screen silently keeps showing the old value - no crash, no error, nothing to
//      grep for. So each public mutator gets a row below proving its change survives to Fabric
//      through a commit that is otherwise entitled to skip the whole tree.
//
// Tests run in file order against ONE shared fabric/surface (installFabric installs a
// process-global slot), so each block builds its own subtree rather than sharing one.

import { beforeAll, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  insertBefore,
  readCommitProfile,
  removeChild,
  setEventListener,
  setNativeProps,
  setProp,
  setText,
  type ISymbioteNode,
} from '../index';

const fabric = installFabric();
const ROOT_TAG = 77;
const surface = createSurface(ROOT_TAG);

// Two sibling branches of four nodes each, so "the walk skipped the other branch" is a
// measurable difference rather than a rounding error.
const BRANCH_DEPTH = 4;

function makeBranch(testID: string): {
  root: ISymbioteNode;
  leaf: ISymbioteNode;
} {
  const root = createElement('RCTView');
  setProp(root, 'testID', testID);
  let leaf = root;
  for (let depth = 1; depth < BRANCH_DEPTH; depth += 1) {
    const child = createElement('RCTView');
    setProp(child, 'testID', `${testID}-${depth}`);
    appendChild(leaf, child);
    leaf = child;
  }
  return { root, leaf };
}

const touched = makeBranch('touched');
const untouched = makeBranch('untouched');

function findByTestID(node: IFakeNode, testID: string): IFakeNode | undefined {
  if (node.props.testID === testID) return node;
  for (const child of node.children) {
    const hit = findByTestID(child, testID);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

// Commit, then report how many nodes the walk actually looked at. Reading the profile zeroes it,
// so every call below measures exactly one commit.
function commitAndCountVisits(): number {
  readCommitProfile();
  surface.commit();
  return readCommitProfile().nodesVisited;
}

describe('the commit walk skips a subtree nothing touched', () => {
  let untouchedHandleAtMount: IFakeNode;
  let mountVisits = 0;

  beforeAll(() => {
    surface.appendChild(touched.root);
    surface.appendChild(untouched.root);
    mountVisits = commitAndCountVisits();
    untouchedHandleAtMount = findByTestID(fabric.appRoot(), 'untouched')!;
  });

  it('visits every node on the first mount', () => {
    // Nothing is committed yet, so nothing can be skipped: both branches plus the synthetic
    // AppContainer root. This is the number the assertions below are a reduction of.
    expect(mountVisits).toBe(BRANCH_DEPTH * 2 + 1);
  });

  it('walks only the marked branch when one leaf prop changes', () => {
    setProp(touched.leaf, 'opacity', 0.5);
    // The container, both of its top-level children (each checked, one skipped outright), and the
    // marked branch's own chain. The untouched branch's three descendants are never reached.
    expect(commitAndCountVisits()).toBe(1 + 2 + (BRANCH_DEPTH - 1));
  });

  it('reuses the untouched branch handle by reference across that commit', () => {
    expect(findByTestID(fabric.appRoot(), 'untouched')).toBe(
      untouchedHandleAtMount,
    );
  });

  it('looks at almost nothing when a commit mutates nothing at all', () => {
    // The container is dirtied at the commit entry point by design, so it and its two immediate
    // children are checked; both children bail out and the walk stops there.
    expect(commitAndCountVisits()).toBe(3);
  });
});

// Each row mutates a node buried under a branch that a skipping walk would otherwise never reach,
// then proves the change arrived. A missing markDirty makes exactly one of these go red.
describe('every mutation entry point marks its subtree dirty', () => {
  const host = createElement('RCTView');
  setProp(host, 'testID', 'host');
  const nest = createElement('RCTView');
  setProp(nest, 'testID', 'nest');
  appendChild(host, nest);

  const label = createElement('RCTText', true);
  setProp(label, 'testID', 'label');
  const rawText = createElement('RCTRawText');
  setText(rawText, 'before');
  appendChild(label, rawText);
  appendChild(nest, label);

  beforeAll(() => {
    surface.appendChild(host);
    surface.commit();
  });

  function committedNest(): IFakeNode {
    return findByTestID(fabric.appRoot(), 'nest')!;
  }

  it('setProp reaches Fabric', () => {
    setProp(nest, 'opacity', 0.25);
    surface.commit();
    expect(committedNest().props.opacity).toBe(0.25);
  });

  it('setText reaches Fabric', () => {
    setText(rawText, 'after');
    surface.commit();
    expect(
      findByTestID(fabric.appRoot(), 'label')!.children[0].props.text,
    ).toBe('after');
  });

  it('setEventListener("layout") raises the onLayout prop', () => {
    setEventListener(nest, 'layout', () => undefined);
    surface.commit();
    expect(committedNest().props.onLayout).toBe(true);
  });

  it('appendChild reaches Fabric', () => {
    const added = createElement('RCTView');
    setProp(added, 'testID', 'appended');
    appendChild(nest, added);
    surface.commit();
    expect(findByTestID(fabric.appRoot(), 'appended')).toBeDefined();
  });

  it('insertBefore reaches Fabric', () => {
    const inserted = createElement('RCTView');
    setProp(inserted, 'testID', 'inserted');
    insertBefore(nest, inserted, nest.children[0]);
    surface.commit();
    expect(committedNest().children[0].props.testID).toBe('inserted');
  });

  it('removeChild reaches Fabric', () => {
    removeChild(nest, nest.children[0]);
    surface.commit();
    expect(committedNest().children[0].props.testID).not.toBe('inserted');
  });

  it('setNativeProps reaches Fabric', () => {
    setNativeProps(nest, { opacity: 0.75 });
    expect(committedNest().props.opacity).toBe(0.75);
  });

  it('a surface-level removal reaches Fabric', () => {
    surface.removeChild(host);
    surface.commit();
    expect(findByTestID(fabric.appRoot(), 'host')).toBeUndefined();
  });
});

// An empty RCTRawText is dropped at commit exactly like an anchor (isEmptyRawText in ../node.ts),
// so it never reaches reconcile and nothing but renderableChildren can clear its dirty flag. Left
// permanently dirty, the setText that finally gives it content would stop at the node itself and
// never mark the parent - markDirty halts at the first already-dirty ancestor - so the text would
// never paint and nothing would go red anywhere else.
describe('an empty raw text that gains content still reaches Fabric', () => {
  const label = createElement('RCTText', true);
  setProp(label, 'testID', 'empty-label');
  const rawText = createElement('RCTRawText');
  setText(rawText, '');
  appendChild(label, rawText);

  beforeAll(() => {
    surface.appendChild(label);
    surface.commit();
  });

  it('commits no child while the text is empty', () => {
    expect(
      findByTestID(fabric.appRoot(), 'empty-label')!.children,
    ).toHaveLength(0);
  });

  it('paints the text once setText gives it content', () => {
    setText(rawText, 'now visible');
    surface.commit();
    expect(
      findByTestID(fabric.appRoot(), 'empty-label')!.children[0].props.text,
    ).toBe('now visible');
  });
});

// The other half of the flag: a write that changes NOTHING must not dirty anything either. Every
// adapter re-pushes props it did not change (React hands a fresh onLayout closure on every render,
// which raises the same `onLayout: true` flag; Angular's host bag pushed 90 000 `undefined` writes
// over absent keys on one benchmark screen), and each of those marks used to strip a whole subtree
// of its early exit for a commit that then produced no Fabric call at all.
//
// Counted relative to an IDLE commit rather than against an absolute number: this file shares one
// surface across every describe above, so how many nodes a minimal walk touches depends on what
// those left mounted. `idle` is that floor, measured immediately before each case.
describe('setProp is a no-op when the value did not change', () => {
  const host = createElement('RCTView');
  setProp(host, 'testID', 'noop-host');
  const leaf = createElement('RCTView');
  setProp(leaf, 'testID', 'noop-leaf');
  appendChild(host, leaf);

  const STYLE = { opacity: 0.5 };

  beforeAll(() => {
    surface.appendChild(host);
    setProp(leaf, 'style', STYLE);
    surface.commit();
  });

  function idleVisits(): number {
    return commitAndCountVisits();
  }

  it('re-writing an identical value leaves the subtree clean', () => {
    const idle = idleVisits();
    setProp(leaf, 'style', STYLE);
    setProp(leaf, 'testID', 'noop-leaf');
    expect(commitAndCountVisits()).toBe(idle);
  });

  it('writing undefined over a key that is not there leaves the subtree clean', () => {
    const idle = idleVisits();
    setProp(leaf, 'neverSet', undefined);
    expect(commitAndCountVisits()).toBe(idle);
  });

  it('still marks - and still reaches Fabric - when the value really changes', () => {
    const idle = idleVisits();
    setProp(leaf, 'accessibilityLabel', 'changed');
    expect(commitAndCountVisits()).toBeGreaterThan(idle);
    expect(
      findByTestID(fabric.appRoot(), 'noop-leaf')!.props.accessibilityLabel,
    ).toBe('changed');
  });

  // Object.hasOwn, not `node.props[key] === undefined`: setNativeProps writes node.props directly
  // and can leave a key PRESENT holding undefined. Deleting that key changes the record's shape, so
  // it is a real write, not a no-op.
  it('deleting a key that is present holding undefined is a real write', () => {
    setNativeProps(leaf, { plantedUndefined: undefined });
    readCommitProfile();
    setProp(leaf, 'plantedUndefined', undefined);
    const profile = readCommitProfile();
    expect(profile.propWrites).toBe(1);
    expect(profile.propNoops).toBe(0);
    expect(Object.hasOwn(leaf.props, 'plantedUndefined')).toBe(false);
  });

  // The case every adapter hits on every render: a fresh layout closure re-raises the SAME
  // `onLayout: true` flag. The listener swaps (listeners never mark by design), the flag does not,
  // so nothing may be dirtied.
  it('re-registering a layout listener does not re-dirty the node', () => {
    setEventListener(leaf, 'layout', () => undefined);
    surface.commit();
    const idle = idleVisits();
    setEventListener(leaf, 'layout', () => undefined);
    expect(commitAndCountVisits()).toBe(idle);
    expect(findByTestID(fabric.appRoot(), 'noop-leaf')!.props.onLayout).toBe(
      true,
    );
  });

  it('counts the writes it turned away', () => {
    readCommitProfile();
    setProp(leaf, 'testID', 'noop-leaf'); // identical -> no-op
    setProp(leaf, 'alsoNeverSet', undefined); // absent -> no-op
    setProp(leaf, 'testID', 'renamed'); // real write
    const profile = readCommitProfile();
    expect(profile.propWrites).toBe(1);
    expect(profile.propNoops).toBe(2);
  });
});

// setText carries the same no-op guard as setProp, and here `Object.is` is a real value comparison
// rather than the reference check it degrades to for a style object - so an unchanged LABEL, which
// is what most rows of a re-rendered list hand back, genuinely stops marking.
describe('setText is a no-op when the text did not change', () => {
  const host = createElement('RCTView');
  setProp(host, 'testID', 'text-noop-host');
  const label = createElement('RCTText', true);
  setProp(label, 'testID', 'text-noop-label');
  const rawText = createElement('RCTRawText');
  setText(rawText, 'steady');
  appendChild(label, rawText);
  appendChild(host, label);

  beforeAll(() => {
    surface.appendChild(host);
    surface.commit();
  });

  it('re-writing the identical string leaves the subtree clean', () => {
    const idle = commitAndCountVisits();
    setText(rawText, 'steady');
    expect(commitAndCountVisits()).toBe(idle);
  });

  it('still marks - and still reaches Fabric - when the string really changes', () => {
    const idle = commitAndCountVisits();
    setText(rawText, 'moved');
    expect(commitAndCountVisits()).toBeGreaterThan(idle);
    expect(
      findByTestID(fabric.appRoot(), 'text-noop-label')!.children[0].props.text,
    ).toBe('moved');
  });

  it('counts the write it turned away', () => {
    readCommitProfile();
    setText(rawText, 'moved'); // identical -> no-op
    setText(rawText, 'again'); // real write
    const profile = readCommitProfile();
    expect(profile.propWrites).toBe(1);
    expect(profile.propNoops).toBe(1);
  });
});

// The props fast lane (`propsDirty` in ../node.ts, the branch in ../commit.ts's reconcile). Same
// shape of problem as the subtree skip above and the same reason it needs its own assertions:
// reusing the mirror's payload by reference and rebuilding a byte-identical one emit IDENTICAL
// Fabric calls, so nothing in the committed output can tell a working fast lane from one that was
// reverted by accident. Only the counters can.
//
// What it locks in: on the clone-bubble path from a changed leaf to the root, every ancestor
// re-clones (a persistent parent points at specific child handles) but NONE of them rebuilds its
// own Fabric props - the mutation API already recorded that nobody wrote a prop there.
describe('the clone-bubble reuses each ancestor payload instead of rebuilding it', () => {
  const CHAIN_DEPTH = 4;
  const chain: ISymbioteNode[] = [];

  beforeAll(() => {
    let parent: ISymbioteNode | undefined;
    for (let depth = 0; depth < CHAIN_DEPTH; depth += 1) {
      const node = createElement('RCTView');
      setProp(node, 'testID', `bubble-${depth}`);
      if (parent !== undefined) appendChild(parent, node);
      chain.push(node);
      parent = node;
    }
    surface.appendChild(chain[0]);
    surface.commit();
  });

  function commitAndReadProps(): { built: number; reused: number } {
    readCommitProfile();
    surface.commit();
    const profile = readCommitProfile();
    return { built: profile.propsBuilt, reused: profile.propsReused };
  }

  it('rebuilds exactly the node that was written, and reuses every ancestor', () => {
    setProp(chain[CHAIN_DEPTH - 1], 'opacity', 0.5);
    const { built, reused } = commitAndReadProps();
    // One rebuild: the leaf. The reuses are the synthetic AppContainer plus the three ancestors
    // between it and the leaf. Every other top-level branch early-exits and reaches neither
    // counter. A leaf change is therefore ONE payload build no matter how deep the tree is - that
    // is the whole claim.
    expect(built).toBe(1);
    expect(reused).toBe(1 + (CHAIN_DEPTH - 1));
  });

  it('still delivers the written value to Fabric', () => {
    expect(
      findByTestID(fabric.appRoot(), `bubble-${CHAIN_DEPTH - 1}`)!.props
        .opacity,
    ).toBe(0.5);
  });

  it('builds nothing at all when a commit writes no props', () => {
    const { built, reused } = commitAndReadProps();
    expect(built).toBe(0);
    // The container alone: it is dirtied at every commit entry by design (its parent chain can
    // never reach it), and before the fast lane existed it rebuilt and deep-compared its payload
    // on every single commit, including no-op ones.
    expect(reused).toBe(1);
  });

  it('rebuilds a node whose props changed via setNativeProps, not just via setProp', () => {
    // setNativeProps writes node.props directly and owes markPropsDirty rather than markDirty:
    // with only the subtree mark it would take the reuse lane and the Animated frame would be
    // silently dropped. Committing happens inside setNativeProps, so the counters are read around
    // the call itself.
    readCommitProfile();
    setNativeProps(chain[CHAIN_DEPTH - 1], { opacity: 0.9 });
    expect(readCommitProfile().propsBuilt).toBe(1);
    expect(
      findByTestID(fabric.appRoot(), `bubble-${CHAIN_DEPTH - 1}`)!.props
        .opacity,
    ).toBe(0.9);
  });

  it('rebuilds a node whose text changed', () => {
    const label = createElement('RCTText', true);
    setProp(label, 'testID', 'bubble-label');
    const rawText = createElement('RCTRawText');
    setText(rawText, 'before');
    appendChild(label, rawText);
    appendChild(chain[CHAIN_DEPTH - 1], label);
    surface.commit();

    readCommitProfile();
    setText(rawText, 'after');
    surface.commit();
    // The raw text rebuilds; the label above it and the whole chain to the root reuse.
    expect(readCommitProfile().propsBuilt).toBe(1);
    expect(
      findByTestID(fabric.appRoot(), 'bubble-label')!.children[0].props.text,
    ).toBe('after');
  });
});
