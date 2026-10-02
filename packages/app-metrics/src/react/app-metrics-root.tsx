import {
  useEffect,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { markFirstRender } from '../core';
import {
  AppMetricsErrorBoundary,
  type IAppMetricsErrorBoundaryProps,
} from './app-metrics-error-boundary';

export type IAppMetricsRootProps = {
  children: ReactNode;
  /** Omitting it leaves the tree unwrapped; pass `null` to capture without rendering anything */
  errorBoundaryFallback?: IAppMetricsErrorBoundaryProps['fallback'];
};

/** Marks the first render, so time-to-first-render is measured without a manual call */
export function AppMetricsRoot({
  children,
  errorBoundaryFallback,
}: IAppMetricsRootProps): ReactElement {
  useEffect(() => {
    markFirstRender();
  }, []);

  // Only OMITTING the prop leaves the tree unwrapped - an explicit `null` still mounts the
  // boundary and renders nothing, so the error is captured rather than propagating
  if (errorBoundaryFallback !== undefined) {
    return (
      <AppMetricsErrorBoundary fallback={errorBoundaryFallback}>
        {children}
      </AppMetricsErrorBoundary>
    );
  }
  return <>{children}</>;
}

/** Wraps `WrappedComponent` in a root, for one call at the app's entry point */
AppMetricsRoot.wrap = function wrap<P extends Record<string, unknown>>(
  WrappedComponent: ComponentType<P>,
): ComponentType<P> {
  function Wrapped(props: P): ReactElement {
    return (
      <AppMetricsRoot>
        <WrappedComponent {...props} />
      </AppMetricsRoot>
    );
  }
  Wrapped.displayName = `AppMetricsRoot(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  return Wrapped;
};
