import { UnavailabilityError } from 'expo-modules-core';
import type { EventSubscription, PermissionResponse } from 'expo-modules-core';
import { CAMERA_PACKAGE_NAME, MODERN_SCANNER_EVENT } from './constants';
import { expoCamera } from './native-module';
import type {
  ICameraBarcodeScanningResult,
  ICameraBarcodeType,
  ICameraScanningOptions,
  ICameraScanningResult,
  ICameraVideoCodec,
} from './types';

/** Whether the device has a camera, the permissions are a separate question */
export async function isCameraAvailableAsync(): Promise<boolean> {
  if (!expoCamera.isAvailableAsync) {
    throw new UnavailabilityError(CAMERA_PACKAGE_NAME, 'isAvailableAsync');
  }
  return expoCamera.isAvailableAsync();
}

/** iOS only */
export async function getAvailableVideoCodecsAsync(): Promise<
  ICameraVideoCodec[]
> {
  if (!expoCamera.getAvailableVideoCodecsAsync) {
    throw new UnavailabilityError('Camera', 'getAvailableVideoCodecsAsync');
  }
  return expoCamera.getAvailableVideoCodecsAsync();
}

/** Whether the device has `DataScannerViewController` (iOS 16+) or Google's code scanner */
export function isModernBarcodeScannerAvailable(): boolean {
  return expoCamera.isModernBarcodeScannerAvailable;
}

/** A device without the modern scanner does nothing here */
export async function launchScanner(
  options: ICameraScanningOptions = { barcodeTypes: [] },
): Promise<void> {
  if (expoCamera.isModernBarcodeScannerAvailable) {
    await expoCamera.launchScanner(options);
  }
}

/** Dismisses the scanner on iOS, on Android it closes itself after a scan */
export async function dismissScanner(): Promise<void> {
  if (expoCamera.isModernBarcodeScannerAvailable) {
    await expoCamera.dismissScanner();
  }
}

export function onModernBarcodeScanned(
  listener: (event: ICameraScanningResult) => void,
): EventSubscription {
  return expoCamera.addListener(MODERN_SCANNER_EVENT, listener);
}

/** Only QR codes are scanned on iOS */
export async function scanFromURLAsync(
  url: string,
  barcodeTypes: ICameraBarcodeType[] = ['qr'],
): Promise<ICameraBarcodeScanningResult[]> {
  return expoCamera.scanFromURLAsync(url, barcodeTypes);
}

async function getCameraPermissionsAsync(): Promise<PermissionResponse> {
  return expoCamera.getCameraPermissionsAsync();
}

async function requestCameraPermissionsAsync(): Promise<PermissionResponse> {
  return expoCamera.requestCameraPermissionsAsync();
}

async function getMicrophonePermissionsAsync(): Promise<PermissionResponse> {
  return expoCamera.getMicrophonePermissionsAsync();
}

async function requestMicrophonePermissionsAsync(): Promise<PermissionResponse> {
  return expoCamera.requestMicrophonePermissionsAsync();
}

export const Camera = {
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
  getMicrophonePermissionsAsync,
  requestMicrophonePermissionsAsync,
  scanFromURLAsync,
};

// What every adapter's `createPermissionHook` binds, `useCameraPermissions` and its twin
export const cameraPermissionMethods = {
  getMethod: getCameraPermissionsAsync,
  requestMethod: requestCameraPermissionsAsync,
};

export const microphonePermissionMethods = {
  getMethod: getMicrophonePermissionsAsync,
  requestMethod: requestMicrophonePermissionsAsync,
};
