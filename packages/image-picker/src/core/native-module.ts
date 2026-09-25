import { requireNativeModule } from 'expo-modules-core';
import type {
  ICameraPermissionResponse,
  IImagePickerErrorResult,
  IImagePickerOptions,
  IImagePickerResult,
  IMediaLibraryPermissionResponse,
} from './types';

const EXPO_IMAGE_PICKER_MODULE_NAME = 'ExponentImagePicker';

export type INativeImagePickerModule = {
  getCameraPermissionsAsync(): Promise<ICameraPermissionResponse>;
  getMediaLibraryPermissionsAsync(
    writeOnly: boolean,
  ): Promise<IMediaLibraryPermissionResponse>;
  requestCameraPermissionsAsync(): Promise<ICameraPermissionResponse>;
  requestMediaLibraryPermissionsAsync(
    writeOnly: boolean,
  ): Promise<IMediaLibraryPermissionResponse>;
  /** Android only — absent on iOS's native module. */
  getPendingResultAsync?(): Promise<
    IImagePickerResult | IImagePickerErrorResult
  >;
  /** Absent on web's native module. */
  launchCameraAsync?(options: IImagePickerOptions): Promise<IImagePickerResult>;
  launchImageLibraryAsync(
    options: IImagePickerOptions,
  ): Promise<IImagePickerResult>;
};

export const expoImagePicker = requireNativeModule<INativeImagePickerModule>(
  EXPO_IMAGE_PICKER_MODULE_NAME,
);
