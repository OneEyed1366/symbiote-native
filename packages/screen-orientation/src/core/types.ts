// Hand-ported from .vendors/expo/packages/expo-screen-orientation/src/ScreenOrientation.types.ts
// (sdk-57) — plain enums/data shapes, no `expo` meta-package import to swap out (same as
// packages/network's types.ts).

export enum Orientation {
  UNKNOWN = 0,
  PORTRAIT_UP = 1,
  PORTRAIT_DOWN = 2,
  LANDSCAPE_LEFT = 3,
  LANDSCAPE_RIGHT = 4,
}

/**
 * Values that can be passed to `lockAsync()`. `ALL`/`PORTRAIT` are invalid on devices that
 * don't support `PORTRAIT_DOWN`.
 */
export enum OrientationLock {
  /** iOS: all orientations except `PORTRAIT_DOWN`. Android: system decides. */
  DEFAULT = 0,
  /** All four possible orientations. */
  ALL = 1,
  /** Any portrait orientation. */
  PORTRAIT = 2,
  /** Right-side-up portrait only. */
  PORTRAIT_UP = 3,
  /** Upside-down portrait only. */
  PORTRAIT_DOWN = 4,
  /** Any landscape orientation. */
  LANDSCAPE = 5,
  /** Left landscape only. */
  LANDSCAPE_LEFT = 6,
  /** Right landscape only. */
  LANDSCAPE_RIGHT = 7,
  /** A platform-specific orientation — not a valid `lockAsync()` policy. */
  OTHER = 8,
  /** Unknown lock — not a valid `lockAsync()` policy. */
  UNKNOWN = 9,
}

/** Each iOS device has a default set of UIKit size classes. */
export enum SizeClassIOS {
  UNKNOWN = 0,
  COMPACT = 1,
  REGULAR = 2,
}

export enum WebOrientationLock {
  PORTRAIT_PRIMARY = 'portrait-primary',
  PORTRAIT_SECONDARY = 'portrait-secondary',
  PORTRAIT = 'portrait',
  LANDSCAPE_PRIMARY = 'landscape-primary',
  LANDSCAPE_SECONDARY = 'landscape-secondary',
  LANDSCAPE = 'landscape',
  ANY = 'any',
  NATURAL = 'natural',
  UNKNOWN = 'unknown',
}

export enum WebOrientation {
  PORTRAIT_PRIMARY = 'portrait-primary',
  PORTRAIT_SECONDARY = 'portrait-secondary',
  LANDSCAPE_PRIMARY = 'landscape-primary',
  LANDSCAPE_SECONDARY = 'landscape-secondary',
}

export type PlatformOrientationInfo = {
  /** @platform android */
  screenOrientationConstantAndroid?: number;
  /** @platform ios */
  screenOrientationArrayIOS?: Orientation[];
  /** @platform web */
  screenOrientationLockWeb?: WebOrientationLock;
};

export type ScreenOrientationInfo = {
  orientation: Orientation;
  /** @platform ios */
  verticalSizeClass?: SizeClassIOS;
  /** @platform ios */
  horizontalSizeClass?: SizeClassIOS;
};

export type OrientationChangeEvent = {
  orientationLock: OrientationLock;
  orientationInfo: ScreenOrientationInfo;
};

export type OrientationChangeListener = (event: OrientationChangeEvent) => void;

/**
 * The shape shared by every adapter's `useScreenOrientation()` hook/composable/service — not an
 * upstream expo-screen-orientation type (upstream ships no reactive hook of its own), defined once
 * here so React/Vue/Angular all consume the identical shape instead of three ad-hoc declarations.
 */
export type ScreenOrientationState = {
  orientation: Orientation;
  orientationLock: OrientationLock;
};
