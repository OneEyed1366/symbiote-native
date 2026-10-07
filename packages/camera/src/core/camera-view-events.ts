import type { ISymbioteEvent } from '@symbiote-native/engine';
import { BARCODE_EVENT_THROTTLE_MS } from './constants';
import { handlePictureSaved } from './picture-options';
import type {
  ICameraAvailableLenses,
  ICameraBarcodeScanningResult,
  ICameraCapturedPicture,
  ICameraMountError,
  ICameraResponsiveOrientation,
} from './types';

type IGuard<TPayload> = (value: unknown) => value is TPayload;

function hasField(value: unknown, key: string, kind: string): boolean {
  return typeof Reflect.get(Object(value), key) === kind;
}

const isMountError: IGuard<ICameraMountError> = (
  value,
): value is ICameraMountError => hasField(value, 'message', 'string');

const isOrientation: IGuard<ICameraResponsiveOrientation> = (
  value,
): value is ICameraResponsiveOrientation =>
  hasField(value, 'orientation', 'string');

const isLenses: IGuard<ICameraAvailableLenses> = (
  value,
): value is ICameraAvailableLenses =>
  Array.isArray(Reflect.get(Object(value), 'lenses'));

const isScanningResult: IGuard<ICameraBarcodeScanningResult> = (
  value,
): value is ICameraBarcodeScanningResult =>
  hasField(value, 'type', 'string') && hasField(value, 'data', 'string');

function isPictureSaved(
  value: unknown,
): value is { data: ICameraCapturedPicture; id: number } {
  return hasField(value, 'id', 'number') && hasField(value, 'data', 'object');
}

// Hands the callback the payload inside the native event, and only when it has the expected shape
function forward<TPayload>(
  props: object,
  name: string,
  isPayload: IGuard<TPayload>,
) {
  return (event: ISymbioteEvent): void => {
    const callback: unknown = Reflect.get(props, name);
    if (typeof callback === 'function' && isPayload(event.nativeEvent)) {
      callback(event.nativeEvent);
    }
  };
}

export type ICameraViewEvents = (props: object) => Record<string, unknown>;

/** One per view, the throttle of the barcode events belongs to the view */
export function createCameraViewEvents(): ICameraViewEvents {
  const lastScans = new Map<string, { json: string; at: number }>();

  // Equal events of one type inside the window are the same scan seen again
  const throttledScan =
    (callback: (result: ICameraBarcodeScanningResult) => void) =>
    (event: ISymbioteEvent): void => {
      const result = event.nativeEvent;
      if (!isScanningResult(result)) return;
      const json = JSON.stringify(result);
      const now = Date.now();
      const last = lastScans.get(result.type);
      if (last?.json === json && now - last.at < BARCODE_EVENT_THROTTLE_MS) {
        return;
      }
      callback(result);
      lastScans.set(result.type, { json, at: now });
    };

  return props => {
    const onBarcodeScanned: unknown = Reflect.get(props, 'onBarcodeScanned');
    const onCameraReady: unknown = Reflect.get(props, 'onCameraReady');
    return {
      onCameraReady: () => {
        if (typeof onCameraReady === 'function') onCameraReady();
      },
      onMountError: forward(props, 'onMountError', isMountError),
      onBarcodeScanned:
        typeof onBarcodeScanned === 'function'
          ? throttledScan(result => onBarcodeScanned(result))
          : undefined,
      onAvailableLensesChanged: forward(
        props,
        'onAvailableLensesChanged',
        isLenses,
      ),
      onResponsiveOrientationChanged: forward(
        props,
        'onResponsiveOrientationChanged',
        isOrientation,
      ),
      onPictureSaved: (event: ISymbioteEvent): void => {
        if (isPictureSaved(event.nativeEvent)) {
          handlePictureSaved({ nativeEvent: event.nativeEvent });
        }
      },
    };
  };
}
