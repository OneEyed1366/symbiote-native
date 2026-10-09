// Defaults and sentinels shared by the list state modules, the defaults match RN

import {
  Platform,
  type IPlatformOSType,
  type IViewStyle,
} from '@symbiote-native/engine';

// `windowSize` counts viewport-lengths, so 21 buffers ten screens on each side
export const DEFAULT_WINDOW_SIZE = 21;
// Bounds the first paint before any layout is measured
export const DEFAULT_INITIAL_NUM_TO_RENDER = 10;
export const DEFAULT_MAX_TO_RENDER_PER_BATCH = 10;
export const DEFAULT_UPDATE_CELLS_BATCHING_PERIOD = 50;
export const DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD = 0;
// When to FIRE `onEndReached`/`onStartReached` without a threshold, a flat 2 pixels
// Not the windowing-only `?? 2` multiple, mixing them fires two screens early
export const DEFAULT_EDGE_REACHED_THRESHOLD_PX = 2;
// The windowing-only default of both thresholds, in viewport-lengths
export const DEFAULT_WINDOWING_THRESHOLD = 2;
// Above this speed (px per ms) the window is filled ahead of the batching timer
export const FAST_SCROLL_VELOCITY = 2;
export const FIRST_INDEX = 0;
export const EMPTY_OFFSET = 0;
export const NO_INDEX = -1;
export const FULLY_VISIBLE_PERCENT = 100;
// Sub-pixel end distances floor to 0, so a debounced scroll stopping short still reaches the end
export const ON_EDGE_REACHED_EPSILON = 0.001;
// Real content lengths are >= 0, so -1 never collides with one
export const NO_CONTENT_LENGTH_SENT = -1;

const ANDROID_OS: IPlatformOSType = 'android';

// Section headers stick by default only here, RN's per-platform default
export const STICKY_HEADERS_DEFAULT_OS: IPlatformOSType = 'ios';

// Inversion flips the content container, each cell flips back to stay upright
// Android uses `scale: -1` because `scaleY: -1` can ANR on API 33+
export function invertedYStyleFor(os: IPlatformOSType): IViewStyle {
  return os === ANDROID_OS
    ? { transform: [{ scale: -1 }] }
    : { transform: [{ scaleY: -1 }] };
}

export const INVERTED_Y_STYLE: IViewStyle = invertedYStyleFor(Platform.OS);
export const INVERTED_X_STYLE: IViewStyle = { transform: [{ scaleX: -1 }] };
