// Solid lifecycle wiring over the framework-agnostic core (core/keep-awake.ts): activates a
// keep-awake lock in the primitive body, deactivates it when the owner is disposed — the Solid
// twin of React's hook, Vue's composable, Svelte's rune and Angular's KeepAwakeService.connect().
//
// `primitives/` and `create*`, not `hooks/`/`use*`: Solid's ecosystem calls a composable reactive
// function a PRIMITIVE and reserves `use*` for consuming something that already exists. Full
// rationale in adapters/solid/src/primitives/create-color-scheme.ts's header.
//
// Activation runs SYNCHRONOUSLY in the body with `onCleanup` for teardown, not from a mount hook
// (React's useEffect, Vue's onMounted, Svelte's $effect) — the lock is requested one tick earlier,
// and nothing can interleave between construction and the request.
//
// Nothing reactive is returned: keeping the screen awake is a pure side effect for the owner's
// lifetime, so there is no accessor and the once-per-owner contract matches Vue/Svelte/Angular
// rather than React's hook, which re-runs when the tag changes.
//
// No `useId` in Solid, so the default tag comes from a module-local counter, as in Vue and Svelte.
//
// Outside a component / createRoot there is no owner for `onCleanup`, so the lock is never
// released — see create-color-scheme's header for the same documented caveat.
import { onCleanup } from 'solid-js';
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
  type KeepAwakeOptions,
} from '../../core';
import { createKeepAwakeListenerAttachment } from '../../core/listener-attachment';

let tagCounter = 0;

export function createKeepAwake(
  tag?: string,
  options?: KeepAwakeOptions,
): void {
  const tagOrDefault = tag ?? `keep-awake-tag-${++tagCounter}`;
  // One attachment per owner: the body runs once, so it spans the single activate/onCleanup pair.
  const attachment = createKeepAwakeListenerAttachment(
    tagOrDefault,
    options?.listener,
  );

  activateKeepAwakeAsync(tagOrDefault)
    .then(() => attachment.attach())
    .catch(() => {});

  onCleanup(() => {
    attachment.release();
    if (options?.suppressDeactivateWarnings) {
      deactivateKeepAwake(tagOrDefault).catch(() => {});
    } else {
      deactivateKeepAwake(tagOrDefault);
    }
  });
}
