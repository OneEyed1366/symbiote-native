// Solid `VideoView` and `VideoAirPlayButton` over the recording fabric with an injected view config

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

const ROOT_TAG = 1915;
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
      directEventTypes: {},
      validAttributes: { prioritizeVideoDevices: true },
    };
  }
  return undefined;
});

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

describe('VideoView (Positive)', () => {
  it('paints the native view with the id of the player', async () => {
    const player = new expoVideo.VideoPlayer('a.mp4');
    mount(ROOT_TAG, () => <VideoView player={player} contentFit="cover" />);
    await tick();

    const node = nodeNamed(VIEW_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      player: 41,
      contentFit: 'cover',
    });
  });

  it('calls onFullscreenEnter when the native view enters fullscreen', async () => {
    const onFullscreenEnter = vi.fn();
    mount(ROOT_TAG, () => <VideoView onFullscreenEnter={onFullscreenEnter} />);
    await tick();

    const target = nodeNamed(VIEW_NAME)?.instanceHandle;
    if (typeof target === 'object' && target !== null) {
      fabric.fireEvent(target, 'topFullscreenEnter', {});
    }

    expect(onFullscreenEnter).toHaveBeenCalledTimes(1);
  });

  it('hands the ref the handle that drives the mounted view', async () => {
    const received: { handle: IVideoViewHandle | null } = { handle: null };
    mount(ROOT_TAG, () => (
      <VideoView
        ref={(value: IVideoViewHandle) => {
          received.handle = value;
        }}
      />
    ));
    await tick();

    await received.handle?.enterFullscreen();

    expect(enterFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe('VideoView (Negative)', () => {
  it('renders nothing when the native view cannot register', async () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mount(ROOT_TAG, () => <VideoView />);
    await tick();

    expect(nodeNamed(VIEW_NAME)).toBeUndefined();
  });
});

describe('VideoAirPlayButton', () => {
  it('paints the native route picker on iOS', async () => {
    mount(ROOT_TAG, () => (
      <VideoAirPlayButton prioritizeVideoDevices={false} />
    ));
    await tick();

    const node = nodeNamed(AIRPLAY_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      prioritizeVideoDevices: false,
    });
  });

  it('falls back to a plain view off iOS', async () => {
    platform.OS = 'android';
    mount(ROOT_TAG, () => <VideoAirPlayButton testID="airplay" />);
    await tick();

    expect(nodeNamed(AIRPLAY_NAME)).toBeUndefined();
  });
});
