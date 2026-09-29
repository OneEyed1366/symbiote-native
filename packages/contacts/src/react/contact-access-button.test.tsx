// React `ContactAccessButton`, driven through the recording fabric with an injected view config

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireOptionalNativeModule: () => ({ isAvailable: true }),
}));

const { ContactAccessButton } = await import('./contact-access-button');

const ROOT_TAG = 1501;
const VIEW_NAME = 'ViewManagerAdapter_ExpoContactAccessButton';
const fakeColor = (value: unknown): string => `processed(${String(value)})`;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        validAttributes: {
          query: true,
          caption: true,
          ignoredEmails: true,
          tintColor: { process: fakeColor },
        },
      }
    : undefined,
);

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
});

afterEach(() => unmount(ROOT_TAG));

function buttonNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

describe('ContactAccessButton (Positive)', () => {
  it('paints the native view with its props on iOS', () => {
    mount(
      ROOT_TAG,
      createElement(ContactAccessButton, { query: 'ann', caption: 'email' }),
    );

    const node = buttonNode();
    expect(node).toBeDefined();
    const payload = node ? live.nodeOf(node.handle).payload : {};
    expect(payload.query).toBe('ann');
    expect(payload.caption).toBe('email');
  });

  it('runs the view config prop processors, the tint is processed', () => {
    mount(
      ROOT_TAG,
      createElement(ContactAccessButton, { query: 'ann', tintColor: 'red' }),
    );

    const node = buttonNode();
    expect(node ? live.nodeOf(node.handle).payload.tintColor : undefined).toBe(
      'processed(red)',
    );
  });

  it('registers the view manager when it renders', () => {
    mount(ROOT_TAG, createElement(ContactAccessButton, { query: 'ann' }));

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoContactAccessButton',
    );
  });

  it('exposes `isAvailable` as a static like upstream', () => {
    expect(ContactAccessButton.isAvailable()).toBe(true);
  });
});

describe('ContactAccessButton (Negative)', () => {
  it('renders nothing on Android', () => {
    platform.OS = 'android';

    mount(ROOT_TAG, createElement(ContactAccessButton, { query: 'ann' }));

    expect(buttonNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
    expect(ContactAccessButton.isAvailable()).toBe(false);
  });
});
