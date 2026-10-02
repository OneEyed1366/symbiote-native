import type { Snippet } from 'svelte';
import type { IAppMetricsErrorBoundaryFallbackProps } from './app-metrics-error-boundary-props';

export type IAppMetricsRootProps = {
  /** Omitting it leaves children unwrapped; pass `null` to capture without a fallback */
  errorBoundaryFallback?: Snippet<
    [IAppMetricsErrorBoundaryFallbackProps]
  > | null;
  children: Snippet;
};
