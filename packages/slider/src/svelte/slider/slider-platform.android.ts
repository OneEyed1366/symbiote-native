// Slider on Android: the native view sizes itself (no default height), lays out implicit steps
// at 128-point resolution, and keeps the step row at the top. Mirrors
// packages/slider/src/vue/slider/index.android.ts exactly, one level down (platform CONSTANT
// here — see index.svelte's header).
import { SLIDER_STEP_RESOLUTION_ANDROID } from '../../core';
import type { ISliderPlatform } from '../../core';

const ANDROID_STEPS_CONTAINER_TOP = 0;

export const PLATFORM: ISliderPlatform = {
  defaultStyle: {},
  stepResolution: SLIDER_STEP_RESOLUTION_ANDROID,
  stepsContainerTop: ANDROID_STEPS_CONTAINER_TOP,
};
