import { requireNativeModule } from 'expo-modules-core';
import { DeviceType } from './types';

const EXPO_DEVICE_MODULE_NAME = 'ExpoDevice';

// Constants are optional fields (not just the async methods) because several of them are
// genuinely absent on one platform — modelId is iOS-only, designName/productName/
// osBuildFingerprint/platformApiLevel are Android-only — so the native module itself may simply
// never populate that field rather than the whole module being unavailable. Each async method is
// optional for the same reason every sibling package's native module type is (local-auth,
// cellular, battery): each call site in device.ts checks for the method's presence itself and
// throws an UnavailabilityError, matching upstream's own per-platform capability checks rather
// than assuming the native module implements the whole surface.
export type INativeDeviceModule = {
  isDevice?: boolean;
  brand?: string | null;
  manufacturer?: string | null;
  modelId?: string | null;
  modelName?: string | null;
  designName?: string | null;
  productName?: string | null;
  deviceType?: DeviceType | null;
  deviceYearClass?: number | null;
  totalMemory?: number | null;
  supportedCpuArchitectures?: string[] | null;
  osName?: string | null;
  osVersion?: string | null;
  osBuildId?: string | null;
  osInternalBuildId?: string | null;
  osBuildFingerprint?: string | null;
  platformApiLevel?: number | null;
  deviceName?: string | null;
  getDeviceTypeAsync?(): Promise<DeviceType>;
  getUptimeAsync?(): Promise<number>;
  getMaxMemoryAsync?(): Promise<number>;
  isRootedExperimentalAsync?(): Promise<boolean>;
  isSideLoadingEnabledAsync?(): Promise<boolean>;
  getPlatformFeaturesAsync?(): Promise<string[]>;
  hasPlatformFeatureAsync?(feature: string): Promise<boolean>;
};

export const expoDevice = requireNativeModule<INativeDeviceModule>(EXPO_DEVICE_MODULE_NAME);
