import type {
  ICameraCapturedPicture,
  ICameraPictureOptions,
  ICameraRecordingOptions,
} from './types';

const MIRROR_DEPRECATED =
  'The `mirror` option is deprecated. Please use the `mirror` prop on the `CameraView` instead.';

// The callbacks wait here for the native event that carries their picture
const pictureSavedCallbacks = new Map<
  number,
  (picture: ICameraCapturedPicture) => void
>();
let nextPictureId = 1;

export function ensurePictureOptions(
  options?: ICameraPictureOptions,
): ICameraPictureOptions {
  if (!options || typeof options !== 'object') return {};
  if (options.mirror) console.warn(MIRROR_DEPRECATED);
  const { onPictureSaved, ...rest } = options;
  const withQuality = { ...rest, quality: options.quality ?? 1 };
  if (!onPictureSaved) return withQuality;
  const id = nextPictureId++;
  pictureSavedCallbacks.set(id, onPictureSaved);
  return { ...withQuality, id, fastMode: true };
}

export function ensureRecordingOptions(
  options: ICameraRecordingOptions = {},
): ICameraRecordingOptions {
  if (options.mirror) console.warn(MIRROR_DEPRECATED);
  return options;
}

export function handlePictureSaved({
  nativeEvent,
}: {
  nativeEvent: { data: ICameraCapturedPicture; id: number };
}): void {
  const callback = pictureSavedCallbacks.get(nativeEvent.id);
  if (!callback) return;
  pictureSavedCallbacks.delete(nativeEvent.id);
  callback(nativeEvent.data);
}
