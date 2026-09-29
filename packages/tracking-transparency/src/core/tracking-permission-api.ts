// `methods` every adapter's `useTrackingPermissions` binds to the shared
// `@symbiote-native/{react,vue,solid,svelte}` `createPermissionHook` factory

import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
} from './tracking-transparency';

export const trackingPermissionMethods = {
  getMethod: getTrackingPermissionsAsync,
  requestMethod: requestTrackingPermissionsAsync,
};
