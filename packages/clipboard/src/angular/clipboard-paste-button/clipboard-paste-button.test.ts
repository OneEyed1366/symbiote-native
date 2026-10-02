// Angular `ClipboardPasteButton`, driven through the recording fabric with an injected view config

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/angular';
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

vi.mock('../../core/native-module', () => ({
  expoClipboard: { isPasteButtonAvailable: true },
  CLIPBOARD_CHANGED_EVENT_NAME: 'onClipboardChanged',
}));

const { ClipboardPasteButton } = await import('.');

const ROOT_TAG = 1515;
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

@Component({
  selector: 'clipboard-paste-button-host',
  standalone: true,
  imports: [ClipboardPasteButton],
  template: `<ClipboardPasteButton
    [onPress]="onPress"
    cornerStyle="large"
    displayMode="iconOnly"
    backgroundColor="red"
  />`,
})
class HostFixture {
  readonly onPress = vi.fn();
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountHost(): Promise<void> {
  mount(ROOT_TAG, HostFixture);
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
    await mountHost();

    expect(buttonPayload()?.cornerStyle).toBe('large');
    expect(buttonPayload()?.displayMode).toBe('iconOnly');
  });

  it('runs the view config prop processors, the background is processed', async () => {
    await mountHost();

    expect(buttonPayload()?.backgroundColor).toBe('processed(red)');
  });

  it('registers the view manager when it renders', async () => {
    await mountHost();

    expect(requireNativeViewManager).toHaveBeenCalledWith('ExpoClipboard');
  });
});

describe('ClipboardPasteButton (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';

    await mountHost();

    expect(buttonPayload()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
