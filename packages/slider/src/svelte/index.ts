// @symbiote-native/slider/svelte: the Svelte wrapper over the @react-native-community/slider
// native view. Importing this barrel first registers the native view's ViewConfig (../register,
// a side-effect import of the codegen spec — never the library's React component), then exposes
// the Slider component. Mirrors packages/slider/src/vue/index.ts exactly, except the platform
// split lives one level down (slider/slider-platform.ts, Metro-filename-selected — see that
// file's header), matching adapters/svelte's own Switch/ActivityIndicator convention rather than
// Vue's per-platform `createSlider(platform)` factory: Svelte components are compiled `.svelte`
// files, not factories, so there is no per-platform component to construct.

import '../register';

export { default as Slider } from './slider/index.svelte';
export type { ISliderProps } from './slider/slider-props';
