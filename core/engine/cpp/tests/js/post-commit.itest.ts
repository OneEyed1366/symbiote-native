// The post-commit seam (`post-commit.ts`, re-exported from the engine barrel) is public API for one
// reason: it is the only "a commit just reached completeRoot" signal that means the SAME thing under
// every adapter. React commits synchronously inside its own commit phase while Vue / Svelte /
// Angular schedule completeRoot on a microtask, so each framework's after-render hook fires at a
// different point relative to the native commit, and anything timing the commit path across adapters
// would be comparing four different quantities under one name.
//
// The unregister half is tested as hard as the register half: a hook belonging to a screen rather
// than to the process must be able to stop, or a mounted-and-gone consumer runs after every commit
// for the rest of the session and holds its whole closure alive.
//
// Here rather than in vitest because of the ordering case. "The hook runs AFTER completeRoot" used
// to be `fabric.counts.completeRoot` — the stand-in counting its own calls, which is true of the
// stand-in whatever the renderer does. The claim that matters is that by the time the hook runs,
// FABRIC ALREADY HOLDS THE NEW TREE, and only Fabric can say so.
//
// No Negative group: nothing here rejects anything — unregistering a hook that was never registered
// is defined to be a no-op, and that is the closest case to one.

import {
  appendChild,
  createElement,
  createSurface,
  registerPostCommit,
  setProp,
  unregisterPostCommit,
} from '@symbiote-native/engine';

import { describe, expect, findCommitted, it, report } from './harness';

const PROBE_ID = 'post-commit-host';

function mountHost() {
  const surface = createSurface(1);
  const host = createElement('RCTView');
  setProp(host, 'testID', PROBE_ID);
  surface.appendChild(host);
  surface.commit();
  return { surface, host };
}

function committedOpacity(): string | undefined {
  return findCommitted(one => one.props.testID === PROBE_ID)?.props.opacity;
}

describe('post-commit hooks', () => {
  it('runs a registered hook after a commit', () => {
    const { surface, host } = mountHost();
    let runs = 0;
    const hook = (): void => {
      runs += 1;
    };

    registerPostCommit(hook);
    setProp(host, 'opacity', 0.5);
    surface.commit();
    unregisterPostCommit(hook);

    expect(runs).toBeGreaterThan(0);
  });

  // why: the whole point of the seam. By the time it runs, the native commit has landed — so the
  // committed tree the hook reads already carries the new value, not the one it was replacing. A
  // hook that fired earlier would see the old tree and would be timing the mutation phase alone.
  it('runs the hook after Fabric already holds the new tree', () => {
    const { surface, host } = mountHost();
    let opacityAtHook: string | undefined = 'never ran';
    const hook = (): void => {
      opacityAtHook = committedOpacity();
    };

    registerPostCommit(hook);
    setProp(host, 'opacity', 0.5);
    surface.commit();
    unregisterPostCommit(hook);

    // Read back outside the hook too, so the case says "the hook saw the FINAL tree" rather than
    // "the hook saw something" — the two differ exactly when the hook runs a commit too early.
    expect(opacityAtHook).toBe(committedOpacity());
    expect(opacityAtHook).toBe('0.5');
  });

  it('stops running a hook once it is unregistered', () => {
    const { surface, host } = mountHost();
    let runs = 0;
    const hook = (): void => {
      runs += 1;
    };

    registerPostCommit(hook);
    setProp(host, 'opacity', 0.6);
    surface.commit();
    const runsWhileRegistered = runs;

    unregisterPostCommit(hook);
    appendChild(host, createElement('RCTView'));
    surface.commit();

    expect(runsWhileRegistered).toBeGreaterThan(0);
    expect(runs).toBe(runsWhileRegistered);
  });

  // why: an adapter unregisters on teardown without tracking whether it ever registered, so this
  // has to be safe. A throw here would surface as a crash during unmount.
  it('unregistering a hook that was never registered is a no-op', () => {
    const { surface, host } = mountHost();
    unregisterPostCommit(() => undefined);

    // And the next commit still works — the point is that the no-op left nothing broken behind,
    // which an assertion on the call alone would not show.
    setProp(host, 'opacity', 0.25);
    surface.commit();
    expect(committedOpacity()).toBe('0.25');
  });
});

report();
