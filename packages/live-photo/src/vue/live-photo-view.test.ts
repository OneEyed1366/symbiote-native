// Vue `LivePhotoView` over the recording fabric with an injected view config

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { ILivePhotoViewHandle } from '../core';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const startPlayback = vi.hoisted(() => vi.fn());
const stopPlayback = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule: () => ({
    ViewPrototypes: { ExpoLivePhoto: { startPlayback, stopPlayback } },
  }),
  UnavailabilityError: class UnavailabilityError extends Error {},
}));

const { LivePhotoView } = await import('./live-photo-view');

const ROOT_TAG = 1712;
const VIEW_NAME = 'ViewManagerAdapter_ExpoLivePhoto';
const SOURCE = { photoUri: 'file:///a.heic', pairedVideoUri: 'file:///a.mov' };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        directEventTypes: {
          topPlaybackStart: { registrationName: 'onPlaybackStart' },
          topLoadError: { registrationName: 'onLoadError' },
        },
        validAttributes: { source: true, isMuted: true, contentFit: true },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let handle: ILivePhotoViewHandle | null = null;

function isHandle(value: unknown): value is ILivePhotoViewHandle {
  return typeof Reflect.get(Object(value), 'startPlayback') === 'function';
}

async function mountView(attrs: Record<string, unknown>): Promise<void> {
  const Host = defineComponent(
    () => (): VNode =>
      h(LivePhotoView, {
        ...attrs,
        ref: (instance: unknown) => {
          handle = isHandle(instance) ? instance : null;
        },
      }),
  );
  mount(ROOT_TAG, { render: (): VNode => h(Host) });
  await tick();
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
  handle = null;
});

afterEach(() => unmount(ROOT_TAG));

function viewNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

function fire(eventName: string, payload: Record<string, unknown>): void {
  const target = viewNode()?.instanceHandle;
  if (typeof target === 'object' && target !== null) {
    fabric.fireEvent(target, eventName, payload);
  }
}

describe('LivePhotoView (Positive)', () => {
  it('paints the native view with its props on iOS', async () => {
    await mountView({ source: SOURCE, isMuted: false, 'content-fit': 'cover' });

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      source: SOURCE,
      isMuted: false,
      contentFit: 'cover',
    });
  });

  it('calls onPlaybackStart when the native view starts playing', async () => {
    const onPlaybackStart = vi.fn();
    await mountView({ source: SOURCE, onPlaybackStart });

    fire('topPlaybackStart', {});

    expect(onPlaybackStart).toHaveBeenCalledTimes(1);
  });

  it('hands onLoadError the native payload', async () => {
    const onLoadError = vi.fn();
    await mountView({ source: SOURCE, onLoadError });

    fire('topLoadError', { message: 'broken pair' });

    expect(onLoadError).toHaveBeenCalledWith({ message: 'broken pair' });
  });

  it('starts and stops the playback of the mounted view through the ref', async () => {
    await mountView({ source: SOURCE });

    handle?.startPlayback('hint');
    handle?.stopPlayback();

    expect(startPlayback).toHaveBeenCalledWith('hint');
    expect(startPlayback.mock.contexts[0]).toEqual({
      nativeTag: expect.any(Number),
    });
    expect(stopPlayback).toHaveBeenCalledTimes(1);
  });
});

describe('LivePhotoView (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await mountView({ source: SOURCE });

    expect(viewNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
