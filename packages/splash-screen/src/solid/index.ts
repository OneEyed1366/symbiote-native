// @symbiote-native/splash-screen/solid: the Solid entry over the framework-agnostic core.
// hide/isVisible carry zero lifecycle and are re-exported verbatim; createHideAnimation wraps
// HideAnimationController + computeHideAnimationStyles with Solid's own reactivity
// (primitives/create-hide-animation.ts) — mirrors the lifecycle-bucket naming convention of
// adapters/solid/src/primitives (never `hooks`/`composables`/`runes`, those are React's, Vue's
// and Svelte's terms).

export { hide, isVisible } from '../core';
export { createHideAnimation } from './primitives/create-hide-animation';
export type {
  IHideAnimationConfig,
  IHideAnimationFailure,
  IHideAnimationFailureStage,
  IHideAnimationResult,
  IManifest,
  IHideConfig,
} from '../core';
