// `methods` every adapter's location permission hooks bind to the shared
// `@symbiote-native/{react,vue,solid,svelte}` `createPermissionHook` factory

import {
  getBackgroundPermissionsAsync,
  getForegroundPermissionsAsync,
  getMotionActivityPermissionsAsync,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  requestMotionActivityPermissionsAsync,
} from './location';

export const foregroundPermissionMethods = {
  getMethod: getForegroundPermissionsAsync,
  requestMethod: requestForegroundPermissionsAsync,
};

export const backgroundPermissionMethods = {
  getMethod: getBackgroundPermissionsAsync,
  requestMethod: requestBackgroundPermissionsAsync,
};

export const motionActivityPermissionMethods = {
  getMethod: getMotionActivityPermissionsAsync,
  requestMethod: requestMotionActivityPermissionsAsync,
};
