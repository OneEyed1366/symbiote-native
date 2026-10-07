import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expoViewManagerName,
  tryRegisterNativeView,
  warnIfViewNameIsDynamic,
} from './expo-native-view';

beforeEach(() => {
  Reflect.deleteProperty(globalThis, 'expo');
});

describe('expoViewManagerName', () => {
  it('prefixes the module name with the adapter name', () => {
    expect(expoViewManagerName('ExpoClipboard')).toBe(
      'ViewManagerAdapter_ExpoClipboard',
    );
  });

  it('appends the app identifier the way requireNativeViewManager does', () => {
    Reflect.set(globalThis, 'expo', { __expo_app_identifier__: 'abc' });

    expect(expoViewManagerName('ExpoClipboard')).toBe(
      'ViewManagerAdapter_ExpoClipboard_abc',
    );
  });

  it('puts a named view of a multi-view module between module and identifier', () => {
    expect(expoViewManagerName('ExpoBlur', 'ExpoBlurView')).toBe(
      'ViewManagerAdapter_ExpoBlur_ExpoBlurView',
    );
    Reflect.set(globalThis, 'expo', { __expo_app_identifier__: 'abc' });

    expect(expoViewManagerName('ExpoBlur', 'ExpoBlurView')).toBe(
      'ViewManagerAdapter_ExpoBlur_ExpoBlurView_abc',
    );
  });

  it('ignores an empty app identifier', () => {
    Reflect.set(globalThis, 'expo', { __expo_app_identifier__: '' });

    expect(expoViewManagerName('ExpoClipboard')).toBe(
      'ViewManagerAdapter_ExpoClipboard',
    );
  });
});

describe('warnIfViewNameIsDynamic', () => {
  it('stays silent while the name matches the template literal', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnIfViewNameIsDynamic('ViewManagerAdapter_ExpoBlur', 'ExpoBlur');

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when an app identifier makes the real name differ', () => {
    Reflect.set(globalThis, 'expo', { __expo_app_identifier__: 'abc' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnIfViewNameIsDynamic('ViewManagerAdapter_ExpoBlur', 'ExpoBlur');

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain(
      'ViewManagerAdapter_ExpoBlur_abc',
    );
  });
});

describe('tryRegisterNativeView', () => {
  it('reports true when registration succeeds', () => {
    const register = vi.fn();

    expect(tryRegisterNativeView(register)).toBe(true);
    expect(register).toHaveBeenCalledOnce();
  });

  it('reports false when registration throws', () => {
    expect(
      tryRegisterNativeView(() => {
        throw new Error('no view config');
      }),
    ).toBe(false);
  });
});
