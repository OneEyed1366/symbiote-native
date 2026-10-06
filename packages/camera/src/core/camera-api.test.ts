import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isModernBarcodeScannerAvailable: true,
  isAvailableAsync: vi.fn(async () => true),
  launchScanner: vi.fn(async () => undefined),
  dismissScanner: vi.fn(async () => undefined),
  scanFromURLAsync: vi.fn(async () => []),
  getCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
  getMicrophonePermissionsAsync: vi.fn(async () => ({ granted: false })),
  requestMicrophonePermissionsAsync: vi.fn(async () => ({ granted: true })),
  getAvailableVideoCodecsAsync: vi.fn(async () => ['avc1']),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock('./native-module', () => ({ expoCamera: native }));
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${moduleName}.${propertyName} is not available`);
    }
  },
}));

const api = await import('./camera-api');

beforeEach(() => {
  vi.clearAllMocks();
  native.isModernBarcodeScannerAvailable = true;
});

describe('camera api (Positive)', () => {
  it('asks the native module whether a camera exists', async () => {
    expect(await api.isCameraAvailableAsync()).toBe(true);
  });

  it('lists the video codecs', async () => {
    expect(await api.getAvailableVideoCodecsAsync()).toEqual(['avc1']);
  });

  it('launches the scanner with no barcode types by default', async () => {
    await api.launchScanner();

    expect(native.launchScanner).toHaveBeenCalledWith({ barcodeTypes: [] });
  });

  it('dismisses the scanner', async () => {
    await api.dismissScanner();

    expect(native.dismissScanner).toHaveBeenCalledTimes(1);
  });

  it('listens for scans of the modern scanner and returns the subscription', () => {
    const listener = vi.fn();

    const subscription = api.onModernBarcodeScanned(listener);

    expect(native.addListener).toHaveBeenCalledWith(
      'onModernBarcodeScanned',
      listener,
    );
    expect(typeof subscription.remove).toBe('function');
  });

  it('scans qr codes only unless told otherwise', async () => {
    await api.scanFromURLAsync('file:///code.png');
    await api.scanFromURLAsync('file:///code.png', ['ean13']);

    expect(native.scanFromURLAsync).toHaveBeenNthCalledWith(
      1,
      'file:///code.png',
      ['qr'],
    );
    expect(native.scanFromURLAsync).toHaveBeenNthCalledWith(
      2,
      'file:///code.png',
      ['ean13'],
    );
  });

  it('reads and requests the camera and microphone permissions', async () => {
    await api.Camera.getCameraPermissionsAsync();
    await api.Camera.requestMicrophonePermissionsAsync();

    expect(native.getCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(native.requestMicrophonePermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('binds the permission methods the hooks take to the native calls', async () => {
    await api.cameraPermissionMethods.getMethod();
    await api.microphonePermissionMethods.requestMethod();

    expect(native.getCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(native.requestMicrophonePermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('camera api (Negative)', () => {
  it('does not launch or dismiss a scanner the device lacks', async () => {
    native.isModernBarcodeScannerAvailable = false;

    await api.launchScanner();
    await api.dismissScanner();

    expect(native.launchScanner).not.toHaveBeenCalled();
    expect(native.dismissScanner).not.toHaveBeenCalled();
  });

  it('throws when the native module has no isAvailableAsync', async () => {
    const original = native.isAvailableAsync;
    Reflect.deleteProperty(native, 'isAvailableAsync');

    await expect(api.isCameraAvailableAsync()).rejects.toThrow(
      'expo-camera.isAvailableAsync is not available',
    );
    Reflect.set(native, 'isAvailableAsync', original);
  });

  it('throws when the native module has no video codecs', async () => {
    const original = native.getAvailableVideoCodecsAsync;
    Reflect.deleteProperty(native, 'getAvailableVideoCodecsAsync');

    await expect(api.getAvailableVideoCodecsAsync()).rejects.toThrow(
      'Camera.getAvailableVideoCodecsAsync is not available',
    );
    Reflect.set(native, 'getAvailableVideoCodecsAsync', original);
  });
});
