// KeyboardAvoidingView: the pure logic + view-contract half (framework-agnostic). It owns
// every piece that does NOT need a framework: the keyboard/frame inset math, the onLayout
// frame read, and the behavior -> style/structure decision. Each adapter supplies ONLY the
// lifecycle (subscribe to the Keyboard module, measure via onLayout, hold the inset in its
// reactive primitive) and assembles the wrapper element around its own opaque children.
//
// We do NOT emit a Descriptor tree here the way render-switch does, because KAV wraps
// arbitrary user-provided children (React nodes / Vue slots) that the Descriptor model can't
// carry. Instead we return a layout DESCRIPTION (which styles to apply and whether to nest)
// and the adapter builds its own element tree with its children. Mirrors RN's
// Libraries/Components/Keyboard/KeyboardAvoidingView.js inset/behavior logic.

import {
  AccessibilityInfo,
  dlog,
  isRecord,
  KEYBOARD_EVENT,
  Platform,
} from '@symbiote-native/engine';
import type {
  IKeyboardEventName,
  IPlatformOSType,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';

export type IKeyboardAvoidingBehavior = 'height' | 'position' | 'padding';

// RN's default keyboardVerticalOffset (KeyboardAvoidingView.js).
export const DEFAULT_VERTICAL_OFFSET = 0;

// RN rounds nothing here; 'height' mode collapses flex so the shrunk height holds.
const COLLAPSED_FLEX = 0;

// The wrapper frame as RN's onLayout reports it: nativeEvent.layout.{ y, height }.
export interface IMeasuredFrame {
  y: number;
  height: number;
}

// The keyboard's top edge (screenY) and height, pulled off the raw native payload.
export interface IKeyboardFrame {
  screenY: number;
  height: number;
}

// Pull the keyboard's top edge (screenY) and height off the raw native payload. The shape is
// the consumer's knowledge, so we narrow `unknown` here rather than trust a type, no `as`.
// Returns undefined when the payload isn't a keyboard frame.
export function readKeyboardFrame(
  payload: unknown,
): IKeyboardFrame | undefined {
  if (!isRecord(payload)) return undefined;
  const end = payload.endCoordinates;
  if (!isRecord(end)) return undefined;
  const { screenY, height } = end;
  if (typeof screenY !== 'number' || typeof height !== 'number')
    return undefined;
  return { screenY, height };
}

// Pull the measured wrapper frame ({ y, height }) off a raw onLayout layout object. Returns
// undefined when the shape doesn't carry both numbers, so a bad payload never poisons the math.
export function readLayoutFrame(layout: unknown): IMeasuredFrame | undefined {
  if (!isRecord(layout)) return undefined;
  const { y, height } = layout;
  if (typeof y !== 'number' || typeof height !== 'number') return undefined;
  return { y, height };
}

// Which keyboard notifications KeyboardAvoidingView subscribes to, per host
// (RN KeyboardAvoidingView.js:198-215). TWO events, never three — the change-frame notification is
// deliberately absent, and RN's own comment says why: with an undocked, split or floating iOS
// keyboard, WillChangeFrame is emitted BEFORE WillHide, so a change-frame listener applies a frame
// captured mid-dismissal. iOS additionally takes the WILL pair so the view rides up with the
// keyboard animation rather than snapping into place after it; Android has no will-notifications.
//
// The host is an ARGUMENT, not a `Platform.OS` read inside the body, so both branches are
// unit-testable — the headless Platform module always resolves to iOS.
export type IKeyboardAvoidingEventNames = {
  show: IKeyboardEventName;
  hide: IKeyboardEventName;
};

export function keyboardAvoidingEventNamesFor(
  os: IPlatformOSType,
): IKeyboardAvoidingEventNames {
  if (os === 'ios')
    return { show: KEYBOARD_EVENT.willShow, hide: KEYBOARD_EVENT.willHide };
  return { show: KEYBOARD_EVENT.didShow, hide: KEYBOARD_EVENT.didHide };
}

// The iOS "Prefer Cross-Fade Transitions" setting, read once per mount and fed to computeInset.
//
// AccessibilityInfo's iOS getters REJECT when the native error callback fires. That is deliberate
// RN parity and the engine must keep it — but this caller runs at mount and nobody awaits it, so a
// rejection would surface as an unhandled promise. Five adapters would each need the same `.catch`,
// which is five chances to forget one, so the fallback lives here instead. A failed read and "the
// user does not prefer cross-fade" are indistinguishable to every caller, so false is the honest
// answer, not a swallowed error.
//
// The query is injectable purely so both branches are unit-testable without a native-module fake;
// adapters call it with no arguments.
export function readPrefersCrossFadeTransitions(
  query: () => Promise<boolean> = () =>
    AccessibilityInfo.prefersCrossFadeTransitions(),
): Promise<boolean> {
  return query().catch((error: unknown) => {
    dlog(
      `KeyboardAvoidingView: prefersCrossFadeTransitions read failed -> false (${String(error)})`,
    );
    return false;
  });
}

export type IComputeInsetOptions = {
  // Only 'height' needs the previous-inset correction below; the others leave the measured frame
  // untouched, so feeding it to them would double the lift.
  behavior?: IKeyboardAvoidingBehavior;
  // The inset currently applied — RN's `this.state.bottom`. Defaults to 0 (the first event).
  previousInset?: number;
  // Injectable for testability; defaults to the real host.
  os?: IPlatformOSType;
  // The iOS "Prefer Cross-Fade Transitions" accessibility setting, read by the adapter through
  // AccessibilityInfo. Defaults to false, which is the ordinary math.
  prefersCrossFadeTransitions?: boolean;
};

// RN's _relativeKeyboardHeight: how far up the view must move so it no longer overlaps the
// keyboard. keyboardY is the keyboard's top edge minus the caller's vertical offset; the inset
// is the overlap of the view's bottom past that edge, clamped at 0.
export function computeInset(
  frame: IMeasuredFrame | undefined,
  keyboard: IKeyboardFrame | undefined,
  verticalOffset: number,
  options: IComputeInsetOptions = {},
): number {
  if (frame === undefined || keyboard === undefined) return 0;

  // With the iOS Prefer Cross-Fade Transitions setting on, the keyboard reports screenY as 0
  // rather than its real top edge (RN:88-96). Run through the ordinary math that makes the overlap
  // the view's ENTIRE y + height and pushes the content clean off screen, so RN answers 0.
  const os = options.os ?? Platform.OS;
  if (
    os === 'ios' &&
    keyboard.screenY === 0 &&
    options.prefersCrossFadeTransitions === true
  ) {
    return 0;
  }

  const keyboardY = keyboard.screenY - verticalOffset;

  // The 'height' fixpoint (RN:100-105). In this mode the wrapper is SHRUNK by the inset, so its
  // next onLayout reports a frame shorter by exactly that much. Adding the previous inset back
  // cancels the shrink; without it each subsequent keyboard event computes a smaller overlap and
  // the view walks back down under the keyboard. A correction, not an accumulation.
  if (options.behavior === 'height') {
    return Math.max(
      (options.previousInset ?? 0) + frame.y + frame.height - keyboardY,
      0,
    );
  }

  return Math.max(frame.y + frame.height - keyboardY, 0);
}

// The structure decision. 'nested' wraps the children in an inner view pushed up by
// `bottom: inset` (the 'position' behavior); 'wrapper' applies the style directly to the
// single wrapper that holds the children (the 'padding' / 'height' / default behaviors).
export type IKeyboardAvoidingLayout =
  | {
      kind: 'nested';
      wrapperStyle?: IStyleProp<IViewStyle>;
      innerStyle: IStyleProp<IViewStyle>;
    }
  | { kind: 'wrapper'; wrapperStyle?: IStyleProp<IViewStyle> };

export interface IResolveKeyboardAvoidingLayoutParams {
  behavior?: IKeyboardAvoidingBehavior;
  // Already gated on `enabled` by the adapter: 0 when disabled, the computed inset otherwise.
  effectiveInset: number;
  // The wrapper's first measured height, used only by 'height' mode while the keyboard is up.
  initialHeight?: number;
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
}

// Map the behavior + effective inset onto the wrapper/inner styles and the nesting decision:
// the framework-agnostic core of RN's render(). 'position' nests; the others adjust the
// wrapper directly. 'height' shrinks the wrapper from its initial measured height (only while
// the keyboard is up, matching RN).
export function resolveKeyboardAvoidingLayout(
  params: IResolveKeyboardAvoidingLayoutParams,
): IKeyboardAvoidingLayout {
  const {
    behavior,
    effectiveInset,
    initialHeight,
    style,
    contentContainerStyle,
  } = params;

  if (behavior === 'position') {
    return {
      kind: 'nested',
      wrapperStyle: style,
      innerStyle: [contentContainerStyle, { bottom: effectiveInset }],
    };
  }

  if (behavior === 'padding') {
    return {
      kind: 'wrapper',
      wrapperStyle: [style, { paddingBottom: effectiveInset }],
    };
  }

  if (
    behavior === 'height' &&
    effectiveInset > 0 &&
    initialHeight !== undefined
  ) {
    return {
      kind: 'wrapper',
      wrapperStyle: [
        style,
        { height: initialHeight - effectiveInset, flex: COLLAPSED_FLEX },
      ],
    };
  }

  return { kind: 'wrapper', wrapperStyle: style };
}
