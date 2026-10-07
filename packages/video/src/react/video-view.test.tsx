// React `VideoView` and `VideoAirPlayButton` over the recording fabric with an injected view config

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
import type { IVideoViewHandle } from '../core';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const enterFullscreen = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('expo-modules-core', () => {
  class FakeVideoPlayer {
    __expo_shared_object_id__ = 41;
  }
  return {
    Platform: platform,
    requireNativeViewManager,
    requireNativeModule: () => ({
      VideoPlayer: FakeVideoPlayer,
      ViewPrototypes: { ExpoVideo_VideoView: { enterFullscreen } },
    }),
  };
});

const { VideoView, VideoAirPlayButton } = await import('./video-view');
const { expoVideo } = await import('../core/native-module');

const ROOT_TAG = 1912;
const VIEW_NAME = 'ViewManagerAdapter_ExpoVideo_VideoView';
const AIRPLAY_NAME = 'ViewManagerAdapter_ExpoVideo_VideoAirPlayButtonView';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name => {
  if (name === VIEW_NAME) {
    return {
      directEventTypes: {
        topFullscreenEnter: { registrationName: 'onFullscreenEnter' },
      },
      validAttributes: { player: true, contentFit: true },
    };
  }
  if (name === AIRPLAY_NAME) {
    return {
      directEventTypes: {
        topBeginPresentingRoutes: {
          registrationName: 'onBeginPresentingRoutes',
        },
      },
      validAttributes: { prioritizeVideoDevices: true },
    };
  }
  return undefined;
});

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => unmount(ROOT_TAG));

function nodeNamed(name: string): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === name);
}

function fire(name: string, eventName: string): void {
  const target = nodeNamed(name)?.instanceHandle;
  if (typeof target === 'object' && target !== null) {
    fabric.fireEvent(target, eventName, {});
  }
}

describe('VideoView (Positive)', () => {
  it('paints the native view with the id of the player', () => {
    const player = new expoVideo.VideoPlayer('a.mp4');

    mount(ROOT_TAG, createElement(VideoView, { player, contentFit: 'cover' }));

    const node = nodeNamed(VIEW_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      player: 41,
      contentFit: 'cover',
    });
  });

  it('calls onFullscreenEnter when the native view enters fullscreen', () => {
    const onFullscreenEnter = vi.fn();
    mount(ROOT_TAG, createElement(VideoView, { onFullscreenEnter }));

    fire(VIEW_NAME, 'topFullscreenEnter');

    expect(onFullscreenEnter).toHaveBeenCalledTimes(1);
  });

  it('enters fullscreen through the ref', async () => {
    const ref = createRef<IVideoViewHandle>();
    mount(ROOT_TAG, createElement(VideoView, { ref }));

    await ref.current?.enterFullscreen();

    expect(enterFullscreen).toHaveBeenCalledTimes(1);
    expect(enterFullscreen.mock.contexts[0]).toEqual({
      nativeTag: expect.any(Number),
    });
  });
});

describe('VideoView (Negative)', () => {
  it('renders nothing when the native view cannot register', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mount(ROOT_TAG, createElement(VideoView, {}));

    expect(nodeNamed(VIEW_NAME)).toBeUndefined();
  });
});

describe('VideoAirPlayButton', () => {
  it('paints the native route picker on iOS', () => {
    mount(
      ROOT_TAG,
      createElement(VideoAirPlayButton, { prioritizeVideoDevices: false }),
    );

    const node = nodeNamed(AIRPLAY_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      prioritizeVideoDevices: false,
    });
  });

  it('calls onBeginPresentingRoutes when the picker is about to show', () => {
    const onBeginPresentingRoutes = vi.fn();
    mount(
      ROOT_TAG,
      createElement(VideoAirPlayButton, { onBeginPresentingRoutes }),
    );

    fire(AIRPLAY_NAME, 'topBeginPresentingRoutes');

    expect(onBeginPresentingRoutes).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain view off iOS', () => {
    platform.OS = 'android';

    mount(ROOT_TAG, createElement(VideoAirPlayButton, { testID: 'airplay' }));

    expect(nodeNamed(AIRPLAY_NAME)).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
