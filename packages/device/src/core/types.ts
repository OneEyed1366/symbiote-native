// Hand-ported from .vendors/expo/packages/expo-device/src/Device.types.ts (sdk-57). The enum
// itself carries no platform-specific logic (unlike local-auth's SecurityLevel.BIOMETRIC alias),
// so it's a verbatim port with no expo-modules-core dependency at all.

/** The type of device the app is currently running on. */
export enum DeviceType {
  /** An unrecognized device type. */
  UNKNOWN = 0,
  /** Mobile phone handsets, typically with a touch screen and held in one hand. */
  PHONE,
  /** Tablet computers, typically with a touch screen that is larger than a usual phone. */
  TABLET,
  /** Desktop or laptop computers, typically with a keyboard and mouse. */
  DESKTOP,
  /** Device with TV-based interfaces. */
  TV,
}
