import { requireNativeModule } from 'expo-modules-core';
import type { PermissionResponse } from 'expo-modules-core';

const EXPO_TRACKING_TRANSPARENCY_MODULE_NAME = 'ExpoTrackingTransparency';

// getAdvertisingId is unconditional (upstream's Kotlin/Swift always implement it); the two
// permission methods are optional and iOS-only in practice — Android/web never reach the native
// module for them at all (see tracking-transparency.ts's Platform.OS !== 'ios' short-circuit), so
// the call site itself checks presence and throws an UnavailabilityError, matching upstream's own
// per-platform capability check rather than assuming the native module implements the whole
// surface (same convention as packages/device/src/core/native-module.ts and
// packages/brightness/src/core/native-module.ts).
export type INativeTrackingTransparencyModule = {
  getAdvertisingId(): string | null;
  requestPermissionsAsync?(): Promise<PermissionResponse>;
  getPermissionsAsync?(): Promise<PermissionResponse>;
};

export const expoTrackingTransparency = requireNativeModule<INativeTrackingTransparencyModule>(
  EXPO_TRACKING_TRANSPARENCY_MODULE_NAME,
);
