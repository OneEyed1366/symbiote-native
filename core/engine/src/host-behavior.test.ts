// The seam letting a tier-2 primitive's machine live on the engine node instead of a framework
// component. Worth its own file for the teardown half: `removeChild` looks like the destroy
// signal and isn't, since a framework may spell a MOVE as remove-then-reinsert.
import { afterEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  hasHostBehaviors,
  insertBefore,
  registerHostBehavior,
  removeChild,
  setEventListener,
  setProp,
  type ISymbioteNode,
} from './index';
// The seam: a node's children live in the HOST, not in a field (`host-access.ts`).
import { childrenOf } from './host-access';

// A RECORDING host: nothing here reads a committed tree.
installRecordingFabric();
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

  // The case the commit sweep exists for: solid-js/universal's replaceNode is insertNode +
  // removeNode for a node still needed at a later index. Torn down at removeChild, that node
  // returns alive and machine-less — long-press silently stops working after certain reorders.
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
    expect(childrenOf(root)).toEqual([first, second]);
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

  // Svelte parks LIVE nodes offscreen across commits (a parked {#if} branch, an async snippet),
  // fully intending to bring them back — so "still absent at the next commit" isn't proof of
  // death. The machine RESTARTS rather than survives; teardown stays unconditional, no leak mode.
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

  // why: the framework may bring back an INTERIOR node of a removed subtree, not the root it
  // named — so whether a node re-arms cannot depend on being the root the sweep was handed.

  // A guard on what the sweep's walk may narrow to: any node with a behavior anywhere beneath it
  // must carry the mark that makes its insert walk.
  it('re-arms a behavior under an interior node the framework brings back alone', () => {
    const log = trackBehavior(PRESSABLE);
    const { surface, root } = mount();
    const outer = createElement('RCTView');
    const inner = createElement('RCTView');
    const machine = createElement(PRESSABLE);
    appendChild(inner, machine);
    appendChild(outer, inner);
    appendChild(root, outer);
    surface.commit();

    // The removal names the OUTER node; the sweep never hears about `inner`.
    removeChild(root, outer);
    surface.commit();
    expect(log.detached).toEqual([machine]);

    // And what comes back is `inner`, on its own, somewhere else.
    appendChild(root, inner);
    surface.commit();

    expect(log.attached.filter(node => node === machine)).toHaveLength(2);
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

// The half `attach` cannot do: setup needing a committed Fabric tag can't run at `attach`, which
// fires inside createElement with the node holding only its component. React hides this by
// committing synchronously; Vue/Solid/Angular commit a tick later and would no-op silently.
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

  // The later commits must be REAL ones: a no-op commit fires no post-commit hook at all
  // (commitContainer returns above the drain), so bare surface.commit() calls would make "runs
  // once" vacuous — it would pass even if the drain never ran twice.
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

// The RECURRING beat, for a behavior driven by a PROP rather than an event: a controlled
// TextInput's render re-runs the value comparison in a component, and a tag has no render, so the
// commit is the only equivalent.
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

describe('onOwnedListenerChange', () => {
  // The gap it fills: a behavior can owe payload work to a listener's mere presence, and a
  // listener flip changes no payload by itself — so the commit after it is a no-op and
  // afterCommit is exactly the hook that can't see this.
  interface IFlipLog extends ILog {
    flips: Array<{ name: string; wired: boolean }>;
  }

  function trackFlips(component: string): IFlipLog {
    const log: IFlipLog = { attached: [], detached: [], flips: [] };
    registerHostBehavior(component, {
      ownedListeners: ['load'],
      attach: node => log.attached.push(node),
      detach: node => log.detached.push(node),
      onOwnedListenerChange: (_node, name, wired) => {
        log.flips.push({ name, wired });
      },
    });
    return log;
  }

  it('reports the wire and the unwire, and nothing in between', () => {
    const log = trackFlips(PRESSABLE);
    const { root } = mount();
    const node = createElement(PRESSABLE);
    appendChild(root, node);

    setEventListener(node, 'load', () => {});
    expect(log.flips).toEqual([{ name: 'load', wired: true }]);

    // A fresh closure for the same name, what a framework hands over nearly every render.
    // Notifying here would put a per-render callback on a per-mount seam, re-dirtying the subtree
    // every render — why node.listeners doesn't mark dirty at all.
    setEventListener(node, 'load', () => {});
    setEventListener(node, 'load', () => {});
    expect(log.flips).toHaveLength(1);

    setEventListener(node, 'load', undefined);
    expect(log.flips).toEqual([
      { name: 'load', wired: true },
      { name: 'load', wired: false },
    ]);
  });

  it('stays silent for a name the behavior does not own', () => {
    const log = trackFlips(PRESSABLE);
    const { root } = mount();
    const node = createElement(PRESSABLE);
    appendChild(root, node);

    // A real ViewConfig event on this component, and not in `ownedListeners` — so it takes the
    // ordinary path into `node.listeners` and this seam must not see it.
    setEventListener(node, 'error', () => {});
    expect(log.flips).toEqual([]);
    expect(node.listeners?.get('error')).toBeDefined();
  });
});
