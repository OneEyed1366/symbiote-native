// React `CameraView` over the recording fabric with an injected view config

import { createElement, createRef, useState } from 'react';
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

const ROOT_TAG = 1811;
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

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
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
  it('paints the native view with the converted props', () => {
    mount(
      ROOT_TAG,
      createElement(CameraView, { facing: 'front', flash: 'on', zoom: 0.5 }),
    );

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      facing: 'front',
      flashMode: 'on',
      zoom: 0.5,
    });
  });

  it('calls onCameraReady when the preview is ready', () => {
    const onCameraReady = vi.fn();
    mount(ROOT_TAG, createElement(CameraView, { onCameraReady }));

    fire('topCameraReady', {});

    expect(onCameraReady).toHaveBeenCalledTimes(1);
  });

  it('hands onMountError the native payload', () => {
    const onMountError = vi.fn();
    mount(ROOT_TAG, createElement(CameraView, { onMountError }));

    fire('topMountError', { message: 'no camera' });

    expect(onMountError).toHaveBeenCalledWith({ message: 'no camera' });
  });

  it('takes a picture of the mounted view through the ref', async () => {
    const ref = createRef<ICameraViewHandle>();
    mount(ROOT_TAG, createElement(CameraView, { ref }));

    const picture = await ref.current?.takePictureAsync({ quality: 0.5 });

    expect(picture).toEqual({ uri: 'file:///p.jpg' });
    expect(takePicture).toHaveBeenCalledWith({ quality: 0.5 });
    expect(takePicture.mock.contexts[0]).toEqual({
      nativeTag: expect.any(Number),
    });
  });

  it('keeps one handle across renders', async () => {
    const ref = createRef<ICameraViewHandle>();
    const setter: { zoom: (value: number) => void } = { zoom: () => undefined };
    function Parent() {
      const [zoom, setZoom] = useState(0);
      setter.zoom = setZoom;
      return createElement(CameraView, { ref, zoom });
    }
    mount(ROOT_TAG, createElement(Parent));
    const first = ref.current;

    setter.zoom(0.2);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(ref.current).toBe(first);
    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      zoom: 0.2,
    });
  });
});

describe('CameraView (Negative)', () => {
  it('renders nothing when the native view cannot register', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mount(ROOT_TAG, createElement(CameraView, {}));

    expect(viewNode()).toBeUndefined();
  });
});
