// Co-located Vue-driven test (ADR 0025) for useKeepAwake. See battery's
// use-low-power-mode.test.ts for the shared rationale.
//
// This file tests ONLY the composable's own lifecycle wiring (subscribe on mount, deactivate on
// unmount, listener/suppress option plumbing) — the native-call/state logic itself
// (activate/deactivate/addListener behavior, UnavailabilityError, tag defaulting) is core's job
// and is exhaustively covered by core/keep-awake.test.ts; re-asserting it here would just
// duplicate that coverage under a different mount path.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { useKeepAwake } from './index';

const ROOT_TAG = 9954;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const activateKeepAwakeAsyncMock = vi.fn(async (_tag: string) => undefined);
const removeSubscriptionMock = vi.fn();
const addListenerMock = vi.fn((..._args: unknown[]) => ({
  remove: removeSubscriptionMock,
}));
const deactivateKeepAwakeMock = vi.fn(async (_tag: string) => undefined);

// The native-call leaf is mocked rather than the `../../../core` barrel, so that the barrel
// stays REAL and the composable runs the real createKeepAwakeListenerAttachment (the unmount
// guard under test) while its addListener/subscription still land on the spies above.
vi.mock('../../../core/keep-awake', () => ({
  ExpoKeepAwakeTag: 'ExpoKeepAwakeDefaultTag',
  isAvailableAsync: async () => true,
  activateKeepAwakeAsync: (tag: string) => activateKeepAwakeAsyncMock(tag),
  addListener: (...args: unknown[]) => addListenerMock(...args),
  deactivateKeepAwake: (tag: string) => deactivateKeepAwakeMock(tag),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  activateKeepAwakeAsyncMock.mockClear();
  addListenerMock.mockClear();
  removeSubscriptionMock.mockClear();
  deactivateKeepAwakeMock.mockClear();
  activateKeepAwakeAsyncMock.mockResolvedValue(undefined);
  deactivateKeepAwakeMock.mockResolvedValue(undefined);
});

afterEach(() => unmount(ROOT_TAG));

type IKeepAwakeProbeOptions = {
  tag?: string;
  listener?: (event: unknown) => void;
  suppressDeactivateWarnings?: boolean;
};

function mountKeepAwake(options: IKeepAwakeProbeOptions = {}): void {
  const { tag, listener, suppressDeactivateWarnings } = options;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        useKeepAwake(tag, { listener, suppressDeactivateWarnings });
        return () => h('symbiote-text', {}, 'keep-awake');
      },
    }),
  );
}

describe('useKeepAwake (Vue)', () => {
  describe('Positive — tag resolution and native lifecycle wiring', () => {
    // why: a caller that doesn't name a tag must still get one — Vue has no useId equivalent,
    // so the composable falls back to its own monotonic counter instead of leaving it undefined.
    it('activates a default tag on mount', async () => {
      mountKeepAwake();

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );
      expect(typeof activateKeepAwakeAsyncMock.mock.calls[0][0]).toBe('string');
    });

    // why: a caller managing a named lock must have that exact tag reach core, not a
    // composable-generated default.
    it('activates the explicit tag when one is given', async () => {
      mountKeepAwake({ tag: 'custom-tag' });

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledWith('custom-tag'),
      );
    });

    // why: onUnmounted is the ONLY place a mounted lock gets released — if it doesn't fire, the
    // lock leaks for the app's lifetime.
    it('deactivates the same tag on unmount', async () => {
      mountKeepAwake({ tag: 'custom-tag' });
      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );

      unmount(ROOT_TAG);

      expect(deactivateKeepAwakeMock).toHaveBeenCalledWith('custom-tag');
    });

    // why: without an explicit listener, the composable must not wire one — a silently-attached
    // no-op listener would leak a native subscription nobody asked for.
    it('never touches addListener when no options are given', async () => {
      mountKeepAwake({ tag: 'custom-tag' });

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );
      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: options.listener is how a caller observes native keep-awake state changes — it must
    // be wired to the SAME tag that was just activated, once activation actually resolves.
    it('wires options.listener to addListener once activation resolves', async () => {
      const listener = vi.fn();

      mountKeepAwake({ tag: 'custom-tag', listener });

      await vi.waitFor(() =>
        expect(addListenerMock).toHaveBeenCalledWith('custom-tag', listener),
      );
    });
  });

  describe('Deliberately-swallowed native failures — the composable reports nothing back to the caller', () => {
    // why: the listener attach sits inside activate's `.then()`, which is skipped entirely on
    // rejection — a failed activation must never attach a listener for a lock that was never
    // actually acquired.
    it('does not register a listener when activateKeepAwakeAsync rejects', async () => {
      activateKeepAwakeAsyncMock.mockRejectedValueOnce(
        new Error('activation failed'),
      );
      const listener = vi.fn();

      mountKeepAwake({ tag: 'custom-tag', listener });

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );
      await tick();
      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: suppressDeactivateWarnings exists so a caller can opt out of the "deactivate failed"
    // warning upstream expo-keep-awake surfaces — the rejection must be swallowed, not become an
    // unhandled promise rejection.
    it('swallows a deactivation rejection when suppressDeactivateWarnings is set', async () => {
      deactivateKeepAwakeMock.mockRejectedValueOnce(
        new Error('deactivate failed'),
      );
      const unhandled = vi.fn();
      process.once('unhandledRejection', unhandled);

      mountKeepAwake({ tag: 'custom-tag', suppressDeactivateWarnings: true });
      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );
      unmount(ROOT_TAG);
      await tick();

      expect(unhandled).not.toHaveBeenCalled();
    });
  });

  describe('Teardown race — activation resolving after the component is gone', () => {
    // why: activation is async, so onUnmounted can run while activate() is still pending. A
    // listener registered at that point belongs to a component that no longer exists, and the
    // subscription that would remove it is created after the only teardown hook has already run.
    it('does not register a listener when the component unmounts before activation resolves', async () => {
      let resolveActivate: () => void = () => {};
      activateKeepAwakeAsyncMock.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveActivate = resolve;
          }),
      );
      const listener = vi.fn();

      mountKeepAwake({ tag: 'custom-tag', listener });
      await tick();
      unmount(ROOT_TAG);
      await tick();

      resolveActivate();
      await tick();

      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: the other half of the same leak — when activation wins the race, the subscription
    // exists and unmount is the only place left that can remove it.
    it('removes the listener subscription on unmount', async () => {
      const listener = vi.fn();

      mountKeepAwake({ tag: 'custom-tag', listener });
      await vi.waitFor(() => expect(addListenerMock).toHaveBeenCalledTimes(1));

      unmount(ROOT_TAG);

      expect(removeSubscriptionMock).toHaveBeenCalledTimes(1);
    });
  });
});
