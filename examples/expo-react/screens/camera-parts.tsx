import type { RefObject } from 'react';
import type {
  ICameraBarcodeScanningResult,
  ICameraBarcodeType,
  ICameraFlashMode,
  ICameraMode,
  ICameraType,
  ICameraViewHandle,
} from '@symbiote-native/camera/react';

export const SCAN_TYPES: ICameraBarcodeType[] = ['qr', 'ean13', 'ean8', 'code128', 'upc_a'];
export const MAX_RECORD_SECONDS = 10;
export const SAMPLE_QR_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&data=symbiote-camera-demo';

export type ICameraSettings = {
  facing: ICameraType;
  flash: ICameraFlashMode;
  mode: ICameraMode;
  zoom: number;
  isTorchOn: boolean;
  isMuted: boolean;
  isActive: boolean;
  isReady: boolean;
};

export const INITIAL_SETTINGS: ICameraSettings = {
  facing: 'back',
  flash: 'off',
  mode: 'picture',
  zoom: 0,
  isTorchOn: false,
  isMuted: false,
  isActive: true,
  isReady: false,
};

export type ICameraDeck = {
  camera: RefObject<ICameraViewHandle | null>;
  settings: ICameraSettings;
  scans: readonly ICameraBarcodeScanningResult[];
};

export function errorLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
