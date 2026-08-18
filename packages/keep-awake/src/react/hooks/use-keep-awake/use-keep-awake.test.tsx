// Co-located React-driven test (ADR 0025) for useKeepAwake. See battery's
// use-low-power-mode.test.tsx for the shared rationale (mocks core's own native calls, not
// expo-modules-core internals).
//
// This file tests ONLY the hook's own lifecycle wiring (subscribe on mount, deactivate on
// unmount, listener/suppress option plumbing, the unmount race guard) — the native-call/state
// logic itself (activate/deactivate/addListener behavior, UnavailabilityError, tag defaulting)
// is core's job and is exhaustively covered by core/keep-awake.test.ts; re-asserting it here
// would just duplicate that coverage under a different mount path.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useKeepAwake } from './index';

const {
  activateKeepAwakeAsync,
  addListener,
  removeSubscription,
  deactivateKeepAwake,
} = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    activateKeepAwakeAsync: vi.fn(async (_tag: string) => undefined),
    addListener: vi.fn((..._args: unknown[]) => ({ remove })),
    removeSubscription: remove,
    deactivateKeepAwake: vi.fn(async (_tag: string) => undefined),
  };
});

// The native-call leaf is mocked rather than the `../../../core` barrel, so that the barrel
// stays REAL and the hook runs the real createKeepAwakeListenerAttachment (the unmount guard
// under test) while its addListener/subscription still land on the spies above.
vi.mock('../../../core/keep-awake', () => ({
  ExpoKeepAwakeTag: 'ExpoKeepAwakeDefaultTag',
  isAvailableAsync: async () => true,
  activateKeepAwakeAsync,
  addListener,
  deactivateKeepAwake,
}));

const ROOT_TAG = 954;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function Probe({
  tag,
  listener,
  suppressDeactivateWarnings,
}: {
  tag?: string;
  listener?: (event: unknown) => void;
  suppressDeactivateWarnings?: boolean;
}): ReactElement {
  useKeepAwake(tag, { listener, suppressDeactivateWarnings });
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  activateKeepAwakeAsync.mockResolvedValue(undefined);
  deactivateKeepAwake.mockResolvedValue(undefined);
});

afterEach(() => unmount(ROOT_TAG));

describe('useKeepAwake', () => {
  describe('Positive — tag resolution and native lifecycle wiring', () => {
    // why: a caller that doesn't name a tag must still get one — React's useId is what keeps
    // concurrent unnamed callers from clobbering each other's lock.
    it('activates a default tag on mount', async () => {
      mount(ROOT_TAG, createElement(Probe));

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1),
      );
      expect(typeof activateKeepAwakeAsync.mock.calls[0][0]).toBe('string');
    });

    // why: a caller managing a named lock must have that exact tag reach core, not a
    // hook-generated default.
    it('activates the explicit tag when one is given', async () => {
      mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag' }));

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsync).toHaveBeenCalledWith('custom-tag'),
      );
    });

    // why: the effect's cleanup is the ONLY place a mounted lock gets released — if it doesn't
    // fire on unmount, the lock leaks for the app's lifetime.
    it('deactivates the same tag on unmount', async () => {
      mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag' }));
      await vi.waitFor(() =>
        expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1),
      );

      unmount(ROOT_TAG);

      expect(deactivateKeepAwake).toHaveBeenCalledWith('custom-tag');
    });

    // why: without an explicit listener, the hook must not wire one — a silently-attached no-op
    // listener would leak a native subscription nobody asked for.
    it('never touches addListener when no options are given', async () => {
      mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag' }));

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1),
      );
      expect(addListener).not.toHaveBeenCalled();
    });

    // why: options.listener is how a caller observes native keep-awake state changes — it must
    // be wired to the SAME tag that was just activated, once activation actually resolves.
    it('wires options.listener to addListener once activation resolves', async () => {
      const listener = vi.fn();

      mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag', listener }));

      await vi.waitFor(() =>
        expect(addListener).toHaveBeenCalledWith('custom-tag', listener),
      );
    });
  });

  describe('Teardown race — activation resolving after the component is gone', () => {
    // why: activation is async, so the effect cleanup can run while activate() is still pending.
    // A listener registered at that point belongs to a component that no longer exists, and the
    // subscription that would remove it is created after the only cleanup has already run.
    it('does not register a listener when the component unmounts before activation resolves', async () => {
      let resolveActivate: () => void = () => {};
      activateKeepAwakeAsync.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveActivate = resolve;
          }),
      );
      const listener = vi.fn();

      mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag', listener }));
      await vi.waitFor(() =>
        expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1),
      );

      unmount(ROOT_TAG);
      resolveActivate();
      await tick();

      expect(addListener).not.toHaveBeenCalled();
    });

    // why: the other half of the same leak — when activation wins the race, the subscription
    // exists and the effect cleanup is the only place left that can remove it.
    it('removes the listener subscription on unmount', async () => {
      const listener = vi.fn();

      mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag', listener }));
      await vi.waitFor(() => expect(addListener).toHaveBeenCalledTimes(1));

      unmount(ROOT_TAG);

      expect(removeSubscription).toHaveBeenCalledTimes(1);
    });
  });

  describe('Deliberately-swallowed native failures — the hook reports nothing back to the caller', () => {
    // why: the listener attach sits inside activate's `.then()`, which is skipped entirely on
    // rejection — a failed activation must never attach a listener for a lock that was never
    // actually acquired.
    it('does not register a listener when activateKeepAwakeAsync rejects', async () => {
      activateKeepAwakeAsync.mockRejectedValueOnce(
        new Error('activation failed'),
      );
      const listener = vi.fn();

      mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag', listener }));

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1),
      );
      await tick();
      expect(addListener).not.toHaveBeenCalled();
    });

    // why: suppressDeactivateWarnings exists so a caller can opt out of the "deactivate failed"
    // warning upstream expo-keep-awake surfaces — the rejection must be swallowed, not become an
    // unhandled promise rejection.
    it('swallows a deactivation rejection when suppressDeactivateWarnings is set', async () => {
      deactivateKeepAwake.mockRejectedValueOnce(new Error('deactivate failed'));
      const unhandled = vi.fn();
      process.once('unhandledRejection', unhandled);

      mount(
        ROOT_TAG,
        createElement(Probe, {
          tag: 'custom-tag',
          suppressDeactivateWarnings: true,
        }),
      );
      await vi.waitFor(() =>
        expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1),
      );
      unmount(ROOT_TAG);
      await tick();

      expect(unhandled).not.toHaveBeenCalled();
    });
  });
});
