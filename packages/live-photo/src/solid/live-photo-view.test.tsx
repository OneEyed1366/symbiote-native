// Solid `LivePhotoView` over the recording fabric with an injected view config

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

const ROOT_TAG = 1713;
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

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
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
    mount(ROOT_TAG, () => (
      <LivePhotoView source={SOURCE} isMuted={false} contentFit="cover" />
    ));
    await tick();

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      source: SOURCE,
      isMuted: false,
      contentFit: 'cover',
    });
  });

  it('follows a reactive prop without recreating the native node', async () => {
    const [muted, setMuted] = createSignal(true);
    mount(ROOT_TAG, () => <LivePhotoView source={SOURCE} isMuted={muted()} />);
    await tick();
    const before = viewNode()?.handle;

    setMuted(false);
    await tick();

    const node = viewNode();
    expect(node?.handle).toBe(before);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      isMuted: false,
    });
  });

  it('calls onPlaybackStart when the native view starts playing', async () => {
    const onPlaybackStart = vi.fn();
    mount(ROOT_TAG, () => (
      <LivePhotoView source={SOURCE} onPlaybackStart={onPlaybackStart} />
    ));
    await tick();

    fire('topPlaybackStart', {});

    expect(onPlaybackStart).toHaveBeenCalledTimes(1);
  });

  it('hands onLoadError the native payload', async () => {
    const onLoadError = vi.fn();
    mount(ROOT_TAG, () => (
      <LivePhotoView source={SOURCE} onLoadError={onLoadError} />
    ));
    await tick();

    fire('topLoadError', { message: 'broken pair' });

    expect(onLoadError).toHaveBeenCalledWith({ message: 'broken pair' });
  });

  it('hands the ref the handle that drives the mounted view', async () => {
    const received: { handle: ILivePhotoViewHandle | null } = { handle: null };
    mount(ROOT_TAG, () => (
      <LivePhotoView
        source={SOURCE}
        ref={(value: ILivePhotoViewHandle) => {
          received.handle = value;
        }}
      />
    ));
    await tick();

    received.handle?.startPlayback('hint');
    received.handle?.stopPlayback();

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

    mount(ROOT_TAG, () => <LivePhotoView source={SOURCE} />);
    await tick();

    expect(viewNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
