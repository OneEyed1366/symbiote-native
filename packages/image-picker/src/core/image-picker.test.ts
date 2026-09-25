import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_IMAGE_PICKER = {
  getCameraPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getMediaLibraryPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestCameraPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({
    status: 'granted',
  })),
  getPendingResultAsync: vi.fn(async () => ({ canceled: true, assets: null })),
  launchCameraAsync: vi.fn(async () => ({ canceled: false, assets: [] })),
  launchImageLibraryAsync: vi.fn(async () => ({ canceled: false, assets: [] })),
};

// requireNativeModule() only resolves on-device — faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/mail-composer/src/core/mail-composer.test.ts.
vi.mock('./native-module', () => ({
  expoImagePicker: FAKE_NATIVE_IMAGE_PICKER,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/application/src/core/application.test.ts uses.
vi.mock('expo-modules-core', () => ({
  CodedError: class CodedError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  getCameraPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  getPendingResultAsync,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} = await import('./image-picker');

afterEach(() => {
  vi.clearAllMocks();
});

// Ported from expo-image-picker's src/__tests__/ImagePicker-test.native.ts.
describe('launchCameraAsync', () => {
  it('defaults options to an empty object', async () => {
    await launchCameraAsync();
    expect(FAKE_NATIVE_IMAGE_PICKER.launchCameraAsync).toHaveBeenCalledWith({});
  });

  it('rejects a non-positive aspect ratio', async () => {
    await expect(launchCameraAsync({ aspect: [0, 1] })).rejects.toThrow(
      'Invalid aspect ratio values',
    );
  });

  it('rejects an out-of-range quality', async () => {
    await expect(launchCameraAsync({ quality: 1.5 })).rejects.toThrow(
      "Invalid 'quality' value",
    );
  });

  it('rejects a negative videoMaxDuration', async () => {
    await expect(launchCameraAsync({ videoMaxDuration: -1 })).rejects.toThrow(
      "Invalid 'videoMaxDuration' value",
    );
  });

  it('throws UnavailabilityError when the native module has no launchCameraAsync', async () => {
    FAKE_NATIVE_IMAGE_PICKER.launchCameraAsync = undefined as never;
    await expect(launchCameraAsync()).rejects.toThrow(/launchCameraAsync/);
    FAKE_NATIVE_IMAGE_PICKER.launchCameraAsync = vi.fn(async () => ({
      canceled: false,
      assets: [],
    }));
  });
});

describe('launchImageLibraryAsync', () => {
  it('defaults options to an empty object', async () => {
    await launchImageLibraryAsync();
    expect(
      FAKE_NATIVE_IMAGE_PICKER.launchImageLibraryAsync,
    ).toHaveBeenCalledWith({});
  });

  it('warns and still calls through when editing + multi-select are both set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await launchImageLibraryAsync({
      allowsEditing: true,
      allowsMultipleSelection: true,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('allowsEditing'));
    expect(
      FAKE_NATIVE_IMAGE_PICKER.launchImageLibraryAsync,
    ).toHaveBeenCalledWith({
      allowsEditing: true,
      allowsMultipleSelection: true,
    });
  });
});

describe('permissions', () => {
  it('delegates get/request for camera and media library', async () => {
    await getCameraPermissionsAsync();
    await requestCameraPermissionsAsync();
    await getMediaLibraryPermissionsAsync(true);
    await requestMediaLibraryPermissionsAsync(true);
    expect(
      FAKE_NATIVE_IMAGE_PICKER.getCameraPermissionsAsync,
    ).toHaveBeenCalledTimes(1);
    expect(
      FAKE_NATIVE_IMAGE_PICKER.requestCameraPermissionsAsync,
    ).toHaveBeenCalledTimes(1);
    expect(
      FAKE_NATIVE_IMAGE_PICKER.getMediaLibraryPermissionsAsync,
    ).toHaveBeenCalledWith(true);
    expect(
      FAKE_NATIVE_IMAGE_PICKER.requestMediaLibraryPermissionsAsync,
    ).toHaveBeenCalledWith(true);
  });

  it('defaults writeOnly to false', async () => {
    await getMediaLibraryPermissionsAsync();
    expect(
      FAKE_NATIVE_IMAGE_PICKER.getMediaLibraryPermissionsAsync,
    ).toHaveBeenCalledWith(false);
  });
});

describe('getPendingResultAsync', () => {
  it('delegates to the native module when present (Android)', async () => {
    await expect(getPendingResultAsync()).resolves.toEqual({
      canceled: true,
      assets: null,
    });
  });

  it('resolves null when the native module has no getPendingResultAsync (iOS)', async () => {
    FAKE_NATIVE_IMAGE_PICKER.getPendingResultAsync = undefined as never;
    await expect(getPendingResultAsync()).resolves.toBeNull();
    FAKE_NATIVE_IMAGE_PICKER.getPendingResultAsync = vi.fn(async () => ({
      canceled: true,
      assets: null,
    }));
  });
});
