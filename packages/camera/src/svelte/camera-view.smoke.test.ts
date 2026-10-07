// Svelte `CameraView` through the real compiler and the recording fabric

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
const takePicture = vi.hoisted(() =>
  vi.fn(async () => ({ uri: 'file:///p.jpg' })),
);

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule: () => ({
    Type: { front: 1, back: 0 },
    FlashMode: { off: 0, on: 1, auto: 2, screen: 3 },
    isModernBarcodeScannerAvailable: false,
    toggleRecordingAsyncAvailable: false,
    ViewPrototypes: { ExpoCamera: { takePicture } },
  }),
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 1817;
const VIEW_NAME = 'ViewManagerAdapter_ExpoCamera';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        directEventTypes: {
          topCameraReady: { registrationName: 'onCameraReady' },
          topMountError: { registrationName: 'onMountError' },
        },
        validAttributes: { facing: true, flashMode: true, zoom: true },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('camera-view');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  harness = createSvelteHarness('camera-view');
  platform.OS = 'ios';
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import CameraView from './camera-view.svelte';
   let view = $state();
   globalThis.__cameraView = () => view;
 </script>
 <CameraView
   bind:this={view}
   facing="front"
   flash="on"
   zoom={0.5}
   onCameraReady={globalThis.__onCameraReady}
   onMountError={globalThis.__onMountError}
 />`;

async function mountProbe(
  name: string,
  handlers: { onCameraReady?: () => void; onMountError?: () => void } = {},
): Promise<void> {
  Reflect.set(globalThis, '__onCameraReady', handlers.onCameraReady);
  Reflect.set(globalThis, '__onMountError', handlers.onMountError);
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

function takePictureOfMountedView(): Promise<unknown> {
  const read: unknown = Reflect.get(globalThis, '__cameraView');
  const view: unknown = typeof read === 'function' ? read() : undefined;
  const take: unknown = Reflect.get(Object(view), 'takePictureAsync');
  if (typeof take !== 'function') throw new Error('no takePictureAsync');
  return take({ quality: 0.5 });
}

describe('CameraView (Positive)', () => {
  it('paints the native view with the converted props', async () => {
    await mountProbe('props-app');

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      facing: 'front',
      flashMode: 'on',
      zoom: 0.5,
    });
  });

  it('calls onCameraReady when the preview is ready', async () => {
    const onCameraReady = vi.fn();
    await mountProbe('ready-app', { onCameraReady });

    fire('topCameraReady', {});

    expect(onCameraReady).toHaveBeenCalledTimes(1);
  });

  it('hands onMountError the native payload', async () => {
    const onMountError = vi.fn();
    await mountProbe('error-app', { onMountError });

    fire('topMountError', { message: 'no camera' });

    expect(onMountError).toHaveBeenCalledWith({ message: 'no camera' });
  });

  it('takes a picture of the mounted view through the component', async () => {
    await mountProbe('handle-app');

    const picture = await takePictureOfMountedView();

    expect(picture).toEqual({ uri: 'file:///p.jpg' });
    expect(takePicture.mock.contexts[0]).toEqual({
      nativeTag: expect.any(Number),
    });
  });
});

describe('CameraView (Negative)', () => {
  it('renders nothing when the native view cannot register', async () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await mountProbe('missing-app');

    expect(viewNode()).toBeUndefined();
  });
});
