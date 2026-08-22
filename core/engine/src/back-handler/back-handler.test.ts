// Co-located unit test for the BackHandler module. A fake __turboModuleProxy
// returns a DeviceEventManager native module (invokeDefaultBackPressHandler, counted); a
// fake RN$registerCallableModule captures the device hub so the test can play "native" and
// emit `hardwareBackPress`.
//
// BackHandler never throws: exitApp degrades to a documented no-op without a
// linked module (iOS has no hardware back button). So there is no Negative
// (toThrow) group -- every scenario below is Positive.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let BackHandler: typeof import('./index').BackHandler;

let exitAppCount: number;
let deviceHub: IDeviceHub | undefined;
let moduleLinked = true;

beforeEach(async () => {
  exitAppCount = 0;
  deviceHub = undefined;
  moduleLinked = true;

  const fakeDeviceEventManager = {
    invokeDefaultBackPressHandler: (): void => {
      exitAppCount += 1;
    },
    addListener: (): void => {},
    removeListeners: (): void => {},
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module: unknown =
      name === 'DeviceEventManager' && moduleLinked
        ? fakeDeviceEventManager
        : undefined;
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

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

async function loadBackHandler(): Promise<void> {
  ({ BackHandler } = await import('./index'));
}

function emitBack(): void {
  if (deviceHub === undefined)
    throw new Error('BackHandler must install the device hub');
  deviceHub.emit('hardwareBackPress');
}

describe('BackHandler', () => {
  describe('dispatch chain', () => {
    // why: a handler returning true owns the press -- the product rule is "first
    // consumer wins", so earlier-registered (now lower-priority) handlers and the
    // native default must NOT also run.
    it('a handler returning true consumes the press; the lower handler and native default stay untouched', async () => {
      await loadBackHandler();
      const calls: string[] = [];
      const subFirst = BackHandler.addEventListener('hardwareBackPress', () => {
        calls.push('first');
        return false;
      });
      const subSecond = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          calls.push('second');
          return true;
        },
      );

      const exitsBefore = exitAppCount;
      emitBack();

      expect(calls).toEqual(['second']);
      expect(exitAppCount).toBe(exitsBefore);

      subFirst.remove();
      subSecond.remove();
    });

    // why: dispatch order is reverse-registration (last-registered runs first) --
    // this is the whole point of a "handler stack", so a screen pushed later gets
    // first refusal on the back press.
    it('runs handlers last-registered-first and fires the native default once when nobody consumes', async () => {
      await loadBackHandler();
      const calls: string[] = [];
      const subA = BackHandler.addEventListener('hardwareBackPress', () => {
        calls.push('a');
        return false;
      });
      const subB = BackHandler.addEventListener('hardwareBackPress', () => {
        calls.push('b');
        return false;
      });

      const exitsBefore = exitAppCount;
      emitBack();

      expect(calls).toEqual(['b', 'a']);
      expect(exitAppCount).toBe(exitsBefore + 1);

      subA.remove();
      subB.remove();
    });

    // why: only a literal `true` counts as "consumed" -- a handler that returns
    // undefined (the common `() => { doStuff(); }` shape, no explicit return) must
    // fall through exactly like an explicit `false`, not accidentally swallow the chain.
    it('treats a void-returning handler the same as an explicit false', async () => {
      await loadBackHandler();
      const calls: string[] = [];
      const subVoid = BackHandler.addEventListener('hardwareBackPress', () => {
        calls.push('void');
      });

      const exitsBefore = exitAppCount;
      emitBack();

      expect(calls).toEqual(['void']);
      expect(exitAppCount).toBe(exitsBefore + 1);

      subVoid.remove();
    });
  });

  describe('subscription lifecycle', () => {
    // why: remove() must take the handler out of the chain, so a screen that
    // unmounts stops intercepting back presses for screens still alive.
    it('remove() unsubscribes; the native default still fires with no consumer left', async () => {
      await loadBackHandler();
      let received = false;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        received = true;
        return true;
      });

      sub.remove();
      const exitsBefore = exitAppCount;
      emitBack();

      expect(received).toBe(false);
      expect(exitAppCount).toBe(exitsBefore + 1);
    });

    // why: registering the identical handler reference twice must not double-fire
    // it on one back press -- RN's documented idempotent-registration semantics.
    it('registering the same handler reference twice does not duplicate it in the chain', async () => {
      await loadBackHandler();
      let calls = 0;
      const handler = (): boolean => {
        calls += 1;
        return true;
      };
      const subFirst = BackHandler.addEventListener(
        'hardwareBackPress',
        handler,
      );
      const subSecond = BackHandler.addEventListener(
        'hardwareBackPress',
        handler,
      );

      emitBack();
      expect(calls).toBe(1);

      subFirst.remove();
      subSecond.remove();
    });

    // why: removeEventListener is the legacy unsubscribe path kept for RN parity --
    // it must remove the handler from the same chain the modern subscription.remove() uses.
    it('removeEventListener (legacy path) also removes the handler from the chain', async () => {
      await loadBackHandler();
      let received = false;
      const handler = (): boolean => {
        received = true;
        return true;
      };
      BackHandler.addEventListener('hardwareBackPress', handler);
      BackHandler.removeEventListener('hardwareBackPress', handler);

      const exitsBefore = exitAppCount;
      emitBack();

      expect(received).toBe(false);
      expect(exitAppCount).toBe(exitsBefore + 1);
    });

    // why: 'backPress' is documented as RN's legacy alias for 'hardwareBackPress' --
    // both names must feed the same chain, not two independent registries.
    it("the 'backPress' alias registers into the same chain as 'hardwareBackPress'", async () => {
      await loadBackHandler();
      let received = false;
      const sub = BackHandler.addEventListener('backPress', () => {
        received = true;
        return true;
      });

      emitBack();
      expect(received).toBe(true);
      sub.remove();
    });
  });

  describe('exitApp', () => {
    // why: exitApp is the escape hatch dispatchBackPress falls through to -- calling
    // it directly must also reach the native default, proving it's not only wired
    // through the dispatch chain.
    it('invokes the native default handler when a module is linked', async () => {
      await loadBackHandler();
      BackHandler.exitApp();
      expect(exitAppCount).toBe(1);
    });

    // why: iOS has no hardware back button and no DeviceEventManager module -- calling
    // exitApp() there must degrade to a no-op, matching RN's BackHandler.ios.js stub.
    it('is a no-op when no module is linked', async () => {
      moduleLinked = false;
      await loadBackHandler();
      expect(() => BackHandler.exitApp()).not.toThrow();
      expect(exitAppCount).toBe(0);
    });
  });
});
