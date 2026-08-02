// @symbiote-native/screen-orientation/vue: the Vue entry over the framework-agnostic core.

export { useScreenOrientation } from './composables/use-screen-orientation';
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
  type EventSubscription,
} from '../core';
