// What a native view gets from the C++ pressable rule: it takes the focus and is announced as a
// control unless the app says otherwise, and a disabled one says so. The press machine itself runs
// in JS, so the props it consumes are owned here and never reach the element

import { isRecord } from '@symbiote-native/engine';
import type { IAttributes } from './dom-attributes';

type IBag = Readonly<Record<string, unknown>>;

const PRESSABLE_TAGS = [
  'pressable',
  'touchable-opacity',
  'touchable-highlight',
  'button',
  'checkbox',
] as const;

export type IPressableTag = (typeof PRESSABLE_TAGS)[number];

// A touchable, and the button built on one, takes the focus only while a press can happen
const NEEDS_PRESS_LISTENER: Readonly<Record<IPressableTag, boolean>> = {
  pressable: false,
  'touchable-opacity': true,
  'touchable-highlight': true,
  button: true,
  checkbox: false,
};

const ROLES: Readonly<Record<IPressableTag, string>> = {
  pressable: 'button',
  'touchable-opacity': 'button',
  'touchable-highlight': 'button',
  button: 'button',
  checkbox: 'checkbox',
};

// `hasPressListener` is the one bit of the owned `press` listener the platform may know
export type IPressableProps = {
  hasPressListener?: unknown;
  disabled?: unknown;
  focusable?: unknown;
  accessible?: unknown;
  testOnly_pressed?: unknown;
  android_ripple?: unknown;
  cancelable?: unknown;
  delayLongPress?: unknown;
  minPressDuration?: unknown;
  unstable_pressDelay?: unknown;
  pressRetentionOffset?: unknown;
  delayHoverIn?: unknown;
  delayHoverOut?: unknown;
  android_disableSound?: unknown;
  blockNativeResponder?: unknown;
  activeOpacity?: unknown;
  underlayColor?: unknown;
  onShowUnderlay?: unknown;
  onHideUnderlay?: unknown;
  delayPressIn?: unknown;
  delayPressOut?: unknown;
  touchSoundDisabled?: unknown;
  rejectResponderTermination?: unknown;
};

export type ITextPressProps = Pick<
  IPressableProps,
  'hasPressListener' | 'disabled'
>;

export function isPressableTag(tag: string): tag is IPressableTag {
  return PRESSABLE_TAGS.some(candidate => candidate === tag);
}

// The direct prop wins, then the aria alias, then the state: presence decides, so `false` is an
// answer (`Button.js:331,337`). `undefined` means no source spoke
export function disabledOf(bag: IBag): boolean | undefined {
  if (typeof bag.disabled === 'boolean') return bag.disabled;
  if (typeof bag['aria-disabled'] === 'boolean') return bag['aria-disabled'];
  const { accessibilityState } = bag;
  if (!isRecord(accessibilityState)) return undefined;
  return typeof accessibilityState.disabled === 'boolean'
    ? accessibilityState.disabled
    : undefined;
}

const isDisabled = (bag: IBag): boolean => disabledOf(bag) === true;

// A direct `disabled` is written over the state's own field, the rest of the state stays
export function foldDisabledIntoState(rest: IBag, { disabled }: IBag): IBag {
  if (typeof disabled !== 'boolean') return rest;
  const { accessibilityState } = rest;
  const state = isRecord(accessibilityState) ? accessibilityState : {};
  return { ...rest, accessibilityState: { ...state, disabled } };
}

function disabledAttribute({ disabled }: IBag): IAttributes {
  return typeof disabled === 'boolean'
    ? { 'aria-disabled': String(disabled) }
    : {};
}

export function pressableRules(tag: IPressableTag, bag: IBag): IAttributes {
  const canPress = bag.hasPressListener === true && !isDisabled(bag);
  const isFocusable =
    bag.focusable !== false && (!NEEDS_PRESS_LISTENER[tag] || canPress);
  return {
    role: ROLES[tag],
    tabindex: isFocusable ? '0' : '-1',
    ...disabledAttribute(bag),
  };
}

// A text with a press callback is what a page calls a link
export function textPressRules(bag: IBag): IAttributes {
  const isLink = bag.hasPressListener === true && !isDisabled(bag);
  return {
    ...(isLink ? { role: 'link', tabindex: '0' } : {}),
    ...disabledAttribute(bag),
  };
}
