import type { PermissionResponse } from 'expo-modules-core';

export enum LocationAccuracy {
  Lowest = 1,
  Low = 2,
  Balanced = 3,
  High = 4,
  Highest = 5,
  BestForNavigation = 6,
}

export enum LocationActivityType {
  Other = 1,
  AutomotiveNavigation = 2,
  Fitness = 3,
  OtherNavigation = 4,
  /** @platform ios */
  Airborne = 5,
}

export enum LocationGeofencingEventType {
  Enter = 1,
  Exit = 2,
}

export enum LocationGeofencingRegionState {
  Unknown = 0,
  Inside = 1,
  Outside = 2,
}

export type ILocationOptions = {
  accuracy?: LocationAccuracy;
  /** @platform android */
  mayShowUserSettingsDialog?: boolean;
  /** @platform android */
  timeInterval?: number;
  distanceInterval?: number;
};

export type ILocationLastKnownOptions = {
  maxAge?: number;
  requiredAccuracy?: number;
};

export type ILocationTaskServiceOptions = {
  notificationTitle: string;
  notificationBody: string;
  notificationColor?: string;
  killServiceOnDestroy?: boolean;
};

export type ILocationTaskOptions = ILocationOptions & {
  /** @platform ios */
  showsBackgroundLocationIndicator?: boolean;
  deferredUpdatesDistance?: number;
  deferredUpdatesTimeout?: number;
  deferredUpdatesInterval?: number;
  /** @platform ios */
  activityType?: LocationActivityType;
  /** @platform ios */
  pausesUpdatesAutomatically?: boolean;
  foregroundService?: ILocationTaskServiceOptions;
};

export type ILocationRegion = {
  identifier?: string;
  latitude: number;
  longitude: number;
  radius: number;
  /** @default true */
  notifyOnEnter?: boolean;
  /** @default true */
  notifyOnExit?: boolean;
  state?: LocationGeofencingRegionState;
};

export type ILocationObjectCoords = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
};

export type ILocationObject = {
  coords: ILocationObjectCoords;
  timestamp: number;
  /** @platform android */
  mocked?: boolean;
};

export type ILocationCallback = (location: ILocationObject) => unknown;
export type ILocationErrorCallback = (reason: string) => void;

export type ILocationProviderStatus = {
  locationServicesEnabled: boolean;
  backgroundModeEnabled: boolean;
  /** @platform android */
  gpsAvailable?: boolean;
  /** @platform android */
  networkAvailable?: boolean;
  /** @platform android */
  passiveAvailable?: boolean;
};

export type ILocationHeadingObject = {
  trueHeading: number;
  magHeading: number;
  /** 0 none, 1 low, 2 medium, 3 high */
  accuracy: number;
};

export type ILocationHeadingCallback = (
  heading: ILocationHeadingObject,
) => unknown;

export type ILocationGeocodedLocation = {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
};

export type ILocationGeocodedAddress = {
  city: string | null;
  district: string | null;
  streetNumber: string | null;
  street: string | null;
  region: string | null;
  subregion: string | null;
  country: string | null;
  postalCode: string | null;
  name: string | null;
  isoCountryCode: string | null;
  /** @platform ios */
  timezone: string | null;
  /** @platform android */
  formattedAddress: string | null;
};

export type ILocationSubscription = {
  remove: () => void;
};

export type IPermissionDetailsLocationIOS = {
  scope: 'whenInUse' | 'always' | 'none';
  accuracy: 'full' | 'reduced';
};

export type IPermissionDetailsLocationAndroid = {
  accuracy: 'fine' | 'coarse' | 'none';
};

export type ILocationPermissionResponse = PermissionResponse & {
  ios?: IPermissionDetailsLocationIOS;
  android?: IPermissionDetailsLocationAndroid;
};

export type { PermissionResponse };

export enum MotionActivityConfidence {
  Low = 0,
  Medium = 1,
  High = 2,
}

export enum MotionActivityType {
  Automotive = 'automotive',
  Cycling = 'cycling',
  Running = 'running',
  Walking = 'walking',
  Stationary = 'stationary',
  Unknown = 'unknown',
}

export type IMotionActivityState = {
  detected: boolean;
  confidence: MotionActivityConfidence;
};

export type IMotionActivityObject = {
  activities: Record<MotionActivityType, IMotionActivityState>;
  timestamp: number;
};

export type IMotionActivityCallback = (
  activity: IMotionActivityObject,
) => unknown;
