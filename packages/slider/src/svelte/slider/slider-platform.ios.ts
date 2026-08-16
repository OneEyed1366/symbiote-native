// Slider on iOS: the native view has an intrinsic 40pt height (the wrapper applies it as the
// default), lays out implicit steps at 1000-point resolution, and nudges the step row down 10pt.
// Also the base (./slider-platform re-exports it) for headless. Mirrors
// packages/slider/src/vue/slider/index.ios.ts exactly, one level down (platform CONSTANT here,
// not a per-platform component — see index.svelte's header).
import { SLIDER_IOS_DEFAULT_HEIGHT, SLIDER_STEP_RESOLUTION_IOS } from '../../core';
import type { ISliderPlatform } from '../../core';

const IOS_STEPS_CONTAINER_TOP = 10;

export const PLATFORM: ISliderPlatform = {
  defaultStyle: { height: SLIDER_IOS_DEFAULT_HEIGHT },
  stepResolution: SLIDER_STEP_RESOLUTION_IOS,
  stepsContainerTop: IOS_STEPS_CONTAINER_TOP,
};
