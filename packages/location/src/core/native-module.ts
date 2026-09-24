import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import type {
  ILocationGeocodedAddress,
  ILocationGeocodedLocation,
  ILocationLastKnownOptions,
  ILocationObject,
  ILocationOptions,
  ILocationPermissionResponse,
  ILocationProviderStatus,
  ILocationRegion,
  ILocationTaskOptions,
  PermissionResponse,
} from './types';

const EXPO_LOCATION_MODULE_NAME = 'ExpoLocation';

export type INativeLocationModule = {
  addListener(
    eventName: string,
    listener: (event: unknown) => void,
  ): EventSubscription;
  getProviderStatusAsync(): Promise<ILocationProviderStatus>;
  enableNetworkProviderAsync(): Promise<void>;
  getCurrentPositionAsync(options: ILocationOptions): Promise<ILocationObject>;
  getLastKnownPositionAsync(
    options: ILocationLastKnownOptions,
  ): Promise<ILocationObject | null>;
  watchPositionImplAsync(
    watchId: number,
    options: ILocationOptions,
  ): Promise<void>;
  watchDeviceHeading(watchId: number): Promise<void>;
  removeWatchAsync(watchId: number): Promise<void>;
  geocodeAsync(address: string): Promise<ILocationGeocodedLocation[]>;
  reverseGeocodeAsync(
    location: Pick<ILocationGeocodedLocation, 'latitude' | 'longitude'>,
  ): Promise<ILocationGeocodedAddress[]>;
  getForegroundPermissionsAsync(): Promise<ILocationPermissionResponse>;
  requestForegroundPermissionsAsync(): Promise<ILocationPermissionResponse>;
  getBackgroundPermissionsAsync(): Promise<PermissionResponse>;
  requestBackgroundPermissionsAsync(): Promise<PermissionResponse>;
  hasServicesEnabledAsync(): Promise<boolean>;
  getMotionActivityPermissionsAsync(): Promise<PermissionResponse>;
  requestMotionActivityPermissionsAsync(): Promise<PermissionResponse>;
  watchMotionActivityImplAsync(watchId: number): Promise<void>;
  startLocationUpdatesAsync(
    taskName: string,
    options: ILocationTaskOptions,
  ): Promise<void>;
  stopLocationUpdatesAsync(taskName: string): Promise<void>;
  hasStartedLocationUpdatesAsync(taskName: string): Promise<boolean>;
  startGeofencingAsync(
    taskName: string,
    options: { regions: ILocationRegion[] },
  ): Promise<void>;
  stopGeofencingAsync(taskName: string): Promise<void>;
  hasStartedGeofencingAsync(taskName: string): Promise<boolean>;
};

export const expoLocation = requireNativeModule<INativeLocationModule>(
  EXPO_LOCATION_MODULE_NAME,
);
