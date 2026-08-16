// Svelte lifecycle wiring over the framework-agnostic core (core/keep-awake.ts): activates on
// mount, deactivates on unmount, mirroring React's hook and Vue's composable.
//
// `.svelte.ts` extension: `$effect` only works there outside a `.svelte` component. `runes/` is
// Svelte's name for what React calls `hooks/` and Vue calls `composables/`.
//
// The effect reads no reactive state, so it fires once per mount (its return value is the
// teardown) - same once-per-mount contract as Vue's composable, unlike React's hook, which
// re-runs when `tagOrDefault` changes.
//
// `tag`/`options` are plain values, not getters, because the `<script>` body (like Vue's setup)
// runs once - nothing here re-reads them.
//
// No `useId` in Svelte, so the default tag comes from a module-local counter, as in Vue's
// composable.
import { activateKeepAwakeAsync, deactivateKeepAwake, type KeepAwakeOptions } from '../../core';
import { createKeepAwakeListenerAttachment } from '../../core/listener-attachment';

let tagCounter = 0;

export function useKeepAwake(tag?: string, options?: KeepAwakeOptions): void {
  const tagOrDefault = tag ?? `keep-awake-tag-${++tagCounter}`;

  $effect(() => {
    // Inside the effect, so the attachment shares the teardown returned below.
    const attachment = createKeepAwakeListenerAttachment(tagOrDefault, options?.listener);

    activateKeepAwakeAsync(tagOrDefault)
      .then(() => attachment.attach())
      .catch(() => {});

    return () => {
      attachment.release();
      if (options?.suppressDeactivateWarnings) {
        deactivateKeepAwake(tagOrDefault).catch(() => {});
      } else {
        deactivateKeepAwake(tagOrDefault);
      }
    };
  });
}
