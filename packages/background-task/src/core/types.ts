/** Availability status for the Background Task API. */
export enum BackgroundTaskStatus {
  /** Background tasks are unavailable — e.g. running on an iOS Simulator. */
  Restricted = 1,
  /** Background tasks are available for the app. */
  Available = 2,
}

/** Return value a background-task executor should resolve with. */
export enum BackgroundTaskResult {
  /** The task finished successfully. */
  Success = 1,
  /** The task failed. */
  Failed = 2,
}

/** Options accepted by {@link registerTaskAsync}. */
export type IBackgroundTaskOptions = {
  /**
   * Inexact interval in minutes between subsequent repeats of the background task. The final
   * interval may differ from the specified one to minimize wakeups and battery usage.
   * - Defaults to once every 12 hours; the minimum interval is 15 minutes.
   * - The OS controls the real execution interval and treats this as a minimum delay only — on
   *   iOS a short interval is often ignored, since the system typically runs background tasks
   *   during specific windows (e.g. overnight).
   */
  minimumInterval?: number;
};
