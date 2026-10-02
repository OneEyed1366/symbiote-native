import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expoViewManagerName, tryRegisterNativeView } from './expo-native-view';

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

  it('ignores an empty app identifier', () => {
    Reflect.set(globalThis, 'expo', { __expo_app_identifier__: '' });

    expect(expoViewManagerName('ExpoClipboard')).toBe(
      'ViewManagerAdapter_ExpoClipboard',
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
