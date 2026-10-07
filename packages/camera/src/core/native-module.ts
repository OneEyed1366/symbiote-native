import { requireNativeModule } from 'expo-modules-core';
import type {
  EventSubscription,
  PermissionResponse,
  SharedRef,
} from 'expo-modules-core';
import { CAMERA_MODULE_NAME } from './constants';
import type {
  ICameraBarcodeScanningResult,
  ICameraBarcodeType,
  ICameraPhotoResult,
  ICameraSavePictureOptions,
  ICameraScanningOptions,
  ICameraScanningResult,
  ICameraVideoCodec,
} from './types';

/** A reference to a native instance of an image, other Expo packages accept it as is */
export type ICameraPictureRef = SharedRef<'image'> & {
  width: number;
  height: number;
  /** Saves the image into the cache directory */
  savePictureAsync(
    options?: ICameraSavePictureOptions,
  ): Promise<ICameraPhotoResult>;
};

export type ICameraPictureRefClass = abstract new (
  ...args: never[]
) => ICameraPictureRef;

// `Type` and `FlashMode` map the friendly prop values to what the native view takes
export type ICameraNativeModule = {
  Picture: ICameraPictureRefClass;
  readonly isModernBarcodeScannerAvailable: boolean;
  readonly toggleRecordingAsyncAvailable: boolean;
  readonly Type: Record<string, string>;
  readonly FlashMode: Record<string, string>;
  isAvailableAsync?(): Promise<boolean>;
  launchScanner(options?: ICameraScanningOptions): Promise<void>;
  dismissScanner(): Promise<void>;
  scanFromURLAsync(
    url: string,
    barcodeTypes?: ICameraBarcodeType[],
  ): Promise<ICameraBarcodeScanningResult[]>;
  getCameraPermissionsAsync(): Promise<PermissionResponse>;
  requestCameraPermissionsAsync(): Promise<PermissionResponse>;
  getMicrophonePermissionsAsync(): Promise<PermissionResponse>;
  requestMicrophonePermissionsAsync(): Promise<PermissionResponse>;
  getAvailableVideoCodecsAsync?(): Promise<ICameraVideoCodec[]>;
  addListener(
    eventName: string,
    listener: (event: ICameraScanningResult) => void,
  ): EventSubscription;
};

export const expoCamera =
  requireNativeModule<ICameraNativeModule>(CAMERA_MODULE_NAME);
