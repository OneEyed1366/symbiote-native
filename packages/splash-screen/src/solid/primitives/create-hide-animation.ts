// Solid lifecycle wiring over the framework-agnostic HideAnimationController + style computation
// (core/) — the Solid twin of React's useHideAnimation hook, Vue's composable and Svelte's rune.
//
// `primitives/` and `create*`, never `hooks/`+`use*`: Solid's ecosystem calls a composable
// reactive function a PRIMITIVE and reserves `use*` for consuming something that already exists.
// Full rationale in adapters/solid/src/primitives/create-color-scheme.ts.
//
// Takes a config ACCESSOR, not a plain value, and returns one: a Solid component body runs ONCE
// (like Vue's setup, unlike a React hook re-running every render), so a plain config would freeze
// at its boot value and `ready` flipping true would never be seen. The effect below re-syncs the
// controller on every signal the accessor reads, mirroring Vue's watchEffect.
//
// The controller stays a plain local, never a signal: only its methods are called. It also carries
// the native constants, read once in its constructor — so a missing RNBootSplash throws straight
// out of the primitive body, on purpose.

import { createEffect, createMemo, type Accessor } from 'solid-js';
import {
  computeHideAnimationStyles,
  HideAnimationController,
  type IHideAnimationConfig,
  type IHideAnimationResult,
} from '../../core';

export function createHideAnimation(
  config: Accessor<IHideAnimationConfig>,
): Accessor<IHideAnimationResult> {
  const controller = new HideAnimationController(config());

  createEffect(() => {
    controller.updateConfig(config());
  });

  return createMemo(() =>
    computeHideAnimationStyles(config(), controller.constants, controller),
  );
}
