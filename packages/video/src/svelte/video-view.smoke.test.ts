// Svelte `VideoView` and `VideoAirPlayButton` through the real compiler and the recording fabric

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

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

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 1917;
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

let harness = createSvelteHarness('video-view');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  harness = createSvelteHarness('video-view');
  platform.OS = 'ios';
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const VIEW_APP = `<script lang="ts">
   import VideoView from './video-view.svelte';
   let view = $state();
   globalThis.__videoView = () => view;
 </script>
 <VideoView
   bind:this={view}
   contentFit="cover"
   onFullscreenEnter={globalThis.__onFullscreenEnter}
 />`;

const AIRPLAY_APP = `<script lang="ts">
   import VideoAirPlayButton from './video-airplay-button.svelte';
 </script>
 <VideoAirPlayButton prioritizeVideoDevices={false} />`;

async function mountApp(
  name: string,
  source: string,
  onFullscreenEnter?: () => void,
): Promise<void> {
  Reflect.set(globalThis, '__onFullscreenEnter', onFullscreenEnter);
  const app = harness.compileSource(__dirname, name, source);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function nodeNamed(name: string): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === name);
}

function enterFullscreenOfMountedView(): Promise<unknown> {
  const read: unknown = Reflect.get(globalThis, '__videoView');
  const view: unknown = typeof read === 'function' ? read() : undefined;
  const enter: unknown = Reflect.get(Object(view), 'enterFullscreen');
  if (typeof enter !== 'function') throw new Error('no enterFullscreen');
  return enter();
}

describe('VideoView (Positive)', () => {
  it('paints the native view with its props', async () => {
    await mountApp('props-app', VIEW_APP);

    const node = nodeNamed(VIEW_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      contentFit: 'cover',
    });
  });

  it('calls onFullscreenEnter when the native view enters fullscreen', async () => {
    const onFullscreenEnter = vi.fn();
    await mountApp('event-app', VIEW_APP, onFullscreenEnter);

    const target = nodeNamed(VIEW_NAME)?.instanceHandle;
    if (typeof target === 'object' && target !== null) {
      fabric.fireEvent(target, 'topFullscreenEnter', {});
    }

    expect(onFullscreenEnter).toHaveBeenCalledTimes(1);
  });

  it('enters fullscreen through the component', async () => {
    await mountApp('handle-app', VIEW_APP);

    await enterFullscreenOfMountedView();

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

    await mountApp('missing-app', VIEW_APP);

    expect(nodeNamed(VIEW_NAME)).toBeUndefined();
  });
});

describe('VideoAirPlayButton', () => {
  it('paints the native route picker on iOS', async () => {
    await mountApp('airplay-app', AIRPLAY_APP);

    const node = nodeNamed(AIRPLAY_NAME);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      prioritizeVideoDevices: false,
    });
  });

  it('falls back to a plain view off iOS', async () => {
    platform.OS = 'android';

    await mountApp('airplay-fallback-app', AIRPLAY_APP);

    expect(nodeNamed(AIRPLAY_NAME)).toBeUndefined();
  });
});
