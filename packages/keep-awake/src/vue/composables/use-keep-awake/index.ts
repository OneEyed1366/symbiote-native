// Vue lifecycle wiring over the framework-agnostic core (core/keep-awake.ts) — activates on
// mount, deactivates on unmount, mirroring React's useKeepAwake hook. Vue has no useId
// equivalent, so the default tag comes from a small monotonically-incrementing module-local
// counter instead — simplest robust way to give each composable instance its own tag when the
// caller doesn't supply one.
import { onMounted, onUnmounted } from '@vue/runtime-core';
import {
  activateKeepAwakeAsync,
  addListener,
  deactivateKeepAwake,
  type KeepAwakeOptions,
} from '../../../core';

let tagCounter = 0;

export function useKeepAwake(tag?: string, options?: KeepAwakeOptions): void {
  const tagOrDefault = tag ?? `keep-awake-tag-${++tagCounter}`;

  onMounted(() => {
    activateKeepAwakeAsync(tagOrDefault)
      .then(() => {
        if (options?.listener) {
          addListener(tagOrDefault, options.listener);
        }
      })
      .catch(() => {});
  });

  onUnmounted(() => {
    if (options?.suppressDeactivateWarnings) {
      deactivateKeepAwake(tagOrDefault).catch(() => {});
    } else {
      deactivateKeepAwake(tagOrDefault);
    }
  });
}
