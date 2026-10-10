// Solid half of StatusBar, the props stack and statics live in the engine. It renders no Fabric
// view, applies its props to one stack entry from a `createEffect` and releases it on cleanup
// FLAT, one file covers both hosts since there is no per-platform dependency array

import { createEffect, onCleanup } from 'solid-js';
import {
  createStatusBarEntry,
  statusBarImperative,
  statusBarCurrentHeight,
  type IStatusBarProps,
} from '@symbiote-native/engine';
export type {
  IStatusBarProps,
  IStatusBarStyle,
  IStatusBarAnimation,
} from '@symbiote-native/engine';

// Renders null: StatusBar owns no host node, it drives a native module
function StatusBarComponent(props: IStatusBarProps): null {
  const entry = createStatusBarEntry();
  createEffect(() => {
    // Every field is read here, so the effect depends on the whole prop surface
    entry.apply({
      barStyle: props.barStyle,
      hidden: props.hidden,
      animated: props.animated,
      showHideTransition: props.showHideTransition,
      networkActivityIndicatorVisible: props.networkActivityIndicatorVisible,
      backgroundColor: props.backgroundColor,
      translucent: props.translucent,
    });
  });
  // Popping restores what the stack held below this entry
  onCleanup(() => entry.release());

  return null;
}

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
