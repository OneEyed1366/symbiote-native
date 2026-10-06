// Apart from `native-module`, which resolves the module on import: the view needs the name too

export const CAMERA_MODULE_NAME = 'ExpoCamera';

/** The label upstream puts into its `UnavailabilityError` */
export const CAMERA_PACKAGE_NAME = 'expo-camera';

/** Equal barcode events of one type inside this window are dropped */
export const BARCODE_EVENT_THROTTLE_MS = 500;

export const MODERN_SCANNER_EVENT = 'onModernBarcodeScanned';
