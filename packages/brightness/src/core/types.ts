// Hand-ported from .vendors/expo/packages/expo-brightness/src/Brightness.ts (sdk-57) —
// PermissionResponse/PermissionStatus/PermissionExpiration come straight from
// expo-modules-core (it re-exports PermissionsInterface), never the `expo` meta-package
// upstream itself imports them from.
import {
  PermissionStatus,
  type PermissionExpiration,
  type PermissionResponse,
} from 'expo-modules-core';

export { PermissionStatus, type PermissionExpiration, type PermissionResponse };

/** Enum representing the brightness mode of the device. */
export enum BrightnessMode {
  /** Returned when brightness mode cannot be determined. */
  UNKNOWN = 0,
  /** Automatic brightness mode, tracking the ambient light sensor. */
  AUTOMATIC = 1,
  /** Manual brightness mode, set by the user or by `setSystemBrightnessAsync`. */
  MANUAL = 2,
}

/** Fired when the screen brightness changes, on iOS only. */
export type BrightnessEvent = {
  /** The current brightness value between `0` and `1`, inclusive. */
  brightness: number;
};
