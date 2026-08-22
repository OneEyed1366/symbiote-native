// ActivityIndicator, the Solid lifecycle half. The render (the 'small'/'large' -> native size enum
// translation, the fixed size boxes, the centering wrapper, the color omission) lives in
// @symbiote-native/components/view and is shared verbatim with React, Vue and Svelte. There is no
// state machine: the spinner animates natively, so Solid supplies only prop resolution and the
// descriptor bridge.
//
// NOTHING here destructures `props`. Solid props are getters and a component body runs ONCE;
// destructuring reads them at setup and freezes the component at its mount-time values. Every read
// below happens inside the descriptor accessor, which descriptorToSolid re-runs as a render effect
// on the SAME host nodes.
//
// The per-platform bits (iOS's GRAY default and no extras; Android's theme/null default plus
// styleAttr + indeterminate) arrive via `platform` from index.ios.ts / index.android.ts.

import type { JSX } from '../../jsx-runtime';
import {
  renderActivityIndicator,
  resolveAccessibilityProps,
  type IActivityIndicatorPlatform,
  type IActivityIndicatorProps as IActivityIndicatorBaseProps,
} from '@symbiote-native/components';
import type { IClassNameValue } from '@symbiote-native/engine';
import { descriptorToSolid } from '../../descriptor-to-solid';

export type {
  IActivityIndicatorPlatform,
  IActivityIndicatorSize,
} from '@symbiote-native/components';

// The agnostic base (animating / color / size / hidesWhenStopped / style / onLayout plus the
// accessibility and aria surface) is shared and re-exported rather than redeclared; only the
// class-styling field is per-adapter, and Solid's idiom is `class`, matching View, Text and Switch
// (React's is `className`) — <prop_types_split_agnostic_vs_per_adapter>.
export type IActivityIndicatorProps = IActivityIndicatorBaseProps & {
  class?: IClassNameValue;
};

// Read by the component itself; everything else (testID, nativeID, the accessibility surface,
// onLayout, class) forwards onto the centering wrapper View, which is where RN spreads `...props`.
const HANDLED_PROPS = [
  'animating',
  'color',
  'hidesWhenStopped',
  'size',
  'style',
];

// The wrapper is a raw symbiote-view emitted by the render fn, not the View component, so it never
// runs resolveAccessibilityProps itself — the fold happens here, exactly like React's hook does.
// The two branches of that fold emit DIFFERENT key sets; descriptorToSolid runs the resulting bag
// through withStableKeys, so a vanished key still reaches routeProp as a delete
// (.claude/rules/solid-descriptor-bridge.md §1).
function forwardProps(props: IActivityIndicatorProps): Record<string, unknown> {
  const forwarded: Record<string, unknown> = {
    ...resolveAccessibilityProps(props),
  };
  for (const key of HANDLED_PROPS) delete forwarded[key];
  return forwarded;
}

export function createActivityIndicator(
  platform: IActivityIndicatorPlatform,
): (props: IActivityIndicatorProps) => JSX.Element {
  return function ActivityIndicator(
    props: IActivityIndicatorProps,
  ): JSX.Element {
    // `?? 'small'` / `?? true` rather than a `!== false` coercion: props are typed here, so this is
    // the exact semantics of React's destructuring defaults (only `undefined` falls back).
    return descriptorToSolid(() =>
      renderActivityIndicator(
        {
          animating: props.animating ?? true,
          hidesWhenStopped: props.hidesWhenStopped ?? true,
          size: props.size ?? 'small',
          color: props.color,
          style: props.style,
          passthrough: forwardProps(props),
        },
        platform,
      ),
    );
  };
}
