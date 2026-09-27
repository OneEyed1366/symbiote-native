/**
 * What iOS does with the return value of a background-fetch task executor — lets the platform
 * schedule future fetches more intelligently. Android ignores it (it has no equivalent concept).
 */
export enum BackgroundFetchResult {
  /** There was no new data to download. */
  NoData = 1,
  /** New data was successfully downloaded. */
  NewData = 2,
  /** An attempt to download data was made but that attempt failed. */
  Failed = 3,
}

/** Whether the app can currently receive background-fetch callbacks. */
export enum BackgroundFetchStatus {
  /** The user explicitly disabled background behavior for this app or for the whole system. */
  Denied = 1,
  /**
   * Background updates are unavailable and the user cannot enable them again — e.g. parental
   * controls are in effect for the current user.
   */
  Restricted = 2,
  /** Background updates are available for the app. */
  Available = 3,
}

/** Options accepted by {@link registerTaskAsync}. */
export type IBackgroundFetchOptions = {
  /**
   * Inexact interval in seconds between subsequent repeats of the background fetch alarm. The
   * final interval may differ from the specified one to minimize wakeups and battery usage.
   * - Android defaults to 10 minutes.
   * - iOS calls `setMinimumIntervalAsync` behind the scenes; the platform default is the
   *   smallest fetch interval it supports (10-15 minutes).
   */
  minimumInterval?: number;
  /**
   * Whether to stop receiving background fetch events after the user terminates the app.
   * @default true
   * @platform android
   */
  stopOnTerminate?: boolean;
  /**
   * Whether to restart background fetch events when the device has finished booting.
   * @default false
   * @platform android
   */
  startOnBoot?: boolean;
};
