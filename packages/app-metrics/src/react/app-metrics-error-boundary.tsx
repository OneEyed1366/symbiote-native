import {
  Component,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react';
import { reportCaughtError } from '../core/report-caught-error';

export type IAppMetricsErrorBoundaryFallbackProps = {
  /** The value the subtree threw, usually an `Error` but any value can be thrown */
  error: unknown;
  /** Clears the caught error and re-renders the children from a clean, re-mounted state */
  resetError: () => void;
};

export type IAppMetricsErrorBoundaryProps = {
  children: ReactNode;
  /** A React element, a render function receiving `error`/`resetError`, or `null` */
  fallback:
    | ReactElement
    | null
    | ((props: IAppMetricsErrorBoundaryFallbackProps) => ReactNode);
};

type IState = {
  /** Tracked separately from `error` since the thrown value itself can be falsy */
  hasError: boolean;
  error: unknown;
};

/** Records a render-phase error via `reportError` and renders `fallback` in place of it */
export class AppMetricsErrorBoundary extends Component<
  IAppMetricsErrorBoundaryProps,
  IState
> {
  override state: IState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): IState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    if (__DEV__) {
      console.warn(
        '[app-metrics] AppMetricsErrorBoundary caught a render error:',
        error,
      );
    }
    reportCaughtError(error, errorInfo.componentStack?.trim() || undefined);
  }

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { fallback } = this.props;
    if (typeof fallback === 'function') {
      return fallback({ error: this.state.error, resetError: this.resetError });
    }
    return fallback;
  }

  private resetError = (): void => {
    this.setState({ hasError: false, error: null });
  };
}
