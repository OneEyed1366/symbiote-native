// Co-located Angular-driven test (ADR 0025) for KeepAwakeService. See battery's
// low-power-mode.service.test.ts for the shared rationale.
//
// Two host classes rather than one @Input-driven host: Angular sets @Input-bound properties
// AFTER construction, so a constructor-time `connect(this.tag)` read off an @Input would always
// see `undefined` — the same field-initializer/constructor timing every other service host in
// this repo relies on (see battery's own PermissionsHost/BatteryLevelHost).
//
// This file tests ONLY the service's own lifecycle wiring (subscribe on mount, deactivate on
// unmount, listener/suppress option plumbing) — the native-call/state logic itself
// (activate/deactivate/addListener behavior, UnavailabilityError, tag defaulting) is core's
// job and is exhaustively covered by core/keep-awake.test.ts; re-asserting it here would just
// duplicate that coverage under a different mount path.

import '@angular/compiler';
import { Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { KeepAwakeService } from './index';

const activateKeepAwakeAsyncMock = vi.fn(async (_tag: string) => undefined);
const removeSubscriptionMock = vi.fn();
const addListenerMock = vi.fn((..._args: unknown[]) => ({ remove: removeSubscriptionMock }));
const deactivateKeepAwakeMock = vi.fn(async (_tag: string) => undefined);
const explicitListener = vi.fn();

// The native-call leaf is mocked rather than the `../../../core` barrel, so that the barrel
// stays REAL and the service runs the real createKeepAwakeListenerAttachment (the unmount guard
// under test) while its addListener/subscription still land on the spies above.
vi.mock('../../../core/keep-awake', () => ({
  ExpoKeepAwakeTag: 'ExpoKeepAwakeDefaultTag',
  isAvailableAsync: async () => true,
  activateKeepAwakeAsync: (tag: string) => activateKeepAwakeAsyncMock(tag),
  addListener: (...args: unknown[]) => addListenerMock(...args),
  deactivateKeepAwake: (tag: string) => deactivateKeepAwakeMock(tag),
}));

const ROOT_TAG = 974;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-keep-awake-default-host',
  standalone: true,
  template: '',
})
class KeepAwakeDefaultHost {
  constructor() {
    inject(KeepAwakeService).connect();
  }
}

@Component({
  selector: 'symbiote-keep-awake-custom-host',
  standalone: true,
  template: '',
})
class KeepAwakeCustomHost {
  constructor() {
    inject(KeepAwakeService).connect('custom-tag');
  }
}

@Component({
  selector: 'symbiote-keep-awake-listener-host',
  standalone: true,
  template: '',
})
class KeepAwakeListenerHost {
  constructor() {
    inject(KeepAwakeService).connect('custom-tag', { listener: explicitListener });
  }
}

@Component({
  selector: 'symbiote-keep-awake-suppress-host',
  standalone: true,
  template: '',
})
class KeepAwakeSuppressHost {
  constructor() {
    inject(KeepAwakeService).connect('custom-tag', { suppressDeactivateWarnings: true });
  }
}

