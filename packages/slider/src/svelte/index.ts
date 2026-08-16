// @symbiote-native/slider/svelte: Svelte wrapper over the @react-native-community/slider native
// view. Importing this barrel first registers the native view's ViewConfig (../register, a
// side-effect import of the codegen spec, never the library's React component), then exposes
// Slider. Mirrors vue/index.ts, except the platform split lives one level down
// (slider/slider-platform.ts, Metro-filename-selected) - matching this adapter's own
// Switch/ActivityIndicator convention, since Svelte components are compiled `.svelte` files, not
// factories like Vue's per-platform `createSlider(platform)`.

import '../register';

export { default as Slider } from './slider/index.svelte';
export type { ISliderProps } from './slider/slider-props';
