import {
  CameraType,
  UIImagePickerControllerQualityType,
  UIImagePickerPresentationStyle,
  UIImagePickerPreferredAssetRepresentationMode,
  VideoExportPreset,
} from '@symbiote-native/image-picker/svelte';
import type {
  IDefaultTab,
  IImagePickerOptions,
  IMediaType,
} from '@symbiote-native/image-picker/svelte';

export const ASSET_TYPE_VIDEO = 'video';

export type IForm = {
  allowsEditing: boolean;
  aspect: string;
  shape: 'rectangle' | 'oval';
  quality: string;
  mediaTypes: string;
  exif: boolean;
  base64: boolean;
  allowsMultipleSelection: boolean;
  selectionLimit: string;
  orderedSelection: boolean;
  defaultTab: IDefaultTab;
  videoExportPreset: VideoExportPreset;
  videoQuality: UIImagePickerControllerQualityType;
  videoMaxDuration: string;
  presentationStyle: UIImagePickerPresentationStyle;
  preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode;
  cameraType: CameraType;
  shouldDownloadFromNetwork: boolean;
};
export type ISetForm = (patch: Partial<IForm>) => void;

export const INITIAL_FORM: IForm = {
  allowsEditing: false,
  aspect: '',
  shape: 'rectangle',
  quality: '1',
  mediaTypes: 'images',
  exif: false,
  base64: false,
  allowsMultipleSelection: false,
  selectionLimit: '1',
  orderedSelection: false,
  defaultTab: 'photos',
  videoExportPreset: VideoExportPreset.Passthrough,
  videoQuality: UIImagePickerControllerQualityType.High,
  videoMaxDuration: '',
  presentationStyle: UIImagePickerPresentationStyle.AUTOMATIC,
  preferredAssetRepresentationMode:
    UIImagePickerPreferredAssetRepresentationMode.Automatic,
  cameraType: CameraType.back,
  shouldDownloadFromNetwork: true,
};

const MEDIA_TYPES: Record<string, IMediaType[]> = {
  images: ['images'],
  videos: ['videos'],
  'images+videos': ['images', 'videos'],
  livePhotos: ['livePhotos'],
  all: ['images', 'videos', 'livePhotos'],
};

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function parseAspect(text: string): [number, number] | undefined {
  const [x, y] = text.split(':').map(Number);
  return x > 0 && y > 0 ? [x, y] : undefined;
}

export function toPickerOptions(form: IForm): IImagePickerOptions {
  return {
    allowsEditing: form.allowsEditing,
    aspect: parseAspect(form.aspect),
    shape: form.shape,
    quality: optionalNumber(form.quality),
    mediaTypes: MEDIA_TYPES[form.mediaTypes],
    exif: form.exif,
    base64: form.base64,
    allowsMultipleSelection: form.allowsMultipleSelection,
    selectionLimit: optionalNumber(form.selectionLimit),
    orderedSelection: form.orderedSelection,
    defaultTab: form.defaultTab,
    videoExportPreset: form.videoExportPreset,
    videoQuality: form.videoQuality,
    videoMaxDuration: optionalNumber(form.videoMaxDuration),
    presentationStyle: form.presentationStyle,
    preferredAssetRepresentationMode: form.preferredAssetRepresentationMode,
    cameraType: form.cameraType,
    shouldDownloadFromNetwork: form.shouldDownloadFromNetwork,
  };
}

function enumOptions<T extends string | number>(
  entries: readonly (readonly [string, T])[],
) {
  return entries.map(([label, value]) => ({ label, value }));
}

export const VIDEO_PRESETS = enumOptions([
  ['Passthrough', VideoExportPreset.Passthrough],
  ['LowQuality', VideoExportPreset.LowQuality],
  ['MediumQuality', VideoExportPreset.MediumQuality],
  ['HighestQuality', VideoExportPreset.HighestQuality],
  ['H264_640x480', VideoExportPreset.H264_640x480],
  ['H264_960x540', VideoExportPreset.H264_960x540],
  ['H264_1280x720', VideoExportPreset.H264_1280x720],
  ['H264_1920x1080', VideoExportPreset.H264_1920x1080],
  ['H264_3840x2160', VideoExportPreset.H264_3840x2160],
  ['HEVC_1920x1080', VideoExportPreset.HEVC_1920x1080],
  ['HEVC_3840x2160', VideoExportPreset.HEVC_3840x2160],
]);

export const VIDEO_QUALITIES = enumOptions([
  ['High', UIImagePickerControllerQualityType.High],
  ['Medium', UIImagePickerControllerQualityType.Medium],
  ['Low', UIImagePickerControllerQualityType.Low],
  ['VGA640x480', UIImagePickerControllerQualityType.VGA640x480],
  ['IFrame1280x720', UIImagePickerControllerQualityType.IFrame1280x720],
  ['IFrame960x540', UIImagePickerControllerQualityType.IFrame960x540],
]);

export const PRESENTATION_STYLES = enumOptions([
  ['fullScreen', UIImagePickerPresentationStyle.FULL_SCREEN],
  ['pageSheet', UIImagePickerPresentationStyle.PAGE_SHEET],
  ['formSheet', UIImagePickerPresentationStyle.FORM_SHEET],
  ['currentContext', UIImagePickerPresentationStyle.CURRENT_CONTEXT],
  ['overFullScreen', UIImagePickerPresentationStyle.OVER_FULL_SCREEN],
  ['overCurrentContext', UIImagePickerPresentationStyle.OVER_CURRENT_CONTEXT],
  ['popover', UIImagePickerPresentationStyle.POPOVER],
  ['automatic', UIImagePickerPresentationStyle.AUTOMATIC],
]);

export const REPRESENTATION_MODES = enumOptions([
  ['automatic', UIImagePickerPreferredAssetRepresentationMode.Automatic],
  ['compatible', UIImagePickerPreferredAssetRepresentationMode.Compatible],
  ['current', UIImagePickerPreferredAssetRepresentationMode.Current],
]);

export const MEDIA_TYPE_CHOICES = enumOptions(
  Object.keys(MEDIA_TYPES).map(key => [key, key] as const),
);
export const SHAPE_CHOICES = enumOptions([
  ['rectangle', 'rectangle'],
  ['oval', 'oval'],
] as const);
export const TAB_CHOICES = enumOptions([
  ['photos', 'photos'],
  ['albums', 'albums'],
] as const);
export const CAMERA_CHOICES = enumOptions([
  ['back', CameraType.back],
  ['front', CameraType.front],
] as const);
