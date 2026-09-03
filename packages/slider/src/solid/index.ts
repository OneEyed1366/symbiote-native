// @symbiote-native/slider/solid: the Solid wrapper over the @react-native-community/slider native
// view. The bare import below is FIRST and is a side effect, not a re-export: it registers the
// native view's ViewConfig (the codegen spec, never the library's React component) before any
// Slider can mount. Metro's production-only `inlineRequires` moves a require down to the first
// place its binding is USED and compiles a barrel's re-export into a lazy getter, so a registration
// reached through one silently never runs in RELEASE builds only. Do not restructure it.

import '../register';

export { Slider } from './slider';
export type { ISliderProps, ISliderStepMarker } from './slider';
export type { IStepMarkerProps } from '../core';
