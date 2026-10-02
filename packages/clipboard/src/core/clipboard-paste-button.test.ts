// Framework-agnostic half of `ClipboardPasteButton`, an Expo native view on `UIPasteControl`

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISymbioteEvent } from '@symbiote-native/engine';

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
  CLIPBOARD_PASTE_BUTTON_MODULE_NAME,
  clipboardPasteButtonViewName,
  ensureClipboardPasteButtonRegistered,
  renderClipboardPasteButton,
  toPasteEventPayload,
} = await import('./clipboard-paste-button');

const TEXT_EVENT = { type: 'text', text: 'hello' };
const IMAGE_EVENT = {
  type: 'image',
  data: 'data:image/png;base64,abc',
  size: { width: 2, height: 3 },
};

function eventWith(nativeEvent: Record<string, unknown>): ISymbioteEvent {
  return { nativeEvent } as ISymbioteEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.deleteProperty(globalThis, 'expo');
});

describe('clipboardPasteButtonViewName', () => {
  it('names the Expo view-manager adapter after the module', () => {
    expect(clipboardPasteButtonViewName()).toBe(
      'ViewManagerAdapter_ExpoClipboard',
    );
  });

  it('appends the app identifier the way requireNativeViewManager does', () => {
    Reflect.set(globalThis, 'expo', { __expo_app_identifier__: 'abc' });

    expect(clipboardPasteButtonViewName()).toBe(
      'ViewManagerAdapter_ExpoClipboard_abc',
    );
  });
});

describe('ensureClipboardPasteButtonRegistered', () => {
  it('registers the view config through requireNativeViewManager on iOS', () => {
    expect(ensureClipboardPasteButtonRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      CLIPBOARD_PASTE_BUTTON_MODULE_NAME,
    );
  });

  it('does not touch the view manager on Android', () => {
    platform.OS = 'android';

    expect(ensureClipboardPasteButtonRegistered()).toBe(false);
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });

  it('reports false when registration throws instead of crashing the render', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });

    expect(ensureClipboardPasteButtonRegistered()).toBe(false);
  });
});

describe('toPasteEventPayload', () => {
  it('reads a text payload', () => {
    expect(toPasteEventPayload(eventWith(TEXT_EVENT))).toEqual(TEXT_EVENT);
  });

  it('reads an image payload', () => {
    expect(toPasteEventPayload(eventWith(IMAGE_EVENT))).toEqual(IMAGE_EVENT);
  });

  it('rejects an unknown type', () => {
    expect(
      toPasteEventPayload(eventWith({ type: 'url', text: 'x' })),
    ).toBeNull();
  });

  it('rejects a text payload without text', () => {
    expect(toPasteEventPayload(eventWith({ type: 'text' }))).toBeNull();
  });

  it('rejects an image payload without data or size', () => {
    expect(
      toPasteEventPayload(eventWith({ type: 'image', data: 'x' })),
    ).toBeNull();
  });
});

describe('renderClipboardPasteButton', () => {
  it('describes the native view with the props passed through', () => {
    const descriptor = renderClipboardPasteButton({
      onPress: vi.fn(),
      backgroundColor: 'red',
      foregroundColor: 'white',
      cornerStyle: 'large',
      displayMode: 'iconOnly',
      acceptedContentTypes: ['plain-text', 'url'],
      imageOptions: { format: 'jpeg', jpegQuality: 0.5 },
      testID: 'paste',
    });

    expect(descriptor?.type).toBe('ViewManagerAdapter_ExpoClipboard');
    expect(descriptor?.props).toMatchObject({
      backgroundColor: 'red',
      foregroundColor: 'white',
      cornerStyle: 'large',
      displayMode: 'iconOnly',
      acceptedContentTypes: ['plain-text', 'url'],
      imageOptions: { format: 'jpeg', jpegQuality: 0.5 },
      testID: 'paste',
    });
    expect(descriptor?.props).not.toHaveProperty('onPress');
  });

  it('turns the native paste event into onPress with the payload', () => {
    const onPress = vi.fn();
    const descriptor = renderClipboardPasteButton({ onPress });
    const handler = descriptor?.props['onPastePressed'];

    if (typeof handler !== 'function')
      throw new Error('onPastePressed is not a function');
    handler(eventWith(TEXT_EVENT));

    expect(onPress).toHaveBeenCalledWith(TEXT_EVENT);
  });

  it('ignores a malformed paste event', () => {
    const onPress = vi.fn();
    const descriptor = renderClipboardPasteButton({ onPress });
    const handler = descriptor?.props['onPastePressed'];

    if (typeof handler !== 'function')
      throw new Error('onPastePressed is not a function');
    handler(eventWith({ type: 'other' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders nothing on Android', () => {
    platform.OS = 'android';

    expect(renderClipboardPasteButton({ onPress: vi.fn() })).toBeNull();
  });

  it('renders nothing when the view config could not be registered', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });

    expect(renderClipboardPasteButton({ onPress: vi.fn() })).toBeNull();
  });
});
