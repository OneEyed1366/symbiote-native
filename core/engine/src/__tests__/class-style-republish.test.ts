// pushClassStyle republishes a FRESH [classStyle, explicitStyle] array on every class/style write,
// so setProp's Object.is guard can never turn one away: without isAlreadyPublished, re-writing an
// UNCHANGED class still lands as a write AND marks the node dirty.
//
// Costs React / Vue / Svelte nothing — each diffs props before calling the engine — but Solid has
// no diff: a fine-grained effect re-runs whenever any signal it reads changes. Measured on device
// 2026-08-23 (examples/solid, after host-primitive lowering): selecting one row of 1 000 read
// WRITES 1001 and a 10.3 ms reconcile window against Fabric's unmoved 0/0/10 — a thousand-node
// dirty walk for two nodes' worth of change. Before lowering, the View component's splitProps/
// mergeProps memos absorbed it; the wrapper was acting as a memoization barrier.
//
// Asserted TWICE per case, because the two halves fail in opposite directions. `writes` proves the
// write was turned away; `nodesVisited` on a following commit proves the node was not MARKED — and
// that is the half that catches an over-eager guard, since a guard that swallowed a real change
// would leave `writes` looking correct while the screen silently kept the old value.
import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createSurface,
  readCommitProfile,
  registerRules,
  routeProp,
  type ISymbioteNode,
} from '../index';
import { takePropStats } from '../node';

installFabric();
const ROOT_TAG = 91;
const surface = createSurface(ROOT_TAG);

// Every case mounts its own node and commits it, so "the walk found nothing to do" is measured
// against a settled tree rather than against the initial mount.
//
// The node gets a CHILD, and that is load-bearing for the nodesVisited half: a node hanging
// directly off the container is looked at on every commit whether it is dirty or not, so it can
// never show a difference. The child is what the walk descends into when the parent is dirty and
// skips when it is clean.
function mountSettled(): ISymbioteNode {
  const node = createElement('RCTView');
  appendChild(node, createElement('RCTView'));
  surface.appendChild(node);
  surface.commit();
  return node;
}

interface IEffect {
  readonly writes: number;
  readonly visited: number;
}

function effectOf(action: () => void): IEffect {
  takePropStats();
  readCommitProfile();
  action();
  const writes = takePropStats().writes;
  surface.commit();
  return { writes, visited: readCommitProfile().nodesVisited };
}

describe('republishing an unchanged class or style', () => {
  it('neither writes nor dirties when the class string is unchanged', () => {
    registerRules([
      {
        tokens: ['row'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 4 },
      },
    ]);
    const node = mountSettled();
    routeProp(node, 'class', 'row');
    surface.commit();

    const settled = effectOf(() => {});
    expect(effectOf(() => routeProp(node, 'class', 'row'))).toEqual(settled);
    clearGlobalStyles();
  });

  it('still writes and dirties when the class string changes', () => {
    registerRules([
      {
        tokens: ['row'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 4 },
      },
      {
        tokens: ['row', 'sel'],
        specificity: [0, 2, 0],
        order: 1,
        style: { padding: 8 },
      },
    ]);
    const node = mountSettled();
    routeProp(node, 'class', 'row');
    surface.commit();

    const settled = effectOf(() => {});
    const changed = effectOf(() => routeProp(node, 'class', 'row sel'));
    expect(changed.writes).toBe(1);
    expect(changed.visited).toBeGreaterThan(settled.visited);
    clearGlobalStyles();
  });

  // The identity case an adapter hits constantly: a hoisted style constant (StyleSheet.create, a
  // module-level literal) handed back unchanged on every render.
  it('does not write again when the explicit style is the same reference', () => {
    const hoisted = { margin: 2 };
    const node = mountSettled();
    routeProp(node, 'style', hoisted);
    surface.commit();

    expect(effectOf(() => routeProp(node, 'style', hoisted)).writes).toBe(0);
  });

  // The restore path, and the whole reason the guard keys on the published ARRAY rather than on
  // the parts alone. setNativeProps writes node.props.style directly as a flattened OBJECT
  // (commit.ts), clobbering the declarative style; the next declarative write is what puts it back.
  // A parts-only guard would skip that write and leave the Animated frame on screen forever.
  it('writes again after something bypassed the parts and overwrote node.props.style', () => {
    const hoisted = { margin: 2 };
    const node = mountSettled();
    routeProp(node, 'style', hoisted);
    surface.commit();

    node.props.style = { margin: 2, opacity: 0.5 };

    expect(effectOf(() => routeProp(node, 'style', hoisted)).writes).toBe(1);
    expect(node.props.style).toEqual([undefined, hoisted]);
  });
});
