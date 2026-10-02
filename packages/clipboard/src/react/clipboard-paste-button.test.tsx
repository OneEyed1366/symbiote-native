// React `ClipboardPasteButton`, driven through the recording fabric with an injected view config

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

vi.mock('../core/native-module', () => ({
  expoClipboard: { isPasteButtonAvailable: true },
  CLIPBOARD_CHANGED_EVENT_NAME: 'onClipboardChanged',
}));

const { ClipboardPasteButton } = await import('./clipboard-paste-button');

const ROOT_TAG = 1511;
const VIEW_NAME = 'ViewManagerAdapter_ExpoClipboard';
const fakeColor = (value: unknown): string => `processed(${String(value)})`;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        validAttributes: {
          cornerStyle: true,
          displayMode: true,
          acceptedContentTypes: true,
          backgroundColor: { process: fakeColor },
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

describe('ClipboardPasteButton (Positive)', () => {
  it('paints the native view with its props on iOS', () => {
    mount(
      ROOT_TAG,
      createElement(ClipboardPasteButton, {
        onPress: vi.fn(),
        cornerStyle: 'large',
        displayMode: 'iconOnly',
      }),
    );

    const node = buttonNode();
    expect(node).toBeDefined();
    const payload = node ? live.nodeOf(node.handle).payload : {};
    expect(payload.cornerStyle).toBe('large');
    expect(payload.displayMode).toBe('iconOnly');
  });

  it('runs the view config prop processors, the background is processed', () => {
    mount(
      ROOT_TAG,
      createElement(ClipboardPasteButton, {
        onPress: vi.fn(),
        backgroundColor: 'red',
      }),
    );

    const node = buttonNode();
    expect(
      node ? live.nodeOf(node.handle).payload.backgroundColor : undefined,
    ).toBe('processed(red)');
  });

  it('registers the view manager when it renders', () => {
    mount(ROOT_TAG, createElement(ClipboardPasteButton, { onPress: vi.fn() }));

    expect(requireNativeViewManager).toHaveBeenCalledWith('ExpoClipboard');
  });
});

describe('ClipboardPasteButton (Negative)', () => {
  it('renders nothing on Android', () => {
    platform.OS = 'android';

    mount(ROOT_TAG, createElement(ClipboardPasteButton, { onPress: vi.fn() }));

    expect(buttonNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
