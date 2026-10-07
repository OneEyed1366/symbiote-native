import type {
  IAccessibilityProps,
  IAriaProps,
  IResponderProps,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IAndroidBarcode } from './android-barcode';

export type ICameraType = 'front' | 'back';

/**
 * `screen` uses the display as the flash of a front camera, on iOS it maps to `on`
 * and Retina Flash fires
 */
export type ICameraFlashMode = 'off' | 'on' | 'auto' | 'screen';

/** `on` focuses once and locks, `off` focuses whenever needed */
export type ICameraFocusMode = 'on' | 'off';

export type ICameraMode = 'picture' | 'video';

export type ICameraRatio = '4:3' | '16:9' | '1:1';

/** The codec of a video recording, iOS only */
export type ICameraVideoCodec = 'avc1' | 'hvc1' | 'jpeg' | 'apcn' | 'ap4h';

/** On Android all but `off` turn the stabilization on, the device picks the method */
export type ICameraVideoStabilization =
  'off' | 'standard' | 'cinematic' | 'auto';

export type ICameraVideoQuality = '2160p' | '1080p' | '720p' | '480p' | '4:3';

export type ICameraOrientation =
  'portrait' | 'portraitUpsideDown' | 'landscapeLeft' | 'landscapeRight';

export type ICameraBarcodeType =
  | 'aztec'
  | 'ean13'
  | 'ean8'
  | 'qr'
  | 'pdf417'
  | 'upc_e'
  | 'datamatrix'
  | 'code39'
  | 'code93'
  | 'itf14'
  | 'codabar'
  | 'code128'
  | 'upc_a';

export type ICameraCapturedPicture = {
  width: number;
  height: number;
  format: 'jpg' | 'png';
  uri: string;
  /** Base64 of the JPEG data, present when the `base64` option was set */
  base64?: string;
  /** The EXIF tags and their values, present when the `exif` option was set */
  exif?: Record<string, unknown>;
};

export type ICameraPictureOptions = {
  /** From `0` (small) to `1` (best), `1` by default */
  quality?: number;
  base64?: boolean;
  exif?: boolean;
  /** Extra EXIF data, takes effect with `exif` */
  additionalExif?: Record<string, unknown>;
  /**
   * Called when the picture is saved, the promise then resolves at once with no data
   * and the picture goes to this callback
   */
  onPictureSaved?: (picture: ICameraCapturedPicture) => void;
  /** Returns the image as it came from the sensor, `quality` is discarded */
  skipProcessing?: boolean;
  /** @deprecated Use the `mirror` prop of the view */
  mirror?: boolean;
  id?: number;
  fastMode?: boolean;
  maxDownsampling?: number;
  /** `true` by default */
  shutterSound?: boolean;
  /** Resolves to a reference to the native image instead of a file */
  pictureRef?: boolean;
};

export type ICameraRecordingOptions = {
  /** In seconds */
  maxDuration?: number;
  /** In bytes */
  maxFileSize?: number;
  /** @deprecated Use the `mirror` prop of the view */
  mirror?: boolean;
  /** iOS only */
  codec?: ICameraVideoCodec;
};

export type ICameraAvailableLenses = { lenses: string[] };

export type ICameraResponsiveOrientation = { orientation: ICameraOrientation };

export type ICameraMountError = { message: string };

export type ICameraBarcodePoint = { x: number; y: number };

export type ICameraBarcodeBounds = {
  origin: ICameraBarcodePoint;
  size: { height: number; width: number };
};

export type ICameraBarcodeScanningResult = {
  type: string;
  /** The parsed information encoded in the barcode */
  data: string;
  /** The raw information, Android only */
  raw?: string;
  /** The order of the points differs per platform, and is empty for some types */
  cornerPoints: ICameraBarcodePoint[];
  bounds: ICameraBarcodeBounds;
  /** Extra information of the type of barcode, Android only */
  extra?: IAndroidBarcode;
};

export type ICameraScanningResult = Omit<
  ICameraBarcodeScanningResult,
  'bounds' | 'cornerPoints'
>;

export type ICameraBarcodeSettings = { barcodeTypes: ICameraBarcodeType[] };

/** The options of the system scanner, iOS 16+ and Google's code scanner on Android */
export type ICameraScanningOptions = {
  barcodeTypes: ICameraBarcodeType[];
  /** iOS only, `true` by default */
  isPinchToZoomEnabled?: boolean;
  /** iOS only, `true` by default */
  isGuidanceEnabled?: boolean;
  /** iOS only, `false` by default */
  isHighlightingEnabled?: boolean;
};

export type ICameraPhotoResult = {
  uri: string;
  width: number;
  height: number;
  base64?: string;
};

export type ICameraSavePictureOptions = {
  quality?: number;
  metadata?: Record<string, unknown>;
  base64?: boolean;
};

export type ICameraViewProps = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    /** `back` by default */
    facing?: ICameraType;
    /** `off` by default */
    flash?: ICameraFlashMode;
    /** From `0` to `1`, a share of the maximum zoom of the device */
    zoom?: number;
    /** `picture` by default */
    mode?: ICameraMode;
    /** Records video with no sound */
    mute?: boolean;
    /** Mirrors the image of the front camera */
    mirror?: boolean;
    /** iOS only, `off` by default */
    autofocus?: ICameraFocusMode;
    /** Stops the session while `false`, iOS only, `true` by default */
    active?: boolean;
    videoQuality?: ICameraVideoQuality;
    /** In bits per second, on iOS needs the codec in `recordAsync` */
    videoBitrate?: number;
    animateShutter?: boolean;
    /** Makes `ratio` ignored, the sizes come from `getAvailablePictureSizesAsync` */
    pictureSize?: string;
    /** iOS only, `builtInWideAngleCamera` by default */
    selectedLens?: string;
    enableTorch?: boolean;
    /** `auto` by default */
    videoStabilizationMode?: ICameraVideoStabilization;
    barcodeScannerSettings?: ICameraBarcodeSettings;
    /** Takes landscape pictures of a portrait-locked app when the device turns, iOS only */
    responsiveOrientationWhenOrientationLocked?: boolean;
    /** Android only, switches the preview from fill to fit */
    ratio?: ICameraRatio;
    onCameraReady?: () => void;
    onMountError?: (event: ICameraMountError) => void;
    onBarcodeScanned?: (result: ICameraBarcodeScanningResult) => void;
    /** iOS only */
    onResponsiveOrientationChanged?: (
      event: ICameraResponsiveOrientation,
    ) => void;
    /** iOS only */
    onAvailableLensesChanged?: (event: ICameraAvailableLenses) => void;
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

export type ICameraSupportedFeatures = {
  isModernBarcodeScannerAvailable: boolean;
  toggleRecordingAsyncAvailable: boolean;
};
