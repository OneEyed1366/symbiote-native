// Apart from `native-module`, which resolves the module on import: the views need the name too

export const VIDEO_MODULE_NAME = 'ExpoVideo';

/** Upstream's label for its `UnavailabilityError` */
export const VIDEO_PACKAGE_NAME = 'expo-video';

export const VIDEO_VIEW_NAMES = {
  /** The one iOS view */
  video: 'VideoView',
  /** The Android default, renders into a `SurfaceView` */
  surface: 'SurfaceVideoView',
  /** Android, for overlapping views */
  texture: 'TextureVideoView',
  airPlayButton: 'VideoAirPlayButtonView',
} as const;
