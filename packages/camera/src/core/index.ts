export {
  Camera,
  cameraPermissionMethods,
  dismissScanner,
  getAvailableVideoCodecsAsync,
  isCameraAvailableAsync,
  isModernBarcodeScannerAvailable,
  launchScanner,
  microphonePermissionMethods,
  onModernBarcodeScanned,
  scanFromURLAsync,
} from './camera-api';
export {
  cameraViewName,
  createCameraView,
  ensureCameraViewRegistered,
  type ICameraView,
} from './camera-view';
export type { ICameraViewHandle } from './camera-view-handle';
export { CAMERA_MODULE_NAME } from './constants';
export type { ICameraPictureRef } from './native-module';
export { PictureRef } from './picture-ref';
export type { IAndroidBarcode } from './android-barcode';
export type {
  ICameraAvailableLenses,
  ICameraBarcodeBounds,
  ICameraBarcodePoint,
  ICameraBarcodeScanningResult,
  ICameraBarcodeSettings,
  ICameraBarcodeType,
  ICameraCapturedPicture,
  ICameraFlashMode,
  ICameraFocusMode,
  ICameraMode,
  ICameraMountError,
  ICameraOrientation,
  ICameraPhotoResult,
  ICameraPictureOptions,
  ICameraRatio,
  ICameraRecordingOptions,
  ICameraResponsiveOrientation,
  ICameraSavePictureOptions,
  ICameraScanningOptions,
  ICameraScanningResult,
  ICameraSupportedFeatures,
  ICameraType,
  ICameraVideoCodec,
  ICameraVideoQuality,
  ICameraVideoStabilization,
  ICameraViewProps,
} from './types';
export {
  PermissionStatus,
  type EventSubscription,
  type PermissionExpiration,
  type PermissionResponse,
} from 'expo-modules-core';
