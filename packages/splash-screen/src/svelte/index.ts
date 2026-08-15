// @symbiote-native/splash-screen/svelte: the Svelte entry over the framework-agnostic core.
// hide/isVisible carry zero lifecycle and are re-exported verbatim; useHideAnimation wraps
// HideAnimationController + computeHideAnimationStyles with Svelte's own runes
// (runes/use-hide-animation.svelte.ts) — mirrors the lifecycle-bucket naming convention of
// adapters/svelte/src/runes (never `hooks`/`composables`, those are React's/Vue's terms).

export { hide, isVisible } from '../core';
export { useHideAnimation } from './runes/use-hide-animation.svelte';
export type { IHideAnimationConfig, IHideAnimationResult, IManifest, IHideConfig } from '../core';
