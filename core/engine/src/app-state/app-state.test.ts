// Co-located unit test for the AppState module. A fake __turboModuleProxy returns
// an AppState native module (getConstants -> { initialAppState: 'active' } plus
// observe-counters); a fake RN$registerCallableModule captures the device hub so the test can
// play "native" and emit `appStateDidChange` / `memoryWarning` / `appStateFocusChange`.
//
// AppState never throws: addEventListener is an exhaustive switch over the public
// IAppStateEvent union, and a missing native module degrades to a live-but-silent
// subscription rather than an error (see the module's own "Never throws" comment).
// So there is no Negative (toThrow) group here -- every scenario below is Positive.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let AppState: typeof import('./index').AppState;

let appStateAdded: number;
let appStateRemoved: number;
let deviceHub: IDeviceHub | undefined;

// Whether the fake __turboModuleProxy resolves an AppState module at all --
// toggled per test to exercise the "module not linked" branch.
let moduleLinked = true;

beforeEach(async () => {
  appStateAdded = 0;
  appStateRemoved = 0;
  deviceHub = undefined;
  moduleLinked = true;

  const fakeAppState = {
    getConstants: (): { initialAppState: string } => ({
      initialAppState: 'active',
    }),
    addListener: (): void => {
      appStateAdded += 1;
    },
    removeListeners: (count: number): void => {
      appStateRemoved += count;
    },
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module: unknown =
      name === 'AppState' && moduleLinked ? fakeAppState : undefined;
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (
    name: string,
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

// Import must happen with `moduleLinked` already set for the scenario, since
// module resolution + emitter creation is lazy but the proxy is read at the
// point AppState first touches getModule()/getEmitter(), not at import time.
async function loadAppState(): Promise<void> {
  ({ AppState } = await import('./index'));
}

describe('AppState', () => {
  describe('module availability', () => {
    // why: isAvailable is the documented feature-detect gate callers use before
    // relying on AppState -- it must reflect whether native actually linked the module.
    it('isAvailable is true when the native module resolves', async () => {
      await loadAppState();
      expect(AppState.isAvailable).toBe(true);
    });

    // why: an unlinked build (module missing from the binary) must degrade to a
    // detectable false, not throw and not silently pretend the module exists.
    it('isAvailable is false when the native module is not linked', async () => {
      moduleLinked = false;
      await loadAppState();
      expect(AppState.isAvailable).toBe(false);
    });
  });

  describe('currentState', () => {
    // why: RN parity -- currentState is seeded from getConstants().initialAppState
    // so a caller reading it immediately after import already sees the real state,
    // without waiting for a first native event.
    it('seeds currentState from getConstants when the module resolves', async () => {
      await loadAppState();
      expect(AppState.currentState).toBe('active');
    });

    // why: without a module there is nothing to seed from; currentState must stay
    // null rather than fabricate a value, so callers can tell "unknown" from "active".
    it('stays null when the native module is not linked', async () => {
      moduleLinked = false;
      await loadAppState();
      expect(AppState.currentState).toBeNull();
    });

    // why: currentState is kept fresh forever by a permanent self-subscription (not
    // only while a caller happens to be listening) -- a read after a native change
    // must see the new value even with zero external listeners attached.
    it('tracks a native appStateDidChange even with no listeners attached', async () => {
      await loadAppState();
      // Access currentState once to force the lazy emitter (and its permanent
      // self-subscription) to install.
      expect(AppState.currentState).toBe('active');
      deviceHub?.emit('appStateDidChange', { app_state: 'background' });
      expect(AppState.currentState).toBe('background');
    });
  });

  describe("'change' event", () => {
    // why: the public 'change' event is how callers observe foreground/background
    // transitions; it must fire with the new state string, not the raw native payload.
    it('fires with the new state on a native appStateDidChange', async () => {
      await loadAppState();
      let received: unknown;
      const sub = AppState.addEventListener('change', state => {
        received = state;
      });
      expect(deviceHub).toBeDefined();
      expect(appStateAdded).toBeGreaterThanOrEqual(1);

      deviceHub?.emit('appStateDidChange', { app_state: 'background' });
      expect(received).toBe('background');
      sub.remove();
    });

    // why: removing the subscription must actually stop delivery, and must ping the
    // native observe-counter so the module can release resources when nobody listens.
    it('remove() unsubscribes and decrements the native observe-counter', async () => {
      await loadAppState();
      let received: unknown;
      const sub = AppState.addEventListener('change', state => {
        received = state;
      });
      const removedBefore = appStateRemoved;
      sub.remove();
      expect(appStateRemoved).toBe(removedBefore + 1);

      deviceHub?.emit('appStateDidChange', { app_state: 'active' });
      expect(received).toBeUndefined();
    });

    // why: isStateChangePayload guards against a malformed native payload (missing
    // `app_state`) -- the handler must not fire on garbage rather than call it with
    // `undefined` and let bad data silently propagate to app code.
    it('ignores a malformed payload missing app_state', async () => {
      await loadAppState();
      let calls = 0;
      AppState.addEventListener('change', () => {
        calls += 1;
      });
      deviceHub?.emit('appStateDidChange', { unrelated: true });
      expect(calls).toBe(0);
    });
  });

  describe("'memoryWarning' event", () => {
    // why: memoryWarning carries no payload -- the handler must simply fire, proving
    // the raw native event maps onto the public event name at all.
    it('fires on a native memoryWarning event', async () => {
      await loadAppState();
      let calls = 0;
      AppState.addEventListener('memoryWarning', () => {
        calls += 1;
      });
      deviceHub?.emit('memoryWarning');
      expect(calls).toBe(1);
    });
  });

  describe("'focus' / 'blur' events", () => {
    // why: both public events multiplex the single native appStateFocusChange
    // boolean -- 'focus' must fire only on true and stay silent on false.
    it("'focus' fires only when hasFocus is true", async () => {
      await loadAppState();
      let calls = 0;
      AppState.addEventListener('focus', () => {
        calls += 1;
      });
      deviceHub?.emit('appStateFocusChange', false);
      expect(calls).toBe(0);
      deviceHub?.emit('appStateFocusChange', true);
      expect(calls).toBe(1);
    });

    // why: symmetric guard on the other side of the same boolean -- 'blur' must
    // fire only when hasFocus is false, never on true.
    it("'blur' fires only when hasFocus is false", async () => {
      await loadAppState();
      let calls = 0;
      AppState.addEventListener('blur', () => {
        calls += 1;
      });
      deviceHub?.emit('appStateFocusChange', true);
      expect(calls).toBe(0);
      deviceHub?.emit('appStateFocusChange', false);
      expect(calls).toBe(1);
    });
  });
});
