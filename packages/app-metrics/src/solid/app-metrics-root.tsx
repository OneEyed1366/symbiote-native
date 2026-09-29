import { onMount, type JSX } from 'solid-js';
import { markFirstRender } from '../core';
import {
  AppMetricsErrorBoundary,
  type IAppMetricsErrorBoundaryFallback,
} from './app-metrics-error-boundary';

export type IAppMetricsRootProps = {
  /** Omitting it leaves children unwrapped; pass `null` to capture without a fallback */
  errorBoundaryFallback?: IAppMetricsErrorBoundaryFallback;
  children: JSX.Element;
};

/** Marks the first render, so time-to-first-render is measured without a manual call */
export function AppMetricsRoot(props: IAppMetricsRootProps): JSX.Element {
  onMount(() => markFirstRender());

  // Only OMITTING the prop leaves children unwrapped - an explicit `null` still mounts the
  // boundary and renders nothing, so the error is captured rather than propagating
  if (props.errorBoundaryFallback === undefined) {
    return props.children;
  }
  return AppMetricsErrorBoundary({
    fallback: props.errorBoundaryFallback,
    get children(): JSX.Element {
      return props.children;
    },
  });
}
