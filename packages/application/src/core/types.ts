// Upstream ships two iOS-only types describing the shape of a running app build — the
// release channel it was built through and the current APN environment. Ported verbatim
// from expo-application's Application.types.ts (sdk-57).

/**
 * The type of release for the app that is currently running.
 * @platform ios
 */
export enum ApplicationReleaseType {
  UNKNOWN = 0,
  SIMULATOR = 1,
  ENTERPRISE = 2,
  DEVELOPMENT = 3,
  AD_HOC = 4,
  APP_STORE = 5,
}

/**
 * Maps to the `aps-environment` key in the native target's registered entitlements.
 * @platform ios
 */
export type PushNotificationServiceEnvironment = 'development' | 'production' | null;
