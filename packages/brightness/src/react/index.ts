// @symbiote-native/brightness/react: the React entry over the framework-agnostic core. Only the
// permission surface gets a lifecycle hook (there is per-instance state to seed and refresh);
// every other export is a stateless async function or one-shot listener, re-exported verbatim —
// mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks.

export { usePermissions } from './hooks/use-permissions';
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
