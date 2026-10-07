// Framework-agnostic half of `CameraView`, an Expo native view driven through its view functions

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createElement, createSurface } from '@symbiote-native/engine';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const viewFunctions = vi.hoisted(() => ({
  takePicture: vi.fn(async () => ({ uri: 'file:///p.jpg' })),
  takePictureRef: vi.fn(async () => ({ width: 1, height: 1 })),
  record: vi.fn(async () => ({ uri: 'file:///v.mp4' })),
  toggleRecording: vi.fn(async () => undefined),
  stopRecording: vi.fn(async () => undefined),
  pausePreview: vi.fn(async () => undefined),
  resumePreview: vi.fn(async () => undefined),
  getAvailablePictureSizes: vi.fn(async () => ['640x480']),
  getAvailableLenses: vi.fn(async () => ['builtInWideAngleCamera']),
}));

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule: () => ({
    Type: { front: 1, back: 0 },
    FlashMode: { off: 0, on: 1, auto: 2, screen: 3 },
    isModernBarcodeScannerAvailable: true,
    toggleRecordingAsyncAvailable: false,
    ViewPrototypes: { ExpoCamera: viewFunctions },
  }),
}));

const { createCameraView, cameraViewName, ensureCameraViewRegistered } =
  await import('./camera-view');

installRecordingFabric();

let nextRootTag = 9_900;

function mountedNode() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.deleteProperty(globalThis, 'expo');
  Reflect.set(globalThis, '__DEV__', true);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  warn.mockClear();
});

afterEach(() => {
  warn.mockRestore();
  Reflect.deleteProperty(globalThis, '__DEV__');
});

describe('cameraViewName and ensureCameraViewRegistered', () => {
  it('names the Expo view-manager adapter after the module', () => {
    expect(cameraViewName()).toBe('ViewManagerAdapter_ExpoCamera');
  });

  it('registers the view of the module', () => {
    expect(ensureCameraViewRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith('ExpoCamera');
  });
});

describe('createCameraView render', () => {
  it('renders the native view with the defaults of upstream under the props', () => {
    const view = createCameraView(() => null);

    const descriptor = view.render({ flash: 'on', zoom: 0.4 });

    expect(descriptor?.type).toBe('ViewManagerAdapter_ExpoCamera');
    expect(descriptor?.props).toMatchObject({
      facing: 'back',
      mode: 'picture',
      enableTorch: false,
      zoom: 0.4,
      flash: 1,
      flashMode: 'on',
    });
  });

  it('wires the native events', () => {
    const descriptor = createCameraView(() => null).render({});

    expect(descriptor?.props).toMatchObject({
      onCameraReady: expect.any(Function),
      onMountError: expect.any(Function),
      onPictureSaved: expect.any(Function),
    });
  });

  it('renders nothing and warns in a dev build when the view cannot register', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });

    expect(createCameraView(() => null).render({})).toBeNull();
    expect(warn).toHaveBeenCalledWith("'CameraView' is not available.");
  });
});

describe('createCameraView handle (Positive)', () => {
  it('takes a picture through the view function', async () => {
    const node = mountedNode();

    const picture = await createCameraView(
      () => node,
    ).handle.takePictureAsync();

    expect(picture).toEqual({ uri: 'file:///p.jpg' });
    expect(viewFunctions.takePicture).toHaveBeenCalledWith({});
  });

  it('asks for a picture ref on iOS when pictureRef is set', async () => {
    const node = mountedNode();

    await createCameraView(() => node).handle.takePictureAsync({
      pictureRef: true,
    });

    expect(viewFunctions.takePictureRef).toHaveBeenCalledWith({
      pictureRef: true,
      quality: 1,
    });
    expect(viewFunctions.takePicture).not.toHaveBeenCalled();
  });

  it('takes a plain picture on Android even when pictureRef is set', async () => {
    platform.OS = 'android';
    const node = mountedNode();

    await createCameraView(() => node).handle.takePictureAsync({
      pictureRef: true,
    });

    expect(viewFunctions.takePicture).toHaveBeenCalledTimes(1);
  });

  it('records, toggles and stops a recording', async () => {
    const { handle } = createCameraView(() => mountedNode());

    const recording = await handle.recordAsync({ maxDuration: 5 });
    await handle.toggleRecordingAsync();
    handle.stopRecording();

    expect(recording).toEqual({ uri: 'file:///v.mp4' });
    expect(viewFunctions.record).toHaveBeenCalledWith({ maxDuration: 5 });
    expect(viewFunctions.toggleRecording).toHaveBeenCalledTimes(1);
    expect(viewFunctions.stopRecording).toHaveBeenCalledTimes(1);
  });

  it('pauses and resumes the preview', async () => {
    const { handle } = createCameraView(() => mountedNode());

    await handle.pausePreview();
    await handle.resumePreview();

    expect(viewFunctions.pausePreview).toHaveBeenCalledTimes(1);
    expect(viewFunctions.resumePreview).toHaveBeenCalledTimes(1);
  });

  it('lists the picture sizes and the lenses', async () => {
    const { handle } = createCameraView(() => mountedNode());

    expect(await handle.getAvailablePictureSizesAsync()).toEqual(['640x480']);
    expect(await handle.getAvailableLensesAsync()).toEqual([
      'builtInWideAngleCamera',
    ]);
  });

  it('hands out the host node of a mounted view, for a GL camera texture', () => {
    const node = mountedNode();

    expect(createCameraView(() => node).handle.getHostNode()).toBe(node);
  });

  it('reports what the device supports', () => {
    expect(createCameraView(() => null).handle.getSupportedFeatures()).toEqual({
      isModernBarcodeScannerAvailable: true,
      toggleRecordingAsyncAvailable: false,
    });
  });
});

describe('createCameraView handle (Negative)', () => {
  it('answers nothing before the view has mounted', async () => {
    const { handle } = createCameraView(() => null);

    expect(await handle.takePictureAsync()).toBeUndefined();
    expect(await handle.recordAsync()).toBeUndefined();
    expect(await handle.toggleRecordingAsync()).toBeUndefined();
    expect(viewFunctions.takePicture).not.toHaveBeenCalled();
  });

  it('has no host node before the view has mounted', () => {
    expect(createCameraView(() => null).handle.getHostNode()).toBeNull();
  });

  it('answers empty lists before the view has mounted', async () => {
    const { handle } = createCameraView(() => null);

    expect(await handle.getAvailablePictureSizesAsync()).toEqual([]);
    expect(await handle.getAvailableLensesAsync()).toEqual([]);
  });
});
