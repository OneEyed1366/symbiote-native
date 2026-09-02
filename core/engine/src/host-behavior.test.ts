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
  setProp,
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

// The half `attach` cannot do. A behavior whose setup needs a committed Fabric tag — a view command
// for `autoFocus`, a native Animated binding, an event attach — cannot run at `attach`, because
// that fires inside `createElement` with the node holding its component and nothing else. React
// would hide this: it commits synchronously, so such code works there by accident and no-ops
// silently on Vue, Solid and Angular, which commit a tick later.
describe('attachAfterCommit', () => {
  interface IDeferredLog extends ILog {
    afterCommit: ISymbioteNode[];
  }

  function trackDeferred(component: string): IDeferredLog {
    const log: IDeferredLog = { attached: [], detached: [], afterCommit: [] };
    registerHostBehavior(component, {
      attach: node => log.attached.push(node),
      attachAfterCommit: node => log.afterCommit.push(node),
      detach: node => log.detached.push(node),
    });
    return log;
  }

  it('does not run at attach, and runs on the commit that lands the node', () => {
    const log = trackDeferred(PRESSABLE);
    const { surface, root } = mount();
    const pressable = createElement(PRESSABLE);

    // The control, and it is the whole test: `attach` has ALREADY fired here. Without asserting
    // that, an `afterCommit` still empty two lines down could equally mean the behavior never
    // attached at all, and the case would pass against a registry that does nothing.
    expect(log.attached, 'attach fires at createElement').toEqual([pressable]);
    expect(log.afterCommit, 'nothing committed yet').toEqual([]);

    appendChild(root, pressable);
    surface.commit();

    expect(log.afterCommit).toEqual([pressable]);
  });

  // The later commits must be REAL ones. Written first with three bare `surface.commit()` calls,
  // this passed against a drain that never removed anything from its pending set — because commits
  // two and three changed nothing, and `commitContainer` returns on `!result.changed` ABOVE the
  // drain, so no second drain ever happened (`engine-mutations-must-mark-dirty.md`, "a no-op commit
  // fires NO post-commit hook"). A test of "runs once" that never runs the drain twice is vacuous.
  it('runs once, not once per later commit', () => {
    const log = trackDeferred(PRESSABLE);
    const { surface, root } = mount();
    const pressable = createElement(PRESSABLE);
    appendChild(root, pressable);
    surface.commit();

    for (const nativeID of ['second', 'third']) {
      setProp(pressable, 'nativeID', nativeID);
      surface.commit();
    }

    expect(log.afterCommit).toEqual([pressable]);
  });

  // The leak this exists to prevent: a node built and thrown away inside one tick never reaches
  // Fabric, so a drain must not hand its behavior a node that is already dead.
  it('never runs for a node torn down before its first commit', () => {
    const log = trackDeferred(PRESSABLE);
    const { surface, root } = mount();
    const pressable = createElement(PRESSABLE);
    appendChild(root, pressable);
    removeChild(root, pressable);
    surface.commit();

    expect(log.detached).toEqual([pressable]);
    expect(log.afterCommit).toEqual([]);
  });

  // `attach` and `attachAfterCommit` are a PAIR. A behavior that splits its setup across the two
  // comes back half-initialised if a restart re-arms only one — and Svelte parks live nodes across
  // commits routinely, so a restart is an ordinary event, not an edge case.
  it('re-arms with attach when a parked node comes back', () => {
    const log = trackDeferred(PRESSABLE);
    const { surface, root } = mount();
    const row = createElement('RCTView');
    const parked = createElement(PRESSABLE);
    appendChild(row, parked);
    appendChild(root, row);
    surface.commit();
    expect(log.afterCommit).toEqual([parked]);

    removeChild(root, row);
    surface.commit();
    expect(log.detached).toEqual([parked]);

    appendChild(root, row);
    surface.commit();

    expect(log.attached.filter(node => node === parked)).toHaveLength(2);
    expect(
      log.afterCommit.filter(node => node === parked),
      'the deferred half restarts with the eager one',
    ).toHaveLength(2);
  });
});

// The RECURRING beat, for a behavior whose contract is driven by a PROP rather than by an event.
// A controlled TextInput is the case: RN commands the text back down when the app's `value`
// diverges from what native last reported, and in a component the render is what re-runs that
// comparison. A lowered element has no render, so the commit is the only equivalent.
describe('afterCommit', () => {
  interface IRecurringLog extends ILog {
    order: string[];
    beats: ISymbioteNode[];
  }

  function trackRecurring(component: string): IRecurringLog {
    const log: IRecurringLog = {
      attached: [],
      detached: [],
      order: [],
      beats: [],
    };
    registerHostBehavior(component, {
      attach: node => log.attached.push(node),
      attachAfterCommit: () => log.order.push('attachAfterCommit'),
      afterCommit: node => {
        log.order.push('afterCommit');
        log.beats.push(node);
      },
      detach: node => log.detached.push(node),
    });
    return log;
  }

  it('runs on every commit, not once', () => {
    const log = trackRecurring(PRESSABLE);
    const { surface, root } = mount();
    const node = createElement(PRESSABLE);
    appendChild(root, node);
    surface.commit();

    // Real commits, not bare ones: `commitContainer` returns on `!result.changed` above the drain,
    // so three no-op commits would exercise a single beat and the test would pass on a hook that
    // only ever fired once.
    for (const nativeID of ['second', 'third']) {
      setProp(node, 'nativeID', nativeID);
      surface.commit();
    }

    expect(log.beats).toEqual([node, node, node]);
  });

  // The ordering is load-bearing on the FIRST commit, where a node carrying both hooks is drained
  // by both: `attachAfterCommit` seeds the mirrors that `afterCommit` compares against. Reversed,
  // the first beat compares against nothing and commands a redundant write down to native.
  it('runs AFTER attachAfterCommit on the first commit', () => {
    const log = trackRecurring(PRESSABLE);
    const { surface, root } = mount();
    appendChild(root, createElement(PRESSABLE));
    surface.commit();

    expect(log.order).toEqual(['attachAfterCommit', 'afterCommit']);
  });

  // Unlike a missed deferral, forgetting this one has a visible consequence: the behavior would be
  // asked to reconcile props against a subtree that has left the tree, on every commit, forever.
  it('stops beating once the node is torn down', () => {
    const log = trackRecurring(PRESSABLE);
    const { surface, root } = mount();
    const node = createElement(PRESSABLE);
    appendChild(root, node);
    surface.commit();
    expect(log.beats).toHaveLength(1);

    removeChild(root, node);
    surface.commit();
    expect(log.detached).toEqual([node]);

    setProp(root, 'nativeID', 'after-teardown');
    surface.commit();

    expect(log.beats, 'no beat after the teardown commit').toHaveLength(1);
  });
});
