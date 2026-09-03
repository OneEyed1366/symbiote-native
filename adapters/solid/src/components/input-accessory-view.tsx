// InputAccessoryView — the Solid lifecycle half (iOS). The host-node assembly (nativeID /
// backgroundColor / style / passthrough forwarding onto `symbiote-input-accessory-view`) lives
// framework-agnostic in @symbiote-native/components' renderInputAccessoryView and is shared
// verbatim with React, Vue and Svelte; Solid supplies only the reactivity and the children.
//
// REAL JSX, NOT descriptorToSolid — the same rule View and SafeAreaView follow. The render fn
// returns a host with ZERO structural children by contract; the toolbar content is a live Solid
// subtree only the reconciler can reduce, so the tag stays literal and the shared fn contributes
// its PROPS. The literal tag is safe because renderInputAccessoryView's `type` is a constant.
//
// NOTHING here destructures `props` at setup. Solid props are getters and a component body runs
// ONCE; splitProps keeps both halves reactive, and every read happens inside the bag accessor
// that `spread` re-runs as a render effect on the SAME host node.

import { splitProps } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  renderInputAccessoryView,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import { withStableKeys } from '../utils/stable-keys';

// Per-adapter because `children` is a Solid JSX.Element — the test
// <prop_types_split_agnostic_vs_per_adapter> applies: the agnostic field base
// (IAccessibilityProps / IAriaProps, IStyleProp) is shared, the framework-flavoured field is not.
// React's, Vue's and Svelte's IInputAccessoryViewProps are separate declarations for the same
// reason, and an adapter never imports another adapter's types.
export interface IInputAccessoryViewProps
  extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard. Native pairs
  // the two by string alone; there is no JS-side linking.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  // Solid's own spelling for a registered class name — `class`, matching View and Text (React's
  // is `className`). Left in the forwarded bag; routeProp's class+style merge resolves it.
  class?: IClassNameValue;
  children?: JSX.Element;
}

export function InputAccessoryView(
  props: IInputAccessoryViewProps,
): JSX.Element {
  const [local, rest] = splitProps(props, [
    'children',
    'nativeID',
    'backgroundColor',
    'style',
  ]);

  // withStableKeys is load-bearing twice over: renderInputAccessoryView emits `nativeID` and
  // `backgroundColor` CONDITIONALLY, and resolveAccessibilityProps has two branches with
  // different key sets. Solid's `spread` has no removal pass, so a key that vanishes between
  // runs would keep its last value on the native view forever (see utils/stable-keys.ts).
  const bag = withStableKeys(
    () =>
      renderInputAccessoryView({
        nativeID: local.nativeID,
        backgroundColor: local.backgroundColor,
        style: local.style,
        // This component owns its host element rather than rendering through a View, so folding
        // aria/role into the canonical accessibility* props is its own job, like Image's.
        passthrough: { ...resolveAccessibilityProps(rest) },
      }).props,
  );

  return (
    <symbiote-input-accessory-view {...bag()}>
      {local.children}
    </symbiote-input-accessory-view>
  );
}
