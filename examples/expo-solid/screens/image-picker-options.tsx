import {
  CameraType,
  UIImagePickerControllerQualityType,
  UIImagePickerPresentationStyle,
  UIImagePickerPreferredAssetRepresentationMode,
  VideoExportPreset,
} from '@symbiote-native/image-picker/solid';
import type {
  IDefaultTab,
  IImagePickerOptions,
  IMediaType,
} from '@symbiote-native/image-picker/solid';
import {
  Card,
  ChoiceRow,
  Field,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.ImagePicker);

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

const VIDEO_PRESETS = enumOptions([
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

const VIDEO_QUALITIES = enumOptions([
  ['High', UIImagePickerControllerQualityType.High],
  ['Medium', UIImagePickerControllerQualityType.Medium],
  ['Low', UIImagePickerControllerQualityType.Low],
  ['VGA640x480', UIImagePickerControllerQualityType.VGA640x480],
  ['IFrame1280x720', UIImagePickerControllerQualityType.IFrame1280x720],
  ['IFrame960x540', UIImagePickerControllerQualityType.IFrame960x540],
]);

const PRESENTATION_STYLES = enumOptions([
  ['fullScreen', UIImagePickerPresentationStyle.FULL_SCREEN],
  ['pageSheet', UIImagePickerPresentationStyle.PAGE_SHEET],
  ['formSheet', UIImagePickerPresentationStyle.FORM_SHEET],
  ['currentContext', UIImagePickerPresentationStyle.CURRENT_CONTEXT],
  ['overFullScreen', UIImagePickerPresentationStyle.OVER_FULL_SCREEN],
  ['overCurrentContext', UIImagePickerPresentationStyle.OVER_CURRENT_CONTEXT],
  ['popover', UIImagePickerPresentationStyle.POPOVER],
  ['automatic', UIImagePickerPresentationStyle.AUTOMATIC],
]);

const REPRESENTATION_MODES = enumOptions([
  ['automatic', UIImagePickerPreferredAssetRepresentationMode.Automatic],
  ['compatible', UIImagePickerPreferredAssetRepresentationMode.Compatible],
  ['current', UIImagePickerPreferredAssetRepresentationMode.Current],
]);

const MEDIA_TYPE_CHOICES = enumOptions(
  Object.keys(MEDIA_TYPES).map(key => [key, key] as const),
);
const SHAPE_CHOICES = enumOptions([
  ['rectangle', 'rectangle'],
  ['oval', 'oval'],
] as const);
const TAB_CHOICES = enumOptions([
  ['photos', 'photos'],
  ['albums', 'albums'],
] as const);
const CAMERA_CHOICES = enumOptions([
  ['back', CameraType.back],
  ['front', CameraType.front],
] as const);

type ICardProps = { form: IForm; setForm: ISetForm };

export function CommonOptionsCard(props: ICardProps) {
  return (
    <Card testID="image-picker-common-card" title="Common options">
      <ChoiceRow
        testID="image-picker-media-types"
        label="mediaTypes"
        options={MEDIA_TYPE_CHOICES}
        value={props.form.mediaTypes}
        onChange={mediaTypes => props.setForm({ mediaTypes })}
        color={color}
      />
      <ToggleRow
        testID="image-picker-editing-switch"
        label="allowsEditing"
        value={props.form.allowsEditing}
        onChange={allowsEditing => props.setForm({ allowsEditing })}
        color={color}
      />
      <Field
        testID="image-picker-aspect-input"
        label="aspect (x:y, with allowsEditing)"
        value={props.form.aspect}
        onChange={aspect => props.setForm({ aspect })}
        placeholder="4:3"
      />
      <ChoiceRow
        testID="image-picker-shape"
        label="shape (Android crop)"
        options={SHAPE_CHOICES}
        value={props.form.shape}
        onChange={shape => props.setForm({ shape })}
        color={color}
      />
      <Field
        testID="image-picker-quality-input"
        label="quality (0 - 1)"
        value={props.form.quality}
        onChange={quality => props.setForm({ quality })}
      />
      <ToggleRow
        testID="image-picker-exif-switch"
        label="exif"
        value={props.form.exif}
        onChange={exif => props.setForm({ exif })}
        color={color}
      />
      <ToggleRow
        testID="image-picker-base64-switch"
        label="base64"
        value={props.form.base64}
        onChange={base64 => props.setForm({ base64 })}
        color={color}
      />
    </Card>
  );
}

export function SelectionCard(props: ICardProps) {
  return (
    <Card testID="image-picker-selection-card" title="Library selection">
      <ToggleRow
        testID="image-picker-multiple-switch"
        label="allowsMultipleSelection"
        value={props.form.allowsMultipleSelection}
        onChange={allowsMultipleSelection =>
          props.setForm({ allowsMultipleSelection })
        }
        color={color}
      />
      <Field
        testID="image-picker-limit-input"
        label="selectionLimit (0 = unlimited)"
        value={props.form.selectionLimit}
        onChange={selectionLimit => props.setForm({ selectionLimit })}
      />
      <ToggleRow
        testID="image-picker-ordered-switch"
        label="orderedSelection (iOS 15+)"
        value={props.form.orderedSelection}
        onChange={orderedSelection => props.setForm({ orderedSelection })}
        color={color}
      />
      <ChoiceRow
        testID="image-picker-default-tab"
        label="defaultTab (Android)"
        options={TAB_CHOICES}
        value={props.form.defaultTab}
        onChange={defaultTab => props.setForm({ defaultTab })}
        color={color}
      />
      <ToggleRow
        testID="image-picker-network-switch"
        label="shouldDownloadFromNetwork (iOS)"
        value={props.form.shouldDownloadFromNetwork}
        onChange={shouldDownloadFromNetwork =>
          props.setForm({ shouldDownloadFromNetwork })
        }
        color={color}
      />
    </Card>
  );
}

export function VideoCard(props: ICardProps) {
  return (
    <Card testID="image-picker-video-card" title="Video and presentation">
      <ChoiceRow
        testID="image-picker-video-preset"
        label="videoExportPreset (iOS)"
        options={VIDEO_PRESETS}
        value={props.form.videoExportPreset}
        onChange={videoExportPreset => props.setForm({ videoExportPreset })}
        color={color}
      />
      <ChoiceRow
        testID="image-picker-video-quality"
        label="videoQuality (camera)"
        options={VIDEO_QUALITIES}
        value={props.form.videoQuality}
        onChange={videoQuality => props.setForm({ videoQuality })}
        color={color}
      />
      <Field
        testID="image-picker-duration-input"
        label="videoMaxDuration (seconds)"
        value={props.form.videoMaxDuration}
        onChange={videoMaxDuration => props.setForm({ videoMaxDuration })}
      />
      <ChoiceRow
        testID="image-picker-presentation"
        label="presentationStyle (iOS)"
        options={PRESENTATION_STYLES}
        value={props.form.presentationStyle}
        onChange={presentationStyle => props.setForm({ presentationStyle })}
        color={color}
      />
      <ChoiceRow
        testID="image-picker-representation"
        label="preferredAssetRepresentationMode (iOS)"
        options={REPRESENTATION_MODES}
        value={props.form.preferredAssetRepresentationMode}
        onChange={preferredAssetRepresentationMode =>
          props.setForm({ preferredAssetRepresentationMode })
        }
        color={color}
      />
      <ChoiceRow
        testID="image-picker-camera-type"
        label="cameraType"
        options={CAMERA_CHOICES}
        value={props.form.cameraType}
        onChange={cameraType => props.setForm({ cameraType })}
        color={color}
      />
    </Card>
  );
}