beforeEach(() => {
  activateKeepAwakeAsyncMock.mockClear();
  addListenerMock.mockClear();
  removeSubscriptionMock.mockClear();
  deactivateKeepAwakeMock.mockClear();
  explicitListener.mockClear();
  activateKeepAwakeAsyncMock.mockResolvedValue(undefined);
  deactivateKeepAwakeMock.mockResolvedValue(undefined);
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('KeepAwakeService.connect', () => {
  describe('Positive — tag resolution and native lifecycle wiring', () => {
    // why: a caller that doesn't name a tag must still get one — Angular has no useId
    // equivalent, so this proves connect() actually resolves SOME tag rather than passing
    // `undefined` through to core.
    it('activates a default tag on mount', async () => {
      mount(ROOT_TAG, KeepAwakeDefaultHost);
      await tick();

      expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1);
      expect(typeof activateKeepAwakeAsyncMock.mock.calls[0][0]).toBe('string');
    });

    // why: a caller managing a named lock must have that exact tag reach core, not a
    // service-generated default.
    it('activates the explicit tag when one is given', async () => {
      mount(ROOT_TAG, KeepAwakeCustomHost);
      await tick();

      expect(activateKeepAwakeAsyncMock).toHaveBeenCalledWith('custom-tag');
    });

    // why: the effect's cleanup is the ONLY place a mounted lock gets released — if it doesn't
    // fire on unmount, the lock leaks for the app's lifetime.
    it('deactivates the same tag when the host component is unmounted', async () => {
      mount(ROOT_TAG, KeepAwakeCustomHost);
      await tick();

      unmount(ROOT_TAG);
      await tick();

      expect(deactivateKeepAwakeMock).toHaveBeenCalledWith('custom-tag');
    });

    // why: without an explicit listener, connect() must not wire one — a silently-attached
    // no-op listener would leak a native subscription nobody asked for.
    it('never touches addListener when no options are given', async () => {
      mount(ROOT_TAG, KeepAwakeCustomHost);
      await tick();

      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: options.listener is how a caller observes native keep-awake state changes — it must
    // be wired to the SAME tag that was just activated, once activation actually resolves.
    it('wires options.listener to addListener once activation resolves', async () => {
      mount(ROOT_TAG, KeepAwakeListenerHost);
      await tick();

      expect(addListenerMock).toHaveBeenCalledWith('custom-tag', explicitListener);
    });
  });

  describe('Deliberately-swallowed native failures — the service reports nothing back to the caller', () => {
    // why: the listener attach sits inside activate's `.then()`, which is skipped entirely on
    // rejection — a failed activation must never attach a listener for a lock that was never
    // actually acquired.
    it('does not register a listener when activateKeepAwakeAsync rejects', async () => {
      activateKeepAwakeAsyncMock.mockRejectedValueOnce(new Error('activation failed'));

      mount(ROOT_TAG, KeepAwakeListenerHost);
      await tick();

      expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1);
      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: suppressDeactivateWarnings exists so a caller can opt out of the "deactivate failed"
    // warning upstream expo-keep-awake surfaces — the rejection must be swallowed, not become an
    // unhandled promise rejection.
    it('swallows a deactivation rejection when suppressDeactivateWarnings is set', async () => {
      deactivateKeepAwakeMock.mockRejectedValueOnce(new Error('deactivate failed'));
      const unhandled = vi.fn();
      process.once('unhandledRejection', unhandled);

      mount(ROOT_TAG, KeepAwakeSuppressHost);
      await tick();
      unmount(ROOT_TAG);
      await tick();

      expect(unhandled).not.toHaveBeenCalled();
    });
  });

  describe('Teardown race — activation resolving after the host component is gone', () => {
    // why: activation is async, so the effect's cleanup can run while activate() is still
    // pending. A listener registered at that point belongs to a host that no longer exists, and
    // the subscription that would remove it is created after the only cleanup has already run.
    it('does not register a listener when the host component is unmounted before activation resolves', async () => {
      let resolveActivate: () => void = () => {};
      activateKeepAwakeAsyncMock.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveActivate = resolve;
          }),
      );

      mount(ROOT_TAG, KeepAwakeListenerHost);
      await tick();
      unmount(ROOT_TAG);
      await tick();

      resolveActivate();
      await tick();

      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: the other half of the same leak — when activation wins the race, the subscription
    // exists and the effect's cleanup is the only place left that can remove it.
    it('removes the listener subscription when the host component is unmounted', async () => {
      mount(ROOT_TAG, KeepAwakeListenerHost);
      await tick();
      expect(addListenerMock).toHaveBeenCalledTimes(1);

      unmount(ROOT_TAG);
      await tick();

      expect(removeSubscriptionMock).toHaveBeenCalledTimes(1);
    });
  });
});
