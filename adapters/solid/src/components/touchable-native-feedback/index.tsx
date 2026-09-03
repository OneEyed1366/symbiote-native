// TouchableNativeFeedback — Android's ripple / state-drawable touchable, built on Pressable like
// the rest of the family. RN clones its child into an RCTView carrying the native ripple props;
// we nest the child under a feedback view that carries them, inside a Pressable that owns the
// press wiring. `nativeBackgroundAndroid` / `nativeForegroundAndroid` are read by Android's
// ReactViewManager; on iOS they are inert props, so the component still renders its child with
// working press wiring — exactly what React's and Vue's do.
//
// EVERYTHING NON-LIFECYCLE IS SHARED. The static factories (selectableBackground,
// selectableBackgroundBorderless, rippleBackground), the platform gate (canUseNativeForeground)
// and the background→native-prop mapping (backgroundProps) all live in
// @symbiote-native/components; this file only attaches them to the component value and nests the
// feedback view. Press timing is Pressable's, which is the shared state machine.
//
// The feedback carrier is a raw `symbiote-view`, not the `View` component — the same choice
// Pressable already makes for its android_ripple wrapper. It carries native props and nothing
// else: no accessibility surface, no class, no ref, so View's aria fold and nativeID resolution
// would be pure overhead. The committed node is `RCTView` either way.
//
// NOTHING here destructures `props`. A Solid component body runs ONCE, so a destructure would
// freeze the background at its mount-time value; every read below sits inside an accessor.

import { splitProps } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  backgroundProps,
  canUseNativeForeground,
  rippleBackground,
  selectableBackground,
  selectableBackgroundBorderless,
  type INativeFeedbackBackground,
} from '@symbiote-native/components';
import { dlog } from '@symbiote-native/engine';
import { withStableKeys } from '../../utils/stable-keys';
import {
  TouchablePressable as Pressable,
  type IPressableProps,
} from '../pressable';

export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from '@symbiote-native/components';

// Declared here, never imported from another adapter: `children` is a framework value, which is
// the test <prop_types_split_agnostic_vs_per_adapter> applies. The agnostic field base arrives
// through IPressableProps (itself built on the shared IAccessibilityProps / IAriaProps /
// IPressHandler). `style` is dropped exactly as React's is — RN's TouchableNativeFeedback has no
// style of its own, the drawable is the whole visual. `children` narrows to a plain subtree: this
// component has no press-state render prop (RN accepts a single child View), so Pressable's
// accessor-flavoured IPressableChildren does not apply.
export interface ITouchableNativeFeedbackProps extends Omit<
  IPressableProps,
  'style' | 'children'
> {
  background?: INativeFeedbackBackground;
  useForeground?: boolean;
  children?: JSX.Element;
}

function TouchableNativeFeedbackImpl(
  props: ITouchableNativeFeedbackProps,
): JSX.Element {
  const [local, rest] = splitProps(props, [
    'background',
    'useForeground',
    'children',
  ]);

  // ONE bag, and it goes through withStableKeys. backgroundProps returns a DIFFERENT single key
  // per branch (nativeForegroundAndroid vs nativeBackgroundAndroid), and Solid's `spread` walks
  // only the current key set with no removal pass — so flipping `useForeground` on an Android
  // host would leave the abandoned key painting its old drawable forever. Widening restores what
  // React and Vue get from their reconcilers: the vanished key arrives as `undefined`, which
  // routeProp treats as a delete, and `spread` still does the actual diffing
  // (.claude/rules/solid-descriptor-bridge.md §1).
  const feedbackProps = withStableKeys(() => {
    // RN never leaves a TouchableNativeFeedback without feedback: a missing background defaults
    // to SelectableBackground().
    const resolved = local.background ?? selectableBackground();
    const useForeground = local.useForeground === true;
    dlog(
      `TouchableNativeFeedback render ${resolved.type} useForeground ${useForeground}`,
    );
    // The no-op seam: RN silently routes a requested foreground back to the background slot off
    // Android / below API 23, and a missing ripple on device looks like a broken component.
    if (useForeground && !canUseNativeForeground()) {
      dlog(
        'TouchableNativeFeedback useForeground ignored: no native foreground here',
      );
    }
    return backgroundProps(resolved, useForeground);
  });

  // Two single spreads, never spread-then-override: `mergeProps` (which the compiler uses for a
  // spread followed by an explicit prop) keeps the FIRST non-undefined value, so an explicit
  // `undefined` after a spread silently loses — the opposite of React's JSX spread
  // (.claude/rules/solid-descriptor-bridge.md §6). `rest` and `feedbackProps()` are each the sole
  // source for their element, so there is nothing to merge.
  return (
    <Pressable {...rest}>
      <symbiote-view {...feedbackProps()}>{local.children}</symbiote-view>
    </Pressable>
  );
}

// The statics ride on the component value so callers reach TouchableNativeFeedback.Ripple(…)
// exactly like RN. They are the shared functions themselves, not wrappers.
export const TouchableNativeFeedback = Object.assign(
  TouchableNativeFeedbackImpl,
  {
    SelectableBackground: selectableBackground,
    SelectableBackgroundBorderless: selectableBackgroundBorderless,
    Ripple: rippleBackground,
    canUseNativeForeground,
  },
);
