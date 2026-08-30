// The seam that lets a tier-2 primitive's machine live on the engine node instead of inside a
// framework component (`.claude/rules/host-primitive-tier.md`). What makes it worth a file of its
// own is the teardown half: `removeChild` looks like the destroy signal and is not, because a
// framework may spell a MOVE as remove-then-reinsert. The reorder case below is the whole point —
// it is green either way if you only assert "removeChild tears down".
import { afterEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  hasHostBehaviors,
  insertBefore,
  registerHostBehavior,
  removeChild,
  type ISymbioteNode,
} from './index';

installFabric();
let nextRootTag = 9000;

// A view DISTINCT from the plain containers below. Reusing 'RCTView' for both made the first
// draft of the subtree test read as a failure: the row wrapper carried the behavior too, so the
// assertion could not tell "walked the subtree" from "matched the root".
const PRESSABLE = 'RCTImageView';

interface ILog {
  attached: ISymbioteNode[];
  detached: ISymbioteNode[];
}

function trackBehavior(component: string): ILog {
  const log: ILog = { attached: [], detached: [] };
  registerHostBehavior(component, {
    attach: node => log.attached.push(node),
    detach: node => log.detached.push(node),
  });
  return log;
}

function mount(): {
  surface: ReturnType<typeof createSurface>;
  root: ISymbioteNode;
} {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  surface.commit();
  return { surface, root };
}

afterEach(() => {
  clearHostBehaviors();
});

describe('host behavior registry', () => {
  it('stays off until something registers, and attaches only the registered tag', () => {
    expect(hasHostBehaviors()).toBe(false);

    const log = trackBehavior(PRESSABLE);
    expect(hasHostBehaviors()).toBe(true);

    const pressable = createElement(PRESSABLE);
    createElement('RCTText');

    expect(log.attached).toEqual([pressable]);
  });
});

describe('teardown', () => {
  it('does NOT tear down at removeChild — only the commit decides', () => {
    const log = trackBehavior(PRESSABLE);
    const { surface, root } = mount();
    const pressable = createElement(PRESSABLE);
    appendChild(root, pressable);
    surface.commit();

    removeChild(root, pressable);
    expect(log.detached, 'removal only nominates').toEqual([]);

    surface.commit();
    expect(log.detached).toEqual([pressable]);
  });

  // THE CASE THE COMMIT SWEEP EXISTS FOR. `solid-js/universal`'s replaceNode (universal.cjs:186)
  // is insertNode + removeNode, and reconcileArrays calls it at :157 for a node that IS in the new
  // array and is needed at a later index. Torn down at removeChild, that node returns to the tree
  // alive and machine-less: long-press stops working after certain reorders, device-only, nothing
  // red. Asserting on removeChild instead of on the commit passes here for the wrong reason.
  it('does NOT tear down a node removed and reinserted in the same tick', () => {
    const log = trackBehavior(PRESSABLE);
    const { surface, root } = mount();
    const first = createElement(PRESSABLE);
    const second = createElement(PRESSABLE);
    appendChild(root, first);
    appendChild(root, second);
    surface.commit();

    removeChild(root, first);
    insertBefore(root, first, second);
    surface.commit();

    expect(log.detached, 'a reorder is not a removal').toEqual([]);
    expect(root.children).toEqual([first, second]);
  });

  it('tears down the whole removed SUBTREE, not just the node named', () => {
    const log = trackBehavior(PRESSABLE);
    const { surface, root } = mount();
    // The benchmark row's shape: the pressable is NESTED, so a removal names the row and never
    // visits the machine underneath it.
    const row = createElement('RCTView');
    const nested = createElement(PRESSABLE);
    appendChild(row, nested);
    appendChild(root, row);
    surface.commit();

    removeChild(root, row);
    surface.commit();

    expect(log.detached).toEqual([nested]);
  });

  it('detaches a node once when it and its parent are both removed', () => {
    const log = trackBehavior(PRESSABLE);
    const { surface, root } = mount();
    const outer = createElement(PRESSABLE);
    const inner = createElement(PRESSABLE);
    appendChild(outer, inner);
    appendChild(root, outer);
    surface.commit();

    removeChild(outer, inner);
    removeChild(root, outer);
    surface.commit();

    // Insertion order of the candidate set: `inner` was nominated first, and by then it was
    // already unlinked from `outer`, so the sweep reaches it as its own root rather than through
    // the walk.
    expect(log.detached).toEqual([inner, outer]);
  });

  // Svelte parks LIVE nodes offscreen across commits — `detachFromParent`
  // (adapters/svelte/src/dom-shim/shim-node.ts) moves a node into a DocumentFragment with no
  // engine node, so it calls engineRemoveChild AND requestCommit while fully intending to bring it
  // back: a parked {#if} branch, each.js's destroy_effects, and boundary.js's move_effect while a
  // pending snippet shows, which returns only when async work resolves. So "still absent at the
  // next commit" is not proof of death either. The machine RESTARTS rather than survives — a
  // parked subtree is offscreen, nobody is mid-gesture in it, and teardown stays unconditional so
  // there is no leak mode.
  it('re-attaches a node the sweep tore down but the framework put back', () => {
    const log = trackBehavior(PRESSABLE);
    const { surface, root } = mount();
    const row = createElement('RCTView');
    const parked = createElement(PRESSABLE);
    appendChild(row, parked);
    appendChild(root, row);
    surface.commit();

    // Parked: unlinked, and a commit happens while it is away.
    removeChild(root, row);
    surface.commit();
    expect(log.detached).toEqual([parked]);

    // ...and brought back, same node identity, several commits later.
    surface.commit();
    appendChild(root, row);
    surface.commit();

    expect(log.attached.filter(node => node === parked)).toHaveLength(2);
  });

  it('sweeps on a no-op commit too, so a nomination cannot outlive its tick', () => {
    const log = trackBehavior(PRESSABLE);
    const { surface, root } = mount();
    const pressable = createElement(PRESSABLE);
    appendChild(root, pressable);
    surface.commit();

    removeChild(root, pressable);
    surface.commit();
    surface.commit();

    expect(log.detached, 'exactly once, not once per commit').toEqual([
      pressable,
    ]);
  });
});
