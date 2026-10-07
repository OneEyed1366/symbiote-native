import type {
  ICameraBarcodeScanningResult,
  ICameraBarcodeType,
  ICameraFlashMode,
  ICameraMode,
  ICameraType,
} from '@symbiote-native/camera/angular';

export const SCAN_TYPES: ICameraBarcodeType[] = [
  'qr',
  'ean13',
  'ean8',
  'code128',
  'upc_a',
];
export const MAX_RECORD_SECONDS = 10;
export const SAMPLE_QR_URL =
  'https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&data=symbiote-camera-demo';
export const ZOOM_STEP = 0.25;
const MAX_SCANS = 5;

const FACINGS: readonly ICameraType[] = ['back', 'front'];
const FLASHES: readonly ICameraFlashMode[] = ['off', 'on', 'auto', 'screen'];
const MODES: readonly ICameraMode[] = ['picture', 'video'];
export const FACING_OPTIONS = FACINGS.map(item => ({
  label: item,
  value: item,
}));
export const FLASH_OPTIONS = FLASHES.map(item => ({
  label: item,
  value: item,
}));
export const MODE_OPTIONS = MODES.map(item => ({ label: item, value: item }));
export const QUALITIES = [0.3, 0.7, 1].map(value => ({
  label: String(value),
  value,
}));

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

export function errorLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The newest code first, a repeat of the last one is not a new scan
export function pushScan(
  previous: readonly ICameraBarcodeScanningResult[],
  result: ICameraBarcodeScanningResult,
): readonly ICameraBarcodeScanningResult[] {
  return previous[0]?.data === result.data
    ? previous
    : [result, ...previous].slice(0, MAX_SCANS);
}

export function scanLine(
  last: ICameraBarcodeScanningResult | undefined,
): string {
  return last === undefined ? 'none yet' : `${last.type}: ${last.data}`;
}
