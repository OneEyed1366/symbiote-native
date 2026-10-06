// Framework-agnostic half of `AppleAuthenticationButton`, an Expo native view on the system button

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
}));

const {
  appleAuthenticationButtonViewName,
  ensureAppleAuthenticationButtonRegistered,
  renderAppleAuthenticationButton,
} = await import('./apple-authentication-button');

const BUTTON_PROPS = { buttonType: 0, buttonStyle: 2, cornerRadius: 8 };

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.deleteProperty(globalThis, 'expo');
  Reflect.set(globalThis, '__DEV__', true);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  Reflect.deleteProperty(globalThis, '__DEV__');
});

describe('appleAuthenticationButtonViewName', () => {
  it('names the Expo view-manager adapter after the module', () => {
    expect(appleAuthenticationButtonViewName()).toBe(
      'ViewManagerAdapter_ExpoAppleAuthentication',
    );
  });

  it('appends the app identifier the way requireNativeViewManager does', () => {
    Reflect.set(globalThis, 'expo', { __expo_app_identifier__: 'abc' });

    expect(appleAuthenticationButtonViewName()).toBe(
      'ViewManagerAdapter_ExpoAppleAuthentication_abc',
    );
  });
});

describe('ensureAppleAuthenticationButtonRegistered', () => {
  it('registers the view of the module on iOS', () => {
    expect(ensureAppleAuthenticationButtonRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoAppleAuthentication',
    );
  });

  it('does not touch the native view manager off iOS', () => {
    platform.OS = 'android';

    expect(ensureAppleAuthenticationButtonRegistered()).toBe(false);
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });

  it('reports false when the native module lacks the view', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });

    expect(ensureAppleAuthenticationButtonRegistered()).toBe(false);
  });
});

describe('renderAppleAuthenticationButton', () => {
  it('renders the native view under the module view name', () => {
    const descriptor = renderAppleAuthenticationButton({
      ...BUTTON_PROPS,
      onPress: vi.fn(),
    });

    expect(descriptor?.type).toBe('ViewManagerAdapter_ExpoAppleAuthentication');
  });

  it('forwards the button props to the native view', () => {
    const descriptor = renderAppleAuthenticationButton({
      ...BUTTON_PROPS,
      testID: 'apple',
      onPress: vi.fn(),
    });

    expect(descriptor?.props).toMatchObject({
      ...BUTTON_PROPS,
      testID: 'apple',
    });
  });

  it('hands onPress to the native view as onButtonPress', () => {
    const onPress = vi.fn();

    const descriptor = renderAppleAuthenticationButton({
      ...BUTTON_PROPS,
      onPress,
    });

    expect(descriptor?.props['onButtonPress']).toBe(onPress);
    expect(descriptor?.props).not.toHaveProperty('onPress');
  });

  it('renders nothing and warns in dev when the view is unavailable', () => {
    platform.OS = 'android';

    expect(renderAppleAuthenticationButton({ ...BUTTON_PROPS })).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "'AppleAuthenticationButton' is not available.",
    );
  });

  it('renders nothing without a warning in a release build', () => {
    platform.OS = 'android';
    Reflect.set(globalThis, '__DEV__', false);

    expect(renderAppleAuthenticationButton({ ...BUTTON_PROPS })).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
