// ScreenOrientationService is the Angular-only lifecycle half; the free functions and event
// subscription plumbing all live in core, shared with React/Vue.
export { ScreenOrientationService } from './services/screen-orientation.service';
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
