import {
  defineComponent,
  onErrorCaptured,
  shallowRef,
  type VNode,
} from '@vue/runtime-core';
import { reportCaughtError } from '../core/report-caught-error';

export type IAppMetricsErrorBoundaryFallbackProps = {
  /** The value the subtree threw, usually an `Error` but any value can be thrown */
  error: unknown;
  /** Clears the caught error and re-renders the default slot from a clean state */
  resetError: () => void;
};

export type IAppMetricsErrorBoundaryFallback =
  | VNode
  | null
  | ((props: IAppMetricsErrorBoundaryFallbackProps) => VNode | null);

export type IAppMetricsErrorBoundaryProps = {
  /** A VNode, a render function receiving `error`/`resetError`, or `null` */
  fallback: IAppMetricsErrorBoundaryFallback;
};

/** Records a render-phase error, renders `fallback` in place of the default slot */
export const AppMetricsErrorBoundary =
  defineComponent<IAppMetricsErrorBoundaryProps>(
    (props, { slots }) => {
      const hasError = shallowRef(false);
      const caughtError = shallowRef<unknown>(null);

      // Returning `false` stops propagation, keeping the error off this engine's own
      // uncaught-error channel, same asymmetry as adapters/vue's own render errors
      onErrorCaptured(error => {
        hasError.value = true;
        caughtError.value = error;
        reportCaughtError(error);
        return false;
      });

      function resetError(): void {
        hasError.value = false;
        caughtError.value = null;
      }

      return (): VNode | VNode[] | null | undefined => {
        if (!hasError.value) return slots.default?.();
        const { fallback } = props;
        return typeof fallback === 'function'
          ? fallback({ error: caughtError.value, resetError })
          : fallback;
      };
    },
    { name: 'AppMetricsErrorBoundary', props: ['fallback'] },
  );
