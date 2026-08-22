import { requireNativeModule } from 'expo-modules-core';
import type { PermissionResponse } from 'expo-modules-core';
import type { CellularGeneration } from './types';

const EXPO_CELLULAR_MODULE_NAME = 'ExpoCellular';

// Every method is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, same convention as
// packages/haptics/src/core/native-module.ts and packages/local-auth/src/core/native-module.ts.
// Most of these only exist on the Android native module (CellularModule.kt) — iOS short-circuits
// on Platform.OS before ever reaching them (see core/cellular.ts), since carrier/SIM info isn't
// exposed by iOS.
export type INativeCellularModule = {
  getCellularGenerationAsync?(): Promise<CellularGeneration>;
  allowsVoipAsync?(): Promise<boolean>;
  getIsoCountryCodeAsync?(): Promise<string | null>;
  getCarrierNameAsync?(): Promise<string | null>;
  getMobileCountryCodeAsync?(): Promise<string | null>;
  getMobileNetworkCodeAsync?(): Promise<string | null>;
  getPermissionsAsync?(): Promise<PermissionResponse>;
  requestPermissionsAsync?(): Promise<PermissionResponse>;
};

export const expoCellular = requireNativeModule<INativeCellularModule>(
  EXPO_CELLULAR_MODULE_NAME,
);
