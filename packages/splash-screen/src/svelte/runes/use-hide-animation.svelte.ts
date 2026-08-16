// Svelte lifecycle wiring over the framework-agnostic HideAnimationController + style
// computation (core/). A Svelte component's `<script>` body runs ONCE (like Vue's setup,
// unlike a React hook re-running every render), so this takes a config GETTER, not a plain
// value — the boxed-getter convention from use-color-scheme.svelte.ts. The controller stays
// a plain local, not `$state`: only its methods are called, nothing needs Svelte to react to
// the reference itself. `$effect` re-syncs the controller's config on every reactive read
// inside `getConfig()`, mirroring Vue's `watchEffect`. The controller also carries the native
// constants, read once in its constructor — so a missing RNBootSplash throws straight out of the
// component's script body, on purpose.
import {
  computeHideAnimationStyles,
  HideAnimationController,
  type IHideAnimationConfig,
  type IHideAnimationResult,
} from '../../core';

export function useHideAnimation(getConfig: () => IHideAnimationConfig): {
  readonly current: IHideAnimationResult;
} {
  const controller = new HideAnimationController(getConfig());

  let result = $state<IHideAnimationResult>(
    computeHideAnimationStyles(getConfig(), controller.constants, controller),
  );

  $effect(() => {
    const config = getConfig();
    controller.updateConfig(config);
    result = computeHideAnimationStyles(config, controller.constants, controller);
  });

  return {
    get current(): IHideAnimationResult {
      return result;
    },
  };
}
