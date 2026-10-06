// React `LivePhotoView` over the recording fabric with an injected view config

import { createElement, createRef } from 'react';
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

const ROOT_TAG = 1711;
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
  const handle = viewNode()?.instanceHandle;
  if (typeof handle === 'object' && handle !== null) {
    fabric.fireEvent(handle, eventName, payload);
  }
}

describe('LivePhotoView (Positive)', () => {
  it('paints the native view with its props on iOS', () => {
    mount(
      ROOT_TAG,
      createElement(LivePhotoView, {
        source: SOURCE,
        isMuted: false,
        contentFit: 'cover',
      }),
    );

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      source: SOURCE,
      isMuted: false,
      contentFit: 'cover',
    });
  });

  it('calls onPlaybackStart when the native view starts playing', () => {
    const onPlaybackStart = vi.fn();
    mount(
      ROOT_TAG,
      createElement(LivePhotoView, { source: SOURCE, onPlaybackStart }),
    );

    fire('topPlaybackStart', {});

    expect(onPlaybackStart).toHaveBeenCalledTimes(1);
  });

  it('hands onLoadError the native payload', () => {
    const onLoadError = vi.fn();
    mount(
      ROOT_TAG,
      createElement(LivePhotoView, { source: SOURCE, onLoadError }),
    );

    fire('topLoadError', { message: 'broken pair' });

    expect(onLoadError).toHaveBeenCalledWith({ message: 'broken pair' });
  });

  it('starts the playback of the mounted view through the ref', () => {
    const ref = createRef<ILivePhotoViewHandle>();
    mount(ROOT_TAG, createElement(LivePhotoView, { source: SOURCE, ref }));

    ref.current?.startPlayback('hint');

    expect(startPlayback).toHaveBeenCalledWith('hint');
    expect(startPlayback.mock.contexts[0]).toEqual({
      nativeTag: expect.any(Number),
    });
  });

  it('stops the playback through the ref', () => {
    const ref = createRef<ILivePhotoViewHandle>();
    mount(ROOT_TAG, createElement(LivePhotoView, { source: SOURCE, ref }));

    ref.current?.stopPlayback();

    expect(stopPlayback).toHaveBeenCalledTimes(1);
  });
});

describe('LivePhotoView (Negative)', () => {
  it('renders nothing on Android', () => {
    platform.OS = 'android';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mount(ROOT_TAG, createElement(LivePhotoView, { source: SOURCE }));

    expect(viewNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
