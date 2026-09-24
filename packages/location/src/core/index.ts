export {
  PermissionStatus,
  type PermissionHookOptions,
  type PermissionExpiration,
} from 'expo-modules-core';

export { getCurrentWatchId } from './subscribers';

export * from './location';
export * from './types';

export {
  LocationAccuracy as Accuracy,
  LocationActivityType as ActivityType,
  LocationGeofencingEventType as GeofencingEventType,
  LocationGeofencingRegionState as GeofencingRegionState,
} from './types';
