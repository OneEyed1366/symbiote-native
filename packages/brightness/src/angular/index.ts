// PermissionsService is the Angular-only lifecycle half; the free functions and event
// subscription plumbing all live in core, shared with React/Vue.
export { PermissionsService } from './services/permissions.service';
export {
  isAvailableAsync,
  getBrightnessAsync,
  setBrightnessAsync,
  getSystemBrightnessAsync,
  setSystemBrightnessAsync,
  restoreSystemBrightnessAsync,
  isUsingSystemBrightnessAsync,
  getSystemBrightnessModeAsync,
  setSystemBrightnessModeAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  addBrightnessListener,
  BrightnessMode,
  PermissionStatus,
  type BrightnessEvent,
  type PermissionExpiration,
  type PermissionResponse,
  type EventSubscription,
} from '../core';
