// Pressable: the render half (framework-agnostic). Pressable owns no host element of its own:
// it composes the adapter's View (so children stay framework nodes), so this layer does not paint
// a Descriptor. It resolves the two prop decisions that are identical across adapters: which
// listeners the responder View carries (gated on disabled + cancelable), and how `disabled` folds
// into accessibilityState. The adapter feeds these into its View element. Pure, no framework.

import { dlog } from '@symbiote-native/engine';
import type { IAccessibilityStateValue } from '../../accessibility-props';
import type { IPressHandlers } from '../../state/pressable';

// RN merges `disabled` into the resolved accessibilityState so a disabled Pressable reports the
// disabled state even if the caller passed none (Pressable.js: disabled != null ? {...state,
// disabled} : state). Untouched when disabled is unset.
export function resolveDisabledAccessibilityState(
  accessibilityState: IAccessibilityStateValue | undefined,
  disabled: boolean | undefined,
): IAccessibilityStateValue | undefined {
  return disabled !== undefined
    ? { ...accessibilityState, disabled }
    : accessibilityState;
}

// RN computes `focusable` in all five touchables and we computed it nowhere until 2026-09-09, so a
// DISABLED control stayed focusable — a keyboard, a TV remote or switch control could land on
// something that cannot be pressed. There are TWO formulas, split by primitive and not by platform;
// do not collapse them.
//
// Pressable defaults it ON (Pressable.js:258). `!== false`, not `?? true`: only a literal `false`
// opts out, the same shape `accessible` uses one file over.
export function resolvePressableFocusable(
  focusable: boolean | undefined,
): boolean {
  return focusable !== false;
}

// The four Touchable* additionally require a press handler and a non-disabled state —
// TouchableOpacity.js:336-340, TouchableHighlight.js:370-374,
// TouchableWithoutFeedback.js:263-266, TouchableNativeFeedback.js:369-372, one expression verbatim.
//
// `hasOnPress` is RN's `onPress !== undefined` and NOT `hasTouchablePressHandler`, which also counts
// onPressIn/onPressOut/onLongPress — that gate is the underlay's, and reusing it here would make a
// press-in-only Touchable focusable where RN leaves it out of the focus order.
//
// A Touchable that composes our Pressable passes the result DOWN as the `focusable` prop; Pressable
// then applies `!== false` to a value that is already boolean, which is why the two compose without
// either side knowing about the other.
export function resolveTouchableFocusable(
  focusable: boolean | undefined,
  hasOnPress: boolean,
  disabled: boolean | undefined,
): boolean {
  return (
    resolvePressableFocusable(focusable) && hasOnPress && disabled !== true
  );
}

// The 3 agnostic gating predicates behind the listener bag below. Angular has no bag to spread -
// it binds these directly onto template event outputs (see adapters/angular/src/components/
// pressable/index.ts), so they're exported and shared rather than folded back into
// buildPressableListeners, keeping both sides on one definition instead of two.

// A disabled Pressable suppresses a press entirely: it never fires and pressed-state never flips,
// exactly as RN's disabled Pressable.
export function shouldSuppressPress(disabled: boolean | undefined): boolean {
  return disabled === true;
}

// Claim the responder so the move stream reaches this View whenever the press isn't suppressed;
// retention reads it.
export function shouldClaimResponder(disabled: boolean | undefined): boolean {
  return disabled !== true;
}

// cancelable === false refuses to yield the responder (RN routes cancelable to
// onResponderTerminationRequest). Unset defers to RN's own default, which is allowed - so this
// resolves to true for undefined rather than hardcoding a value, mirroring the more deliberate of
// the two definitions this predicate replaces.
export function isTerminationAllowed(cancelable: boolean | undefined): boolean {
  return cancelable !== false;
}

// The listeners the responder View carries. When disabled, leave them off entirely - see
// shouldSuppressPress. onResponderTerminationRequest itself is only attached when cancelable is
// set at all, so an unset cancelable leaves RN's native default in charge rather than this
// listener asserting one.
export function buildPressableListeners(
  handlers: IPressHandlers,
  options: { disabled?: boolean; cancelable?: boolean },
): Record<string, unknown> {
  if (shouldSuppressPress(options.disabled)) {
    dlog('Pressable disabled — listeners suppressed');
    return {};
  }
  const listeners: Record<string, unknown> = {
    onPress: handlers.handlePress,
    onPressIn: handlers.handlePressIn,
    onPressOut: handlers.handlePressOut,
    onStartShouldSetResponder: () => shouldClaimResponder(options.disabled),
    onResponderMove: handlers.handleResponderMove,
  };
  if (options.cancelable !== undefined) {
    listeners.onResponderTerminationRequest = () =>
      isTerminationAllowed(options.cancelable);
  }
  return listeners;
}

// Hover has no event on a touch host: there is no pointer-enter/leave. The adapter accepts and
// types the RN hover props but forwards nothing; this records the no-op so a missing hover
// callback on device is explained, not silent (RN onHoverIn/onHoverOut).
export function noteHoverNoop(onHoverIn: unknown, onHoverOut: unknown): void {
  if (onHoverIn !== undefined || onHoverOut !== undefined) {
    dlog(
      'Pressable hover is a no-op on this host (no pointer-enter/leave event)',
    );
  }
}
