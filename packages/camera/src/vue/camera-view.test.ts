// Vue `CameraView` over the recording fabric with an injected view config

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
import type { ICameraViewHandle } from '../core';

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

const { CameraView } = await import('./camera-view');

const ROOT_TAG = 1813;
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

let handle: ICameraViewHandle | null = null;

function isHandle(value: unknown): value is ICameraViewHandle {
  return typeof Reflect.get(Object(value), 'takePictureAsync') === 'function';
}

async function mountView(attrs: Record<string, unknown>): Promise<void> {
  const Host = defineComponent(
    () => (): VNode =>
      h(CameraView, {
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
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  handle = null;
  Reflect.set(globalThis, '__DEV__', true);
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

describe('CameraView (Positive)', () => {
  it('paints the native view with the converted props', async () => {
    await mountView({ facing: 'front', flash: 'on', zoom: 0.5 });

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      facing: 'front',
      flashMode: 'on',
      zoom: 0.5,
    });
  });

  it('calls onCameraReady when the preview is ready', async () => {
    const onCameraReady = vi.fn();
    await mountView({ onCameraReady });

    fire('topCameraReady', {});

    expect(onCameraReady).toHaveBeenCalledTimes(1);
  });

  it('hands onMountError the native payload', async () => {
    const onMountError = vi.fn();
    await mountView({ onMountError });

    fire('topMountError', { message: 'no camera' });

    expect(onMountError).toHaveBeenCalledWith({ message: 'no camera' });
  });

  it('takes a picture of the mounted view through the exposed handle', async () => {
    await mountView({});

    const picture = await handle?.takePictureAsync({ quality: 0.5 });

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

    await mountView({});

    expect(viewNode()).toBeUndefined();
  });
});
