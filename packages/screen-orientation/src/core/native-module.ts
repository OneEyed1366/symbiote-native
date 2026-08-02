import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type {
  Orientation,
  OrientationChangeEvent,
  OrientationLock,
  WebOrientationLock,
} from './types';

const EXPO_SCREEN_ORIENTATION_MODULE_NAME = 'ExpoScreenOrientation';

// The platform-specific lock param/return shape is a genuine per-platform union (Android sends/
// returns a numeric constant, iOS an Orientation[], web a WebOrientationLock string) — never `any`,
// so screen-orientation.ts can narrow it with typeof/Array.isArray instead of casting.
export type IPlatformOrientationParam = number | Orientation[] | WebOrientationLock;

// Every method is optional for the same reason every sibling package's native module type is
// (network, device, battery) — each call site in screen-orientation.ts checks for the method's
// presence itself and throws an UnavailabilityError, matching upstream's own per-platform
// capability checks rather than assuming the native module implements the whole surface.
export type INativeScreenOrientationModule = {
  lockAsync?(orientationLock: OrientationLock): Promise<void>;
  lockPlatformAsync?(platformOrientationParam: IPlatformOrientationParam): Promise<void>;
  getOrientationAsync?(): Promise<Orientation>;
  getOrientationLockAsync?(): Promise<OrientationLock>;
  getPlatformOrientationLockAsync?(): Promise<IPlatformOrientationParam>;
  supportsOrientationLockAsync?(orientationLock: OrientationLock): Promise<boolean>;
  addListener(
    eventName: 'expoDidUpdateDimensions',
    listener: (event: OrientationChangeEvent) => void,
  ): EventSubscription;
};

export const expoScreenOrientation = requireNativeModule<INativeScreenOrientationModule>(
  EXPO_SCREEN_ORIENTATION_MODULE_NAME,
);
