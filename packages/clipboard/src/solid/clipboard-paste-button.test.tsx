// Solid `ClipboardPasteButton`, driven through the recording fabric with an injected view config

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/solid';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { IClipboardPasteButtonProps } from '../core';

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

const ROOT_TAG = 1513;
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
          backgroundColor: { process: fakeColor },
        },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountButton(props: IClipboardPasteButtonProps): Promise<void> {
  mount(ROOT_TAG, () => <ClipboardPasteButton {...props} />);
  await tick();
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
});

afterEach(() => unmount(ROOT_TAG));

function buttonPayload(): Record<string, unknown> | undefined {
  const node = fabric.find(candidate => candidate.viewName === VIEW_NAME);
  return node ? live.nodeOf(node.handle).payload : undefined;
}

describe('ClipboardPasteButton (Positive)', () => {
  it('paints the native view with its props on iOS', async () => {
    await mountButton({
      onPress: vi.fn(),
      cornerStyle: 'large',
      displayMode: 'iconOnly',
    });

    expect(buttonPayload()?.cornerStyle).toBe('large');
    expect(buttonPayload()?.displayMode).toBe('iconOnly');
  });

  it('runs the view config prop processors, the background is processed', async () => {
    await mountButton({ onPress: vi.fn(), backgroundColor: 'red' });

    expect(buttonPayload()?.backgroundColor).toBe('processed(red)');
  });

  it('follows a reactive prop without recreating the native node', async () => {
    const [style, setStyle] = createSignal<'large' | 'small'>('large');
    mount(ROOT_TAG, () => (
      <ClipboardPasteButton onPress={vi.fn()} cornerStyle={style()} />
    ));
    await tick();
    const created = fabric.find(candidate => candidate.viewName === VIEW_NAME);

    setStyle('small');
    await tick();

    expect(buttonPayload()?.cornerStyle).toBe('small');
    expect(fabric.find(candidate => candidate.viewName === VIEW_NAME)).toBe(
      created,
    );
  });

  it('registers the view manager when it renders', async () => {
    await mountButton({ onPress: vi.fn() });

    expect(requireNativeViewManager).toHaveBeenCalledWith('ExpoClipboard');
  });
});

describe('ClipboardPasteButton (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';

    await mountButton({ onPress: vi.fn() });

    expect(buttonPayload()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
