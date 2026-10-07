// Angular `VideoView` and `VideoAirPlayButton` over the recording fabric and an injected config

import '@angular/compiler';
import { Component, ViewChild } from '@angular/core';
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
const enterFullscreen = vi.hoisted(() => vi.fn(async () => undefined));
const onFullscreenEnter = vi.hoisted(() => vi.fn());

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

const { VideoView } = await import('.');
const { VideoAirPlayButton } = await import('../video-airplay-button');
const { expoVideo } = await import('../../core/native-module');

const ROOT_TAG = 1918;
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

let host: HostFixture | undefined;

@Component({
  selector: 'video-host',
  standalone: true,
  imports: [VideoView, VideoAirPlayButton],
  template: `<VideoView
      [player]="player"
      contentFit="cover"
      [onFullscreenEnter]="onFullscreenEnter"
    />
    <VideoAirPlayButton [prioritizeVideoDevices]="false" />`,
})
class HostFixture {
  @ViewChild(VideoView) view?: InstanceType<typeof VideoView>;
  readonly player = new expoVideo.VideoPlayer('a.mp4');
  readonly onFullscreenEnter = onFullscreenEnter;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
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
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  host = undefined;
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => unmount(ROOT_TAG));

function nodeNamed(name: string): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === name);
}

describe('VideoView (Positive)', () => {
  it('paints the native view with the id of the player', async () => {
    await mountHost();

    const node = nodeNamed(VIEW_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      player: 41,
      contentFit: 'cover',
    });
  });

  it('calls onFullscreenEnter when the native view enters fullscreen', async () => {
    await mountHost();

    const target = nodeNamed(VIEW_NAME)?.instanceHandle;
    if (typeof target === 'object' && target !== null) {
      fabric.fireEvent(target, 'topFullscreenEnter', {});
    }

    expect(onFullscreenEnter).toHaveBeenCalledTimes(1);
  });

  it('enters fullscreen through the component', async () => {
    await mountHost();

    await host?.view?.enterFullscreen();

    expect(enterFullscreen).toHaveBeenCalledTimes(1);
    expect(enterFullscreen.mock.contexts[0]).toEqual({
      nativeTag: expect.any(Number),
    });
  });
});

describe('VideoView (Negative)', () => {
  it('renders nothing when the native view cannot register', async () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await mountHost();

    expect(nodeNamed(VIEW_NAME)).toBeUndefined();
  });
});

describe('VideoAirPlayButton', () => {
  it('paints the native route picker on iOS', async () => {
    await mountHost();

    const node = nodeNamed(AIRPLAY_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      prioritizeVideoDevices: false,
    });
  });
});
