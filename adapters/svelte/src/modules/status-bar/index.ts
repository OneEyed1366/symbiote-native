// StatusBar statics (setHidden/setBarStyle/setNetworkActivityIndicatorVisible/
// setBackgroundColor/setTranslucent + the Android-only currentHeight getter) attach onto the
// component value, mirroring RN's `StatusBar.setHidden` static surface — shared verbatim via
// @symbiote-native/engine's statusBarImperative, the same source React's and Vue's StatusBar
// use. A `.svelte` file's own module type resolves through svelte's ambient
// `declare module '*.svelte'` fallback (a bare value export), so the statics are attached here
// in a plain sibling `.ts` file rather than inside `index.svelte` itself — same pattern as
// components/image/index.ts.
import StatusBarComponent from './index.svelte';
import {
  statusBarImperative,
  statusBarCurrentHeight,
} from '@symbiote-native/engine';
export type { IStatusBarProps, IStatusBarStyle } from '@symbiote-native/engine';

const StatusBarWithStatics = Object.assign(
  StatusBarComponent,
  statusBarImperative,
);

// Android exposes the bar height as a native constant; undefined on iOS / when absent. Read
// lazily (getter) so nothing touches native at import time; the Android engine impl resolves
// on access.
Object.defineProperty(StatusBarWithStatics, 'currentHeight', {
  get: statusBarCurrentHeight,
  enumerable: true,
});

// currentHeight is optional, so the defineProperty-added accessor doesn't need to appear on
// the runtime object's inferred type for this assignment to hold (no cast).
export const StatusBar: typeof StatusBarWithStatics & {
  readonly currentHeight?: number;
} = StatusBarWithStatics;
