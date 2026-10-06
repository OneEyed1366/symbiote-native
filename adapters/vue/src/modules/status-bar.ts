// Vue half of StatusBar, the props stack and statics live in the engine. It renders nothing, keeps
// one stack entry through `watchEffect` and releases it on unmount

import {
  defineComponent,
  onUnmounted,
  watchEffect,
  type SetupContext,
} from '@vue/runtime-core';
import {
  createStatusBarEntry,
  statusBarImperative,
  statusBarCurrentHeight,
  isOpaqueColorValue,
  type IColorValue,
  type IStatusBarAnimation,
  type IStatusBarProps,
  type IStatusBarStyle,
} from '@symbiote-native/engine';
export type { IStatusBarProps, IStatusBarStyle } from '@symbiote-native/engine';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

const TRANSITIONS = [
  'none',
  'fade',
  'slide',
] as const satisfies readonly IStatusBarAnimation[];

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asBarStyle(value: unknown): IStatusBarStyle | undefined {
  return value === 'default' ||
    value === 'light-content' ||
    value === 'dark-content'
    ? value
    : undefined;
}

function asTransition(value: unknown): IStatusBarAnimation | undefined {
  return TRANSITIONS.find(transition => transition === value);
}

function asColorValue(value: unknown): IColorValue | undefined {
  if (typeof value === 'string') return value;
  if (isOpaqueColorValue(value)) return value;
  return undefined;
}

function buildProps(attrs: Record<string, unknown>): IStatusBarProps {
  return {
    barStyle: asBarStyle(attrs.barStyle),
    hidden: asBoolean(attrs.hidden),
    animated: asBoolean(attrs.animated),
    showHideTransition: asTransition(attrs.showHideTransition),
    networkActivityIndicatorVisible: asBoolean(
      attrs.networkActivityIndicatorVisible,
    ),
    backgroundColor: asColorValue(attrs.backgroundColor),
    translucent: asBoolean(attrs.translucent),
  };
}

const StatusBarComponent = defineComponent({
  name: 'StatusBar',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs }: SetupContext) {
    const entry = createStatusBarEntry();
    // `rawAttrs` is reactive, so every prop change replaces this entry
    watchEffect(() => {
      entry.apply(buildProps(normalizeVueAttrs(rawAttrs)));
    });
    // Popping restores what the stack held below this entry
    onUnmounted(() => entry.release());
    return () => null;
  },
});

const StatusBarWithStatics = Object.assign(
  StatusBarComponent,
  statusBarImperative,
);

// A getter, not a value, so nothing touches native at import time
Object.defineProperty(StatusBarWithStatics, 'currentHeight', {
  get: statusBarCurrentHeight,
  enumerable: true,
});

// `currentHeight` is optional, so the accessor need not appear on the inferred type (no cast)
export const StatusBar: typeof StatusBarWithStatics & {
  readonly currentHeight?: number;
} = StatusBarWithStatics;
