// StatusBar — the Solid lifecycle half, and nothing else. The native StatusBarManager driving
// (applyStatusBarProps), the imperative statics (statusBarImperative) and the Android bar-height
// constant all live in @symbiote-native/engine, shared verbatim with React / Vue / Svelte /
// Angular; Metro selects the engine's index.ios.ts / index.android.ts per host, so the platform
// divergence never reaches this file. Solid supplies only the declarative shape: a component that
// renders no Fabric view and re-applies its props from a `createEffect` on mount and on every
// prop change.
//
// FLAT, not a folder: the file-layout rule gives a module its own folder only for real
// `.ios`/`.android`/`-shared` variants. React needs two files because its useEffect dep array is
// written by hand per platform; there is no dep array here, so one file covers both hosts —
// the same shape Svelte's and Angular's StatusBar landed on.
//
// Simplification vs RN, inherited from every other adapter: RN keeps a prop-merge stack so nested
// StatusBars compose (deepest wins); this direct-applies one component's props.

import { createEffect } from 'solid-js';
import {
  applyStatusBarProps,
  statusBarImperative,
  statusBarCurrentHeight,
  type IStatusBarProps,
} from '@symbiote-native/engine';
export type {
  IStatusBarProps,
  IStatusBarStyle,
  IStatusBarAnimation,
} from '@symbiote-native/engine';

// Renders null: StatusBar owns no host node, it drives a native module.
function StatusBarComponent(props: IStatusBarProps): null {
  createEffect(() => {
    // Every field is read HERE, not inside the engine, so the effect's dependency set is the whole
    // prop surface rather than whichever subset this platform's impl happens to destructure —
    // iOS's applyStatusBarProps never touches backgroundColor/translucent, and a props proxy read
    // only there would silently stop re-applying after a host swap.
    applyStatusBarProps({
      barStyle: props.barStyle,
      hidden: props.hidden,
      animated: props.animated,
      networkActivityIndicatorVisible: props.networkActivityIndicatorVisible,
      backgroundColor: props.backgroundColor,
      translucent: props.translucent,
    });
  });

  return null;
}

const StatusBarWithStatics = Object.assign(
  StatusBarComponent,
  statusBarImperative,
);

// Android exposes the bar height as a native constant; undefined on iOS / when absent. A getter,
// not a value, so nothing touches native at import time.
Object.defineProperty(StatusBarWithStatics, 'currentHeight', {
  get: statusBarCurrentHeight,
  enumerable: true,
});

// currentHeight is optional, so the defineProperty-added accessor need not appear on the runtime
// object's inferred type for this assignment to hold (no cast) — same shape as Svelte's.
export const StatusBar: typeof StatusBarWithStatics & {
  readonly currentHeight?: number;
} = StatusBarWithStatics;
