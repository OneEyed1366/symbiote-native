// Svelte `LivePhotoView` through the real compiler and the recording fabric

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

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 1714;
const VIEW_NAME = 'ViewManagerAdapter_ExpoLivePhoto';

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

let harness = createSvelteHarness('live-photo-view');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('live-photo-view');
  platform.OS = 'ios';
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import LivePhotoView from './live-photo-view.svelte';
   const source = { photoUri: 'file:///a.heic', pairedVideoUri: 'file:///a.mov' };
   let view = $state();
   globalThis.__livePhotoView = () => view;
 </script>
 <LivePhotoView
   bind:this={view}
   {source}
   isMuted={false}
   contentFit="cover"
   onPlaybackStart={globalThis.__onPlaybackStart}
   onLoadError={globalThis.__onLoadError}
 />`;

async function mountProbe(
  name: string,
  handlers: { onPlaybackStart?: () => void; onLoadError?: () => void } = {},
): Promise<void> {
  Reflect.set(globalThis, '__onPlaybackStart', handlers.onPlaybackStart);
  Reflect.set(globalThis, '__onLoadError', handlers.onLoadError);
  const app = harness.compileSource(__dirname, name, PROBE_APP);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function viewNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

function fire(eventName: string, payload: Record<string, unknown>): void {
  const target = viewNode()?.instanceHandle;
  if (typeof target === 'object' && target !== null) {
    fabric.fireEvent(target, eventName, payload);
  }
}

function mountedView(): {
  startPlayback(style?: string): void;
  stopPlayback(): void;
} {
  const read: unknown = Reflect.get(globalThis, '__livePhotoView');
  const view: unknown = typeof read === 'function' ? read() : undefined;
  const start: unknown = Reflect.get(Object(view), 'startPlayback');
  const stop: unknown = Reflect.get(Object(view), 'stopPlayback');
  if (typeof start !== 'function' || typeof stop !== 'function') {
    throw new Error('the component exposes no playback functions');
  }
  return {
    startPlayback: style => start(style),
    stopPlayback: () => stop(),
  };
}

describe('LivePhotoView (Positive)', () => {
  it('paints the native view with its props on iOS', async () => {
    await mountProbe('ios-app');

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      source: { photoUri: 'file:///a.heic', pairedVideoUri: 'file:///a.mov' },
      isMuted: false,
      contentFit: 'cover',
    });
  });

  it('calls onPlaybackStart when the native view starts playing', async () => {
    const onPlaybackStart = vi.fn();
    await mountProbe('playback-app', { onPlaybackStart });

    fire('topPlaybackStart', {});

    expect(onPlaybackStart).toHaveBeenCalledTimes(1);
  });

  it('hands onLoadError the native payload', async () => {
    const onLoadError = vi.fn();
    await mountProbe('error-app', { onLoadError });

    fire('topLoadError', { message: 'broken pair' });

    expect(onLoadError).toHaveBeenCalledWith({ message: 'broken pair' });
  });

  it('starts and stops the playback of the mounted view through the component', async () => {
    await mountProbe('handle-app');

    mountedView().startPlayback('hint');
    mountedView().stopPlayback();

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

    await mountProbe('android-app');

    expect(viewNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
