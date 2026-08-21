// RefreshControl, the Vue lifecycle half. On iOS this is the PullToRefreshView Fabric node that
// lives INSIDE a ScrollView (a sibling before the content container); on Android it is
// AndroidSwipeRefreshLayout and WRAPS the scroll view (a ScrollView there hosts one child). Vue
// takes the wrapped child via its DEFAULT SLOT (the seam the Android scroll-view wrap re-invokes
// to host the scroll view inside it; iOS leaves the slot empty), folds aria/role through the
// shared resolveAccessibilityProps, and forwards the native props onto the
// symbiote-refresh-control host node.
//
// `refreshing` is a controlled prop the parent pushes down each commit; native reports the
// gesture via the direct `topRefresh` event, routed to the host onRefresh prop and turned into
// the typed Vue `refresh` emit.

import { defineComponent, h } from '@vue/runtime-core';
import { dlog, type IClassNameValue } from '@symbiote-native/engine';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote-native/components';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

// Mirrors React's RefreshControlProps minus `children`: Vue hosts the wrapped scroll view via
// the default slot. No JS-side platform renaming: every prop forwards straight to the native
// node, which reads what it understands and ignores the rest.
export interface IRefreshControlProps extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  tintColor?: string;
  title?: string;
  titleColor?: string;
  progressViewOffset?: number;
  // Android-only spinner styling: `colors` are the indicator's animated stroke colors,
  // `progressBackgroundColor` the disc behind it, `size` the diameter preset.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only; iOS native never reads it.
  enabled?: boolean;
  class?: IClassNameValue;
}

export type IRefreshControlEmits = {
  refresh: () => boolean;
};

type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

// Built at the a11y-intersection type (a real narrowing, not a cast), then fold aria-*/role into
// the canonical accessibility* props. Children cross via slots, never attrs.
function foldAttrs(attrs: Record<string, unknown>): IForwardBag {
  const bag: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (key !== 'onRefresh') bag[key] = attrs[key];
  }
  return resolveAccessibilityProps(bag);
}

export const RefreshControl = defineComponent<
  IRefreshControlProps,
  IRefreshControlEmits
>(
  (_props, { attrs: rawAttrs, emit, slots }) => {
    return () => {
      const nativeProps = foldAttrs(normalizeVueAttrs(rawAttrs));
      dlog('RefreshControl -> PullToRefreshView');
      dlog(`RefreshControl refreshing=${String(nativeProps.refreshing)}`);
      if (nativeProps.enabled !== undefined)
        dlog(
          `RefreshControl enabled=${String(nativeProps.enabled)} (Android-only)`,
        );
      dlog('RefreshControl refresh emit wired');
      return h(
        'symbiote-refresh-control',
        {
          ...nativeProps,
          onRefresh: (): void => {
            emit('refresh');
          },
        },
        slots.default !== undefined ? slots.default() : undefined,
      );
    };
  },
  {
    name: 'RefreshControl',
    inheritAttrs: false,
    emits: {
      refresh: (): boolean => true,
    },
  },
);
