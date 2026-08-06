// Hand-ported from .vendors/expo/packages/expo-cellular/src/Cellular.types.ts (sdk-57).
// PermissionResponse/PermissionStatus/PermissionExpiration come straight from
// expo-modules-core (which re-exports PermissionsInterface) — never from the `expo`
// meta-package, unlike upstream's own Cellular.ts.
export {
  PermissionStatus,
  type PermissionResponse,
  type PermissionExpiration,
} from 'expo-modules-core';

/** Telecommunication technology used to establish a cellular connection. */
export enum CellularGeneration {
  /** The device's connection generation could not be determined. */
  UNKNOWN = 0,
  /** 2nd generation (GPRS/EDGE-class) connection. */
  CELLULAR_2G = 1,
  /** 3rd generation (UMTS/HSPA-class) connection. */
  CELLULAR_3G = 2,
  /** 4th generation (LTE-class) connection. */
  CELLULAR_4G = 3,
  /** 5th generation (NR-class) connection. */
  CELLULAR_5G = 4,
}
