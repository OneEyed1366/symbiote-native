// RN's own singletons (`UIManager`, `NativeModules`, `LogBox`, ...) sit on its Paper interop and
// dev tooling, so the engine forwards to the `react-native` module the app hands over at bootstrap
import { beforeEach, describe, expect, it, vi } from 'vitest';

let host: typeof import('./index');

beforeEach(async () => {
  vi.resetModules();
  host = await import('./index');
});

describe('before the host hands react-native over', () => {
  it('tells how to wire it instead of failing on an undefined', () => {
    expect(() => host.UIManager.measure(1, () => {})).toThrow(
      'react-native is not wired: call `registerApp` or `bootstrapHost` first',
    );
  });

  it('says the same for a function export', () => {
    expect(() => host.requireNativeComponent('RCTFoo')).toThrow(
      'react-native is not wired',
    );
  });
});

describe('an object export after setReactNativeHost', () => {
  it('forwards a call with its arguments and returns the result', () => {
    const hasViewManagerConfig = vi.fn(() => true);
    host.setReactNativeHost({ UIManager: { hasViewManagerConfig } });

    expect(host.UIManager.hasViewManagerConfig('RCTView')).toBe(true);
    expect(hasViewManagerConfig).toHaveBeenCalledWith('RCTView');
  });

  it('forwards the statics of a module RN defines as a class', () => {
    class RealDimensions {
      static scale = 3;
      static get(dim: string) {
        return { dim, scale: this.scale };
      }
    }
    host.setReactNativeHost({ Dimensions: RealDimensions });

    expect(host.Dimensions.get('window')).toEqual({ dim: 'window', scale: 3 });
  });

  it('lets a spy installed on the facade land on the real module and restore', () => {
    const real = { get: () => 'real' };
    host.setReactNativeHost({ Dimensions: real });
    const spy = vi.spyOn(host.Dimensions, 'get').mockReturnValue({
      width: 1,
      height: 2,
      scale: 3,
      fontScale: 4,
    });

    expect(host.Dimensions.get('window').width).toBe(1);
    expect(host.Dimensions.get).toHaveBeenCalledOnce();

    spy.mockRestore();

    expect(real.get()).toBe('real');
  });

  it('writes an assigned member through to the real module', () => {
    const real = { isRTL: false };
    host.setReactNativeHost({ Dimensions: real });

    Reflect.set(host.Dimensions, 'isRTL', true);

    expect(real.isRTL).toBe(true);
  });

  it('keeps `this` on the real module for a method that reads it', () => {
    const callback = vi.fn();
    host.setReactNativeHost({
      LogBox: {
        tag: 7,
        ignoreAllLogs(this: { tag: number }) {
          callback(this.tag);
        },
      },
    });
    host.LogBox.ignoreAllLogs();

    expect(callback).toHaveBeenCalledWith(7);
  });

  it('reads the members RN spreads on the module', () => {
    host.setReactNativeHost({ UIManager: { RCTView: { Commands: {} } } });

    expect(host.UIManager.RCTView).toEqual({ Commands: {} });
  });

  it('answers `in` for what the real module has', () => {
    host.setReactNativeHost({ UIManager: { focus: () => {} } });

    expect('focus' in host.UIManager).toBe(true);
    expect('blur' in host.UIManager).toBe(false);
  });

  it('reads the module lazily, so one RN never loads is never touched', () => {
    const lazy = vi.fn(() => ({ ignoreAllLogs: () => {} }));
    host.setReactNativeHost({
      get LogBox() {
        return lazy();
      },
    });

    expect(lazy).not.toHaveBeenCalled();

    host.LogBox.ignoreAllLogs();

    expect(lazy).toHaveBeenCalledTimes(1);
  });

  it('follows a later setReactNativeHost', () => {
    const first = vi.fn();
    const second = vi.fn();
    host.setReactNativeHost({ UIManager: { focus: first } });
    host.setReactNativeHost({ UIManager: { focus: second } });
    host.UIManager.focus(3);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(3);
  });

  it.each([
    'NativeModules',
    'Networking',
    'LogBox',
    'DevMenu',
    'Touchable',
    'Dimensions',
    'PixelRatio',
    'I18nManager',
    'Appearance',
    'AppState',
    'Settings',
    'BackHandler',
    'Linking',
    'Alert',
    'Share',
    'Vibration',
    'ToastAndroid',
    'ActionSheetIOS',
    'PermissionsAndroid',
    'InteractionManager',
    'LayoutAnimation',
    'DevSettings',
    'Systrace',
    'DeviceEventEmitter',
  ])('forwards %s', name => {
    const real = { marker: name };
    host.setReactNativeHost(Object.fromEntries([[name, real]]));

    expect(Reflect.get(host, name).marker).toBe(name);
  });
});

describe('the NativeEventEmitter class', () => {
  it("builds RN's class with the module it is given", () => {
    class RealEmitter {
      constructor(readonly nativeModule?: object) {}
    }
    host.setReactNativeHost({ NativeEventEmitter: RealEmitter });
    const nativeModule = { addListener() {}, removeListeners() {} };

    const emitter = host.createNativeEventEmitter(nativeModule);

    expect(emitter).toBeInstanceOf(RealEmitter);
    expect(Reflect.get(emitter, 'nativeModule')).toBe(nativeModule);
  });

  it('tells how to wire it when nobody did', () => {
    expect(() => host.createNativeEventEmitter()).toThrow(
      'react-native is not wired',
    );
  });
});

describe('the Pressability class', () => {
  it('tells how to wire it when nobody did', () => {
    expect(() => host.loadPressability()).toThrow(
      'Pressability is not wired: call `registerApp` or `bootstrapHost` first',
    );
  });

  it('is loaded on demand, not when it is handed over', () => {
    const loader = vi.fn(() => class {});
    host.setPressabilityLoader(loader);

    expect(loader).not.toHaveBeenCalled();

    host.loadPressability();
    host.loadPressability();

    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('a function export after setReactNativeHost', () => {
  it('forwards requireNativeComponent and returns the native name', () => {
    const requireNativeComponent = vi.fn(() => 'RCTFoo');
    host.setReactNativeHost({ requireNativeComponent });

    expect(host.requireNativeComponent('RCTFoo')).toBe('RCTFoo');
    expect(requireNativeComponent).toHaveBeenCalledWith('RCTFoo');
  });

  it('forwards codegenNativeComponent with its options', () => {
    const codegenNativeComponent = vi.fn(() => 'RCTBar');
    host.setReactNativeHost({ codegenNativeComponent });
    host.codegenNativeComponent('RCTBar', { paperComponentName: 'Old' });

    expect(codegenNativeComponent).toHaveBeenCalledWith('RCTBar', {
      paperComponentName: 'Old',
    });
  });

  it('forwards codegenNativeCommands', () => {
    const codegenNativeCommands = vi.fn(() => ({ focus: () => {} }));
    host.setReactNativeHost({ codegenNativeCommands });
    const commands = host.codegenNativeCommands({
      supportedCommands: ['focus'],
    });

    expect(typeof commands.focus).toBe('function');
  });

  it('forwards registerCallableModule', () => {
    const registerCallableModule = vi.fn();
    host.setReactNativeHost({ registerCallableModule });
    const factory = () => ({});
    host.registerCallableModule('Mod', factory);

    expect(registerCallableModule).toHaveBeenCalledWith('Mod', factory);
  });
});
