// Vue lifecycle wiring over the framework-agnostic HideAnimationController + style
// computation (core/). A composable's setup body runs ONCE (unlike a React hook, which
// re-runs every render), so this takes a config GETTER, not a plain value — Vue's
// reactivity tracks whatever reactive refs the getter reads and re-runs the
// watchEffect/computed below on their change, mirroring a React consumer passing a fresh
// config object every render.
//
// The controller is a plain local, not a Vue ref: only its methods are called, so wrapping
// it would only add an unnecessary reactive Proxy — same identity discipline as
// `use-color-scheme.ts`'s subscription handle. It also carries the native constants, read once in
// its constructor — so a missing RNBootSplash throws straight out of setup, on purpose.
import { computed, watchEffect, type ComputedRef } from '@vue/runtime-core';
import {
  computeHideAnimationStyles,
  HideAnimationController,
  type IHideAnimationConfig,
  type IHideAnimationResult,
} from '../../../core';

export function useHideAnimation(
  getConfig: () => IHideAnimationConfig,
): ComputedRef<IHideAnimationResult> {
  const controller = new HideAnimationController(getConfig());

  watchEffect(() => {
    controller.updateConfig(getConfig());
  });

  return computed(() =>
    computeHideAnimationStyles(getConfig(), controller.constants, controller),
  );
}
