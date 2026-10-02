import { defineComponent, h, onMounted, type VNode } from '@vue/runtime-core';
import { markFirstRender } from '../core';
import {
  AppMetricsErrorBoundary,
  type IAppMetricsErrorBoundaryFallback,
} from './app-metrics-error-boundary';

export type IAppMetricsRootProps = {
  /** Omitting it leaves the default slot unwrapped; pass `null` to capture without rendering */
  errorBoundaryFallback?: IAppMetricsErrorBoundaryFallback;
};

/** Marks the first render, so time-to-first-render is measured without a manual call */
export const AppMetricsRoot = defineComponent<IAppMetricsRootProps>(
  (props, { slots }) => {
    onMounted(() => markFirstRender());

    return (): VNode | VNode[] | null | undefined => {
      // Only OMITTING the prop leaves the slot unwrapped - an explicit `null` still mounts the
      // boundary and renders nothing, so the error is captured rather than propagating
      if (props.errorBoundaryFallback !== undefined) {
        return h(
          AppMetricsErrorBoundary,
          { fallback: props.errorBoundaryFallback },
          slots.default,
        );
      }
      return slots.default?.();
    };
  },
  { name: 'AppMetricsRoot', props: ['errorBoundaryFallback'] },
);
