// Svelte lifecycle wiring over the framework-agnostic HideAnimationController + style
// computation (core/) — mirrors the lifecycle-bucket naming convention of
// adapters/svelte/src/runes (`runes/`, Svelte's own term, never `hooks`/`composables`).
//
// A Svelte component's `<script>` body runs ONCE (like Vue's setup, unlike a React hook
// re-running every render), so this takes a config GETTER, not a plain value — the boxed-
// getter convention established in adapters/svelte/src/runes/use-color-scheme.svelte.ts.
// The controller is a plain local (not `$state`): only its methods are called, nothing needs
// Svelte to react to the controller reference itself — same identity discipline as Vue's
// composable. `$effect` re-syncs the controller's config on every reactive read inside
// `getConfig()`, mirroring Vue's `watchEffect`.
import {
  computeHideAnimationStyles,
  getHideAnimationConstants,
  HideAnimationController,
  type IHideAnimationConfig,
  type IHideAnimationConstants,
  type IHideAnimationResult,
} from '../../core';

export function useHideAnimation(getConfig: () => IHideAnimationConfig): {
  readonly current: IHideAnimationResult;
} {
  const controller = new HideAnimationController(getConfig());
  const constants: IHideAnimationConstants = getHideAnimationConstants();

  let result = $state<IHideAnimationResult>(
    computeHideAnimationStyles(getConfig(), constants, controller),
  );

  $effect(() => {
    const config = getConfig();
    controller.updateConfig(config);
    result = computeHideAnimationStyles(config, constants, controller);
  });

  return {
    get current(): IHideAnimationResult {
      return result;
    },
  };
}
