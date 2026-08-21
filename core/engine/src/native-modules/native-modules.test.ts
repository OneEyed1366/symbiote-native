// Co-located unit test for `createDeviceEventModule`, the Pure Fabrication that
// factors out the lazy-resolve + lazy-emitter shape duplicated across
// AccessibilityInfo/AppState/Appearance/BackHandler/Keyboard/Dimensions. A fake
// __turboModuleProxy stands in for the native module; a fake RN$registerCallableModule
// captures the device hub so installDeviceEventHub() doesn't throw.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeviceEventModule,
  getEnforcingNativeModule,
  getNativeModule,
} from './index';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let deviceHub: IDeviceHub | undefined;

beforeEach(() => {
  deviceHub = undefined;
  globalThis.RN$registerCallableModule = (
    name: string,
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.nativeModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('getNativeModule (Positive)', () => {
  // why: this IS the New Architecture (non-bridgeless) resolution path -- most
  // hosts today resolve every module through this function proxy.
  it('resolves via the __turboModuleProxy function when it returns a module', () => {
    const fakeModule = { ping: (): string => 'pong' };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'TurboOnly' && isPresent<T>(fakeModule) ? fakeModule : null;

    expect(getNativeModule<typeof fakeModule>('TurboOnly')).toBe(fakeModule);
  });

  // why: bridgeless hosts (RCTHost) install modules as a HostObject keyed by name
  // INSTEAD of the function proxy -- this is what RN's own NativeModules resolves
  // to in bridgeless, so it must be a real fallback, not dead code.
  it('falls back to nativeModuleProxy (bridgeless HostObject) when __turboModuleProxy is absent', () => {
    const fakeModule = { ping: (): string => 'pong' };
    globalThis.nativeModuleProxy = { BridgelessOnly: fakeModule };

    expect(getNativeModule<typeof fakeModule>('BridgelessOnly')).toBe(
      fakeModule,
    );
  });

  // why: a HostObject access for an unlinked name can THROW natively (per the
  // module's own comment) -- that throw must be swallowed here, or a single missing
  // module would blank the whole render tree instead of degrading to null.
  it('swallows a throw from the bridgeless proxy and resolves to null', () => {
    globalThis.nativeModuleProxy = new Proxy(
      {},
      {
        get(): never {
          throw new Error('native HostObject: no such module');
        },
      },
    );

    expect(() => getNativeModule('AnythingAtAll')).not.toThrow();
    expect(getNativeModule('AnythingAtAll')).toBeNull();
  });

  it('resolves to null when neither proxy is installed (headless, nothing linked)', () => {
    expect(getNativeModule('Nothing')).toBeNull();
  });
});

describe('getEnforcingNativeModule', () => {
  // why: the caller trades "graceful null" for "throw" on modules the app
  // hard-depends on -- when the module DOES resolve, it must behave identically to
  // getNativeModule, not wrap or alter the value.
  it('returns the resolved module, same as getNativeModule', () => {
    const fakeModule = { ping: (): string => 'pong' };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'MustExist' && isPresent<T>(fakeModule) ? fakeModule : null;

    expect(getEnforcingNativeModule<typeof fakeModule>('MustExist')).toBe(
      fakeModule,
    );
  });

  // why: this is the entire reason the "enforcing" variant exists -- a hard
  // dependency missing from the binary must fail LOUDLY with the module name in
  // the message, not silently degrade like the plain getNativeModule.
  it('throws naming the module when it is not registered', () => {
    expect(() => getEnforcingNativeModule('DefinitelyMissing')).toThrow(
      /DefinitelyMissing.*not registered/,
    );
  });
});

describe('createDeviceEventModule', () => {
  it('resolves the native module once and caches it across repeated getModule() calls', () => {
    let resolveCount = 0;
    const fakeModule = {
      addListener: (): void => {},
      removeListeners: (): void => {},
    };
    globalThis.__turboModuleProxy = <T>(name: string): T | null => {
      if (name !== 'FakeModule') return null;
      resolveCount += 1;
      return isPresent<T>(fakeModule) ? fakeModule : null;
    };

    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'FakeModule',
      moduleLogPrefix: 'FakeModule: module',
    });

    expect(deviceEventModule.getModule()).toBe(fakeModule);
    expect(deviceEventModule.getModule()).toBe(fakeModule);
    expect(resolveCount).toBe(1);
  });

  it('a missing module logs and resolves to null, never throwing', () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;

    const deviceEventModule = createDeviceEventModule<{
      addListener(): void;
      removeListeners(): void;
    }>({
      moduleName: 'MissingModule',
      moduleLogPrefix: 'MissingModule: module',
    });

    expect(deviceEventModule.getModule()).toBeNull();
    expect(() => deviceEventModule.getEmitter()).not.toThrow();
  });

  it('constructs the emitter lazily, exactly once, and runs onEmitterCreated exactly once', () => {
    const fakeModule = { addListener: vi.fn(), removeListeners: vi.fn() };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'FakeModule' && isPresent<T>(fakeModule) ? fakeModule : null;

    let createdCount = 0;
    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'FakeModule',
      moduleLogPrefix: 'FakeModule: module',
      onEmitterCreated: () => {
        createdCount += 1;
      },
    });

    const emitterA = deviceEventModule.getEmitter();
    const emitterB = deviceEventModule.getEmitter();
    expect(emitterA).toBe(emitterB);
    expect(createdCount).toBe(1);
  });

  it('binds the module into the emitter by default, pinging its observe-counters', () => {
    const fakeModule = { addListener: vi.fn(), removeListeners: vi.fn() };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'BoundModule' && isPresent<T>(fakeModule) ? fakeModule : null;

    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'BoundModule',
      moduleLogPrefix: 'BoundModule: module',
    });

    const sub = deviceEventModule
      .getEmitter()
      .addListener('someEvent', () => {});
    expect(fakeModule.addListener).toHaveBeenCalledWith('someEvent');
    sub.remove();
    expect(fakeModule.removeListeners).toHaveBeenCalledWith(1);
  });

  // why: hasEventEmitterShape is a RUNTIME guard, distinct from the `bindModuleToEmitter:
  // false` config below -- a module that resolves but genuinely lacks addListener/
  // removeListeners (e.g. Dimensions' DeviceInfo, which only has getConstants) must
  // not be bound even when binding is requested (the default), since calling a
  // missing method would crash.
  it('does not bind a resolved module that lacks the observe-counter methods', () => {
    const shapelessModule = { getConstants: (): Record<string, never> => ({}) };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'ShapelessModule' && isPresent<T>(shapelessModule)
        ? shapelessModule
        : null;

    const deviceEventModule = createDeviceEventModule<typeof shapelessModule>({
      moduleName: 'ShapelessModule',
      moduleLogPrefix: 'ShapelessModule: module',
    });

    expect(() =>
      deviceEventModule.getEmitter().addListener('someEvent', () => {}),
    ).not.toThrow();
    expect(deviceEventModule.getModule()).toBe(shapelessModule);
  });

  it('bindModuleToEmitter: false never pings the module counters, even though the module resolved', () => {
    const fakeModule = { addListener: vi.fn(), removeListeners: vi.fn() };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'UnboundModule' && isPresent<T>(fakeModule) ? fakeModule : null;

    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'UnboundModule',
      moduleLogPrefix: 'UnboundModule: module',
      bindModuleToEmitter: false,
    });

    deviceEventModule.getEmitter().addListener('someEvent', () => {});
    expect(fakeModule.addListener).not.toHaveBeenCalled();
  });

  it('onEmitterCreated receives the SAME emitter and module getEmitter()/getModule() hand back', () => {
    const fakeModule = {
      addListener: (): void => {},
      removeListeners: (): void => {},
    };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'HookModule' && isPresent<T>(fakeModule) ? fakeModule : null;

    let receivedModule: typeof fakeModule | null | undefined;
    let receivedEmitter: unknown;
    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'HookModule',
      moduleLogPrefix: 'HookModule: module',
      onEmitterCreated: (emitter, module) => {
        receivedEmitter = emitter;
        receivedModule = module;
      },
    });

    const emitter = deviceEventModule.getEmitter();
    expect(receivedEmitter).toBe(emitter);
    expect(receivedModule).toBe(fakeModule);
    expect(deviceEventModule.getModule()).toBe(fakeModule);
  });
});
