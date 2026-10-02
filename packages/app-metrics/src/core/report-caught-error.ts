import { reportError } from './app-metrics';

/** Shared by every adapter's error-boundary equivalent, builds and reports a caught render error */
export function reportCaughtError(
  error: unknown,
  componentStack?: string,
): void {
  const caught = error instanceof Error ? error : undefined;
  try {
    reportError({
      source: 'errorBoundary',
      type: caught?.name,
      message: caught?.message ?? String(error),
      stacktrace: caught?.stack,
      componentStack,
      isFatal: false,
    });
  } catch (reportingError) {
    if (__DEV__) {
      console.warn(
        '[app-metrics] Failed to report a caught error:',
        reportingError,
      );
    }
  }
}
