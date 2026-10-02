// Framework-agnostic half of `ContactAccessButton`, an Expo native view reached through
// `requireNativeViewManager`

import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const nativeModule = vi.hoisted(() => ({
  isAvailable: true as boolean | undefined,
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const requireOptionalNativeModule = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireOptionalNativeModule,
}));

const {
  CONTACT_ACCESS_BUTTON_MODULE_NAME,
  contactAccessButtonViewName,
  ensureContactAccessButtonRegistered,
  isContactAccessButtonAvailable,
  renderContactAccessButton,
} = await import('./contact-access-button');

beforeEach(() => {
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  nativeModule.isAvailable = true;
  requireOptionalNativeModule.mockReturnValue(nativeModule);
  Reflect.deleteProperty(globalThis, 'expo');
});

describe('contactAccessButtonViewName (Positive)', () => {
  it('names the Expo view-manager adapter after the module', () => {
    expect(contactAccessButtonViewName()).toBe(
      'ViewManagerAdapter_ExpoContactAccessButton',
    );
  });

  it('appends the app identifier the way requireNativeViewManager does', () => {
    Reflect.set(globalThis, 'expo', { __expo_app_identifier__: 'abc' });

    expect(contactAccessButtonViewName()).toBe(
      'ViewManagerAdapter_ExpoContactAccessButton_abc',
    );
  });
});

describe('isContactAccessButtonAvailable', () => {
  it('is true on iOS when the native module says so', () => {
    expect(isContactAccessButtonAvailable()).toBe(true);
    expect(requireOptionalNativeModule).toHaveBeenCalledWith(
      CONTACT_ACCESS_BUTTON_MODULE_NAME,
    );
  });

  it('is false on iOS before 18 where the module reports unavailable', () => {
    nativeModule.isAvailable = false;

    expect(isContactAccessButtonAvailable()).toBe(false);
  });

  it('is false when the native module is missing', () => {
    requireOptionalNativeModule.mockReturnValue(null);

    expect(isContactAccessButtonAvailable()).toBe(false);
  });

  it('is false on Android without asking the native module', () => {
    platform.OS = 'android';

    expect(isContactAccessButtonAvailable()).toBe(false);
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();
  });
});

describe('ensureContactAccessButtonRegistered', () => {
  it('registers the view config through requireNativeViewManager on iOS', () => {
    expect(ensureContactAccessButtonRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      CONTACT_ACCESS_BUTTON_MODULE_NAME,
    );
  });

  it('does not touch the view manager on Android', () => {
    platform.OS = 'android';

    expect(ensureContactAccessButtonRegistered()).toBe(false);
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });

  it('reports false when registration throws instead of crashing the render', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });

    expect(ensureContactAccessButtonRegistered()).toBe(false);
  });
});

describe('renderContactAccessButton', () => {
  it('describes the native view with the props passed through', () => {
    const descriptor = renderContactAccessButton({
      query: 'ann',
      caption: 'email',
      ignoredEmails: ['a@b.test'],
      tintColor: 'red',
      testID: 'button',
    });

    expect(descriptor?.type).toBe('ViewManagerAdapter_ExpoContactAccessButton');
    expect(descriptor?.props).toEqual({
      query: 'ann',
      caption: 'email',
      ignoredEmails: ['a@b.test'],
      tintColor: 'red',
      testID: 'button',
    });
  });

  it('renders nothing on Android', () => {
    platform.OS = 'android';

    expect(renderContactAccessButton({ query: 'ann' })).toBeNull();
  });

  it('renders nothing when the view config could not be registered', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });

    expect(renderContactAccessButton({ query: 'ann' })).toBeNull();
  });
});
