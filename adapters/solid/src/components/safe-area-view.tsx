// SafeAreaView — the native view that insets its children past the notch, the rounded corners and
// the system bars. There is no JS-side inset math anywhere in this project: the host does it, and
// every adapter's job is only to put style + children on the `symbiote-safe-area-view` intrinsic.
//
// So this is a View twin, and ./view.tsx carries the reasoning they share (why the file is real
// JSX, why nothing is destructured at setup, why children and ref are pulled out of the bag).
// The one thing worth repeating: there is no renderSafeAreaView() in @symbiote-native/components
// and there must not be (.claude/rules/component-render-fn-boundary.md) — `children` is a live
// Solid subtree that flows through the reconciler and is never reduced back to a Descriptor.
//
// The bag goes through withStableKeys because resolveAccessibilityProps has two branches with
// DIFFERENT key sets, and Solid's `spread` has no removal pass — see utils/stable-keys.ts.

import { splitProps } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote-native/components';
import {
  dlog,
  type IClassNameValue,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { withStableKeys } from '../utils/stable-keys';

// Per-adapter because `children` is a Solid JSX.Element — the test
// <prop_types_split_agnostic_vs_per_adapter> applies: the agnostic field base
// (IAccessibilityProps / IAriaProps, IStyleProp, ISymbioteEvent) is shared, the framework-flavoured
// field is not. React's, Vue's and Svelte's ISafeAreaViewProps are separate declarations for the
// same reason, and an adapter never imports another adapter's types.
//
// No `ref`: neither React's, Vue's nor Svelte's SafeAreaView exposes one, and parity is measured
// against that surface. A caller needing a host handle wraps this in a <View ref={…}>.
export interface ISafeAreaViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // Solid's own spelling for a registered class name — `class`, matching View and Text (React's is
  // `className`). Resolved through the shared style registry by routeProp's class+style merge.
  class?: IClassNameValue;
  // Fires with the measured frame once Fabric lays the view out; a listener also raises the
  // onLayout flag prop so native actually measures. Left in the forwarded bag rather than
  // destructured and conditionally re-attached (React's shape) — routeProp already ignores an
  // undefined value, and a key that appears and disappears between runs is the hazard
  // withStableKeys exists for.
  onLayout?: (event: ISymbioteEvent) => void;
  children?: JSX.Element;
}

export function SafeAreaView(props: ISafeAreaViewProps): JSX.Element {
  const [local, rest] = splitProps(props, ['children']);

  dlog('SafeAreaView -> SafeAreaView');

  const bag = withStableKeys(() => ({ ...resolveAccessibilityProps(rest) }));

  return (
    <symbiote-safe-area-view {...bag()}>
      {local.children}
    </symbiote-safe-area-view>
  );
}
