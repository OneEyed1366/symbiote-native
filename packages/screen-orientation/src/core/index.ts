export {
  lockAsync,
  lockPlatformAsync,
  unlockAsync,
  getOrientationAsync,
  getOrientationLockAsync,
  getPlatformOrientationLockAsync,
  supportsOrientationLockAsync,
  addOrientationChangeListener,
  removeOrientationChangeListeners,
  removeOrientationChangeListener,
} from './screen-orientation';
export {
  Orientation,
  OrientationLock,
  SizeClassIOS,
  WebOrientationLock,
  WebOrientation,
  type PlatformOrientationInfo,
  type ScreenOrientationInfo,
  type OrientationChangeEvent,
  type OrientationChangeListener,
  type ScreenOrientationState,
} from './types';
export type { EventSubscription } from 'expo-modules-core';
