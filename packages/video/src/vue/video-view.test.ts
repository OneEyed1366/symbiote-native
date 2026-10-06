// Vue `VideoView` and `VideoAirPlayButton` over the recording fabric with an injected view config

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

const ROOT_TAG = 1913;
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

const held: { handle: IVideoViewHandle | null } = { handle: null };

function isHandle(value: unknown): value is IVideoViewHandle {
  return typeof Reflect.get(Object(value), 'enterFullscreen') === 'function';
}

async function mountComponent(
  component: typeof VideoView | typeof VideoAirPlayButton,
  attrs: Record<string, unknown>,
): Promise<void> {
  const Host = defineComponent(
    () => (): VNode =>
      h(component, {
        ...attrs,
        ref: (instance: unknown) => {
          held.handle = isHandle(instance) ? instance : null;
        },
      }),
  );
  mount(ROOT_TAG, { render: (): VNode => h(Host) });
  await tick();
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  held.handle = null;
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => unmount(ROOT_TAG));

function nodeNamed(name: string): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === name);
}

describe('VideoView (Positive)', () => {
  it('paints the native view with the id of the player', async () => {
    const player = new expoVideo.VideoPlayer('a.mp4');

    await mountComponent(VideoView, { player, 'content-fit': 'cover' });

    const node = nodeNamed(VIEW_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      player: 41,
      contentFit: 'cover',
    });
  });

  it('calls onFullscreenEnter when the native view enters fullscreen', async () => {
    const onFullscreenEnter = vi.fn();
    await mountComponent(VideoView, { onFullscreenEnter });

    const target = nodeNamed(VIEW_NAME)?.instanceHandle;
    if (typeof target === 'object' && target !== null) {
      fabric.fireEvent(target, 'topFullscreenEnter', {});
    }

    expect(onFullscreenEnter).toHaveBeenCalledTimes(1);
  });

  it('enters fullscreen through the exposed handle', async () => {
    await mountComponent(VideoView, {});

    await held.handle?.enterFullscreen();

    expect(enterFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe('VideoView (Negative)', () => {
  it('renders nothing when the native view cannot register', async () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await mountComponent(VideoView, {});

    expect(nodeNamed(VIEW_NAME)).toBeUndefined();
  });
});

describe('VideoAirPlayButton', () => {
  it('paints the native route picker on iOS', async () => {
    await mountComponent(VideoAirPlayButton, { prioritizeVideoDevices: false });

    const node = nodeNamed(AIRPLAY_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      prioritizeVideoDevices: false,
    });
  });

  it('falls back to a plain view off iOS', async () => {
    platform.OS = 'android';

    await mountComponent(VideoAirPlayButton, { testID: 'airplay' });

    expect(nodeNamed(AIRPLAY_NAME)).toBeUndefined();
  });
});
