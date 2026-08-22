// Co-located Solid-driven test for createKeepAwake, the Solid twin of
// vue/composables/use-keep-awake's own test — same scenario list, driven through `createRoot` + an
// explicit `dispose` instead of mount/unmount, because this primitive renders nothing (no Fabric
// surface, so no installFabric()).
//
// Covers ONLY the primitive's own lifecycle wiring (activate on construction, deactivate on
// dispose, listener/suppress option plumbing). The native-call logic itself — tag defaulting,
// UnavailabilityError, addListener overloads — is core/keep-awake.test.ts's job.

import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeepAwake } from './create-keep-awake';

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const activateKeepAwakeAsyncMock = vi.fn(async (_tag: string) => undefined);
const removeSubscriptionMock = vi.fn();
const addListenerMock = vi.fn((..._args: unknown[]) => ({
  remove: removeSubscriptionMock,
}));
const deactivateKeepAwakeMock = vi.fn(async (_tag: string) => undefined);

// The native-call leaf is mocked rather than the `../../core` barrel, so the barrel stays REAL and
// the primitive runs the real createKeepAwakeListenerAttachment (the teardown guard under test)
// while its addListener/subscription still land on the spies above.
vi.mock('../../core/keep-awake', () => ({
  ExpoKeepAwakeTag: 'ExpoKeepAwakeDefaultTag',
  isAvailableAsync: async () => true,
  activateKeepAwakeAsync: (tag: string) => activateKeepAwakeAsyncMock(tag),
  addListener: (...args: unknown[]) => addListenerMock(...args),
  deactivateKeepAwake: (tag: string) => deactivateKeepAwakeMock(tag),
}));

beforeEach(() => {
  activateKeepAwakeAsyncMock.mockClear();
  addListenerMock.mockClear();
  removeSubscriptionMock.mockClear();
  deactivateKeepAwakeMock.mockClear();
  activateKeepAwakeAsyncMock.mockResolvedValue(undefined);
  deactivateKeepAwakeMock.mockResolvedValue(undefined);
});

type IKeepAwakeProbeOptions = {
  tag?: string;
  listener?: (event: unknown) => void;
  suppressDeactivateWarnings?: boolean;
};

// This primitive returns nothing, so there is no value to hoist out of the root — only the
// dispose handle. Same createRoot shape as adapters/solid/src/primitives/primitives.test.ts.
function startKeepAwake(options: IKeepAwakeProbeOptions = {}): () => void {
  const { tag, listener, suppressDeactivateWarnings } = options;
  return createRoot(dispose => {
    createKeepAwake(tag, { listener, suppressDeactivateWarnings });
    return dispose;
  });
}

describe('createKeepAwake (Solid)', () => {
  describe('Positive — tag resolution and native lifecycle wiring', () => {
    // why: a caller that doesn't name a tag must still get one — Solid has no useId equivalent,
    // so the primitive falls back to its own monotonic counter instead of leaving it undefined.
    it('activates a default tag on creation', async () => {
      const dispose = startKeepAwake();

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );
      expect(typeof activateKeepAwakeAsyncMock.mock.calls[0][0]).toBe('string');

      dispose();
    });

    // why: a caller managing a named lock must have that exact tag reach core, not a
    // primitive-generated default.
    it('activates the explicit tag when one is given', async () => {
      const dispose = startKeepAwake({ tag: 'custom-tag' });

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledWith('custom-tag'),
      );

      dispose();
    });

    // why: onCleanup is the ONLY place an acquired lock gets released — if it doesn't fire, the
    // lock leaks for the app's lifetime.
    it('deactivates the same tag on dispose', async () => {
      const dispose = startKeepAwake({ tag: 'custom-tag' });
      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );

      dispose();

      expect(deactivateKeepAwakeMock).toHaveBeenCalledWith('custom-tag');
    });

    // why: without an explicit listener, the primitive must not wire one — a silently-attached
    // no-op listener would leak a native subscription nobody asked for.
    it('never touches addListener when no options are given', async () => {
      const dispose = startKeepAwake({ tag: 'custom-tag' });

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );
      expect(addListenerMock).not.toHaveBeenCalled();

      dispose();
    });

    // why: options.listener is how a caller observes native keep-awake state changes — it must be
    // wired to the SAME tag that was just activated, once activation actually resolves.
    it('wires options.listener to addListener once activation resolves', async () => {
      const listener = vi.fn();

      const dispose = startKeepAwake({ tag: 'custom-tag', listener });

      await vi.waitFor(() =>
        expect(addListenerMock).toHaveBeenCalledWith('custom-tag', listener),
      );

      dispose();
    });
  });

  describe('Deliberately-swallowed native failures — the primitive reports nothing back to the caller', () => {
    // why: the listener attach sits inside activate's `.then()`, which is skipped entirely on
    // rejection — a failed activation must never attach a listener for a lock that was never
    // actually acquired.
    it('does not register a listener when activateKeepAwakeAsync rejects', async () => {
      activateKeepAwakeAsyncMock.mockRejectedValueOnce(
        new Error('activation failed'),
      );
      const listener = vi.fn();

      const dispose = startKeepAwake({ tag: 'custom-tag', listener });

      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );
      await tick();
      expect(addListenerMock).not.toHaveBeenCalled();

      dispose();
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

      const dispose = startKeepAwake({
        tag: 'custom-tag',
        suppressDeactivateWarnings: true,
      });
      await vi.waitFor(() =>
        expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1),
      );
      dispose();
      await tick();

      expect(unhandled).not.toHaveBeenCalled();
    });
  });

  describe('Teardown race — activation resolving after the owner is gone', () => {
    // why: activation is async, so dispose can run while activate() is still pending. A listener
    // registered at that point belongs to an owner that no longer exists, and the subscription
    // that would remove it is created after the only teardown hook has already run.
    it('does not register a listener when disposed before activation resolves', async () => {
      let resolveActivate: () => void = () => {};
      activateKeepAwakeAsyncMock.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveActivate = resolve;
          }),
      );
      const listener = vi.fn();

      const dispose = startKeepAwake({ tag: 'custom-tag', listener });
      await tick();
      dispose();
      await tick();

      resolveActivate();
      await tick();

      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: the other half of the same leak — when activation wins the race, the subscription
    // exists and dispose is the only place left that can remove it.
    it('removes the listener subscription on dispose', async () => {
      const listener = vi.fn();

      const dispose = startKeepAwake({ tag: 'custom-tag', listener });
      await vi.waitFor(() => expect(addListenerMock).toHaveBeenCalledTimes(1));

      dispose();

      expect(removeSubscriptionMock).toHaveBeenCalledTimes(1);
    });
  });
});
