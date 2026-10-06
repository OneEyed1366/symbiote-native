// Angular `CameraView` over the recording fabric with an injected view config

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
const takePicture = vi.hoisted(() =>
  vi.fn(async () => ({ uri: 'file:///p.jpg' })),
);
const handlers = vi.hoisted(() => ({
  onCameraReady: vi.fn(),
  onMountError: vi.fn(),
}));

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

const { CameraView } = await import('.');

const ROOT_TAG = 1818;
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

let host: HostFixture | undefined;

@Component({
  selector: 'camera-host',
  standalone: true,
  imports: [CameraView],
  template: `<CameraView
    facing="front"
    flash="on"
    [zoom]="0.5"
    [onCameraReady]="onCameraReady"
    [onMountError]="onMountError"
  />`,
})
class HostFixture {
  @ViewChild(CameraView) view?: InstanceType<typeof CameraView>;
  readonly onCameraReady = handlers.onCameraReady;
  readonly onMountError = handlers.onMountError;

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
  it('paints the native view with the converted inputs', async () => {
    await mountHost();

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      facing: 'front',
      flashMode: 'on',
      zoom: 0.5,
    });
  });

  it('calls onCameraReady when the preview is ready', async () => {
    await mountHost();

    fire('topCameraReady', {});

    expect(handlers.onCameraReady).toHaveBeenCalledTimes(1);
  });

  it('hands onMountError the native payload', async () => {
    await mountHost();

    fire('topMountError', { message: 'no camera' });

    expect(handlers.onMountError).toHaveBeenCalledWith({
      message: 'no camera',
    });
  });

  it('takes a picture of the mounted view through the component', async () => {
    await mountHost();

    const picture = await host?.view?.takePictureAsync({ quality: 0.5 });

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

    await mountHost();

    expect(viewNode()).toBeUndefined();
  });
});
