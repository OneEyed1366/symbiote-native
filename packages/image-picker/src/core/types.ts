import type { PermissionResponse } from 'expo-modules-core';

export type ICameraPermissionResponse = PermissionResponse;

export type IMediaLibraryPermissionResponse = PermissionResponse & {
  /** `'all'` | `'limited'` (Android 13+/iOS 14+) | `'none'`. */
  accessPrivileges?: 'all' | 'limited' | 'none';
};

/** @deprecated use an array of `IMediaType` instead. */
export enum MediaTypeOptions {
  All = 'All',
  Videos = 'Videos',
  Images = 'Images',
}

export type IMediaType = 'images' | 'videos' | 'livePhotos';

/** Android only. */
export type IDefaultTab = 'photos' | 'albums';

export enum VideoExportPreset {
  Passthrough = 0,
  LowQuality = 1,
  MediumQuality = 2,
  HighestQuality = 3,
  H264_640x480 = 4,
  H264_960x540 = 5,
  H264_1280x720 = 6,
  H264_1920x1080 = 7,
  H264_3840x2160 = 8,
  HEVC_1920x1080 = 9,
  HEVC_3840x2160 = 10,
}

export enum UIImagePickerControllerQualityType {
  High = 0,
  Medium = 1,
  Low = 2,
  VGA640x480 = 3,
  IFrame1280x720 = 4,
  IFrame960x540 = 5,
}

/** iOS only — maps to `UIModalPresentationStyle`. */
export enum UIImagePickerPresentationStyle {
  FULL_SCREEN = 'fullScreen',
  PAGE_SHEET = 'pageSheet',
  FORM_SHEET = 'formSheet',
  CURRENT_CONTEXT = 'currentContext',
  OVER_FULL_SCREEN = 'overFullScreen',
  OVER_CURRENT_CONTEXT = 'overCurrentContext',
  POPOVER = 'popover',
  AUTOMATIC = 'automatic',
}

/** iOS only — maps to `PHPickerConfigurationAssetRepresentationMode`. */
export enum UIImagePickerPreferredAssetRepresentationMode {
  Automatic = 'automatic',
  Compatible = 'compatible',
  Current = 'current',
}

export enum CameraType {
  back = 'back',
  front = 'front',
}

export type IImagePickerAsset = {
  uri: string;
  /** Usable with `@symbiote-native/media-library`. Null if unavailable or access is limited. */
  assetId?: string | null;
  width: number;
  height: number;
  type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo' | null;
  fileName?: string | null;
  fileSize?: number;
  exif?: Record<string, unknown> | null;
  /** Base64 JPEG data — set only when the `base64` option is truthy. */
  base64?: string | null;
  duration?: number | null;
  mimeType?: string;
  /** Set only when `livePhotos` was requested and a live photo was picked. iOS only. */
  pairedVideoAsset?: IImagePickerAsset | null;
};

export type IImagePickerErrorResult = {
  code: string;
  message: string;
  exception?: string;
};

export type IImagePickerSuccessResult = {
  canceled: false;
  assets: IImagePickerAsset[];
};

export type IImagePickerCanceledResult = {
  canceled: true;
  assets: null;
};

export type IImagePickerResult =
  IImagePickerSuccessResult | IImagePickerCanceledResult;

export type ICropShape = 'rectangle' | 'oval';

export type IImagePickerOptions = {
  /** Crop/rotate after picking. Exclusive with `allowsMultipleSelection`. Default `false`. */
  allowsEditing?: boolean;
  /** `[x, y]` crop aspect ratio. Android only. */
  aspect?: [number, number];
  /** Android only. Default `'rectangle'`. */
  shape?: ICropShape;
  /** `0`–`1`. Default `1.0`. */
  quality?: number;
  /** Default `'images'`. */
  mediaTypes?: IMediaType | IMediaType[] | MediaTypeOptions;
  exif?: boolean;
  base64?: boolean;
  /** @deprecated iOS 11+ only. */
  videoExportPreset?: VideoExportPreset;
  /** iOS only. Default `High`. */
  videoQuality?: UIImagePickerControllerQualityType;
  /** Ignored when `allowsEditing` is set. Default `false`. */
  allowsMultipleSelection?: boolean;
  /** `0` = system maximum. Android + iOS 14+. Default `0`. */
  selectionLimit?: number;
  /** iOS 15+ only. Default `false`. */
  orderedSelection?: boolean;
  /** Android only. Default `'photos'`. */
  defaultTab?: IDefaultTab;
  /** Seconds. `0` = no limit (default). No effect on web. */
  videoMaxDuration?: number;
  /** iOS only. Default `AUTOMATIC`. */
  presentationStyle?: UIImagePickerPresentationStyle;
  /** Default `back`. */
  cameraType?: CameraType;
  /** iOS 14+ only. Default `Automatic`. */
  preferredAssetRepresentationMode?: UIImagePickerPreferredAssetRepresentationMode;
  /** Android only — allows picking from outside the photo library. Default `false`. */
  legacy?: boolean;
  /** iOS only — download from iCloud if not stored locally. Default `false`. */
  shouldDownloadFromNetwork?: boolean;
};
