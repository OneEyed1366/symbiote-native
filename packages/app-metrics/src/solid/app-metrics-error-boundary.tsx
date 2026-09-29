import { ErrorBoundary, type JSX } from 'solid-js';
import { reportCaughtError } from '../core/report-caught-error';

export type IAppMetricsErrorBoundaryFallbackProps = {
  /** The value the subtree threw, usually an `Error` but any value can be thrown */
  error: unknown;
  /** Clears the caught error and re-renders the children from a clean state */
  resetError: () => void;
};

export type IAppMetricsErrorBoundaryFallback =
  JSX.Element | ((props: IAppMetricsErrorBoundaryFallbackProps) => JSX.Element);

export type IAppMetricsErrorBoundaryProps = {
  /** A JSX element, a render function receiving `error`/`resetError`, or `null` */
  fallback: IAppMetricsErrorBoundaryFallback;
  children: JSX.Element;
};

/** Records a render-phase error, renders `fallback` in place of the failed subtree */
export function AppMetricsErrorBoundary(
  props: IAppMetricsErrorBoundaryProps,
): JSX.Element {
  return ErrorBoundary({
    fallback: (error: unknown, resetError: () => void): JSX.Element => {
      reportCaughtError(error);
      const { fallback } = props;
      return typeof fallback === 'function'
        ? fallback({ error, resetError })
        : fallback;
    },
    get children(): JSX.Element {
      return props.children;
    },
  });
}
