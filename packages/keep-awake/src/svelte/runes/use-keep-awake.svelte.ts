// Svelte lifecycle wiring over the framework-agnostic core (core/keep-awake.ts) — activates on
// mount, deactivates on unmount, mirroring React's useKeepAwake hook and Vue's composable.
//
// `.svelte.ts` (not `.ts`): $effect is only usable in a file with this extension outside an actual
// `.svelte` component. `runes/` is Svelte's own term for the bucket React calls `hooks/` and Vue
// calls `composables/` — see adapters/svelte/src/runes.
//
// Vue's onMounted/onUnmounted pair collapses into ONE `$effect` whose returned function is the
// teardown. Nothing reactive is read inside it, so its dependency set is empty and it runs exactly
// once per mount — the same once-per-mount contract Vue's composable has, and unlike React's hook,
// which re-runs its effect whenever `tagOrDefault` changes.
//
// `tag`/`options` are plain values, NOT getters: a Svelte component's `<script>` body runs once
// (like Vue's setup), and the Vue composable this mirrors also takes them by value and never
// re-subscribes on change. A config getter would be a different public API than every other
// adapter's, for reactivity nothing here consumes.
//
// Svelte has no useId equivalent, so — exactly like Vue's composable — the default tag comes from
// a small monotonically-incrementing module-local counter, giving each call its own tag when the
// caller doesn't supply one.
import {
  activateKeepAwakeAsync,
  addListener,
  deactivateKeepAwake,
  type KeepAwakeOptions,
} from '../../core';

let tagCounter = 0;

export function useKeepAwake(tag?: string, options?: KeepAwakeOptions): void {
  const tagOrDefault = tag ?? `keep-awake-tag-${++tagCounter}`;

  $effect(() => {
    activateKeepAwakeAsync(tagOrDefault)
      .then(() => {
        if (options?.listener) {
          addListener(tagOrDefault, options.listener);
        }
      })
      .catch(() => {});

    return () => {
      if (options?.suppressDeactivateWarnings) {
        deactivateKeepAwake(tagOrDefault).catch(() => {});
      } else {
        deactivateKeepAwake(tagOrDefault);
      }
    };
  });
}
