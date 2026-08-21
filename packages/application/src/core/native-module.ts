import { requireNativeModule } from 'expo-modules-core';
import type {
  ApplicationReleaseType,
  PushNotificationServiceEnvironment,
} from './types';

const EXPO_APPLICATION_MODULE_NAME = 'ExpoApplication';

// Every method is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, matching upstream's own per-platform capability checks
// rather than assuming the native module implements the whole surface. Same convention as
// packages/local-auth/src/core/native-module.ts.
export type INativeApplicationModule = {
  nativeApplicationVersion?: string | null;
  nativeBuildVersion?: string | null;
  applicationName?: string | null;
  applicationId?: string | null;
  androidId?: string;
  getInstallReferrerAsync?(): Promise<string>;
  getIosIdForVendorAsync?(): Promise<string | null>;
  getApplicationReleaseTypeAsync?(): Promise<ApplicationReleaseType>;
  getPushNotificationServiceEnvironmentAsync?(): Promise<PushNotificationServiceEnvironment>;
  getInstallationTimeAsync?(): Promise<number>;
  getLastUpdateTimeAsync?(): Promise<number>;
};

export const expoApplication = requireNativeModule<INativeApplicationModule>(
  EXPO_APPLICATION_MODULE_NAME,
);
