// Hand-ported from .vendors/expo/packages/expo-battery/src/Battery.types.ts (sdk-57) — plain
// data shapes, no `expo` meta-package import to swap out (unlike local-auth's types.ts).

export type PowerState = {
  /** A number between `0` and `1`, inclusive, or `-1` if the battery level is unknown. */
  batteryLevel: number;
  /** An enum value representing the battery state. */
  batteryState: BatteryState;
  /** `true` if lowPowerMode is on, `false` if lowPowerMode is off. */
  lowPowerMode: boolean;
};

export enum BatteryState {
  /** If the battery state is unknown or inaccessible. */
  UNKNOWN = 0,
  /**
   * If the battery is discharging (typically not connected to power). On Android, this
   * corresponds to `BATTERY_STATUS_DISCHARGING`.
   */
  UNPLUGGED,
  /** If battery is charging. */
  CHARGING,
  /** If the battery level is full. */
  FULL,
  /**
   * The battery is not charging while power is connected (AC/USB/wireless), for example when
   * battery protection limits charge to 80%, or optimized charging pauses. This differs from
   * `UNPLUGGED` (discharging on battery).
   * @platform android
   */
  NOT_CHARGING,
}

export type BatteryLevelEvent = {
  /** A number between `0` and `1`, inclusive, or `-1` if the battery level is unknown. */
  batteryLevel: number;
};

export type BatteryStateEvent = {
  /** An enum value representing the battery state. */
  batteryState: BatteryState;
};

export type PowerModeEvent = {
  /** `true` if lowPowerMode is on, `false` if lowPowerMode is off. */
  lowPowerMode: boolean;
};
