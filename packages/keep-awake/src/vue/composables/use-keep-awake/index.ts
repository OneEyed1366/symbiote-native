// Vue lifecycle wiring over the framework-agnostic core (core/keep-awake.ts) — activates on
// mount, deactivates on unmount, mirroring React's useKeepAwake hook. Vue has no useId
// equivalent, so the default tag comes from a small monotonically-incrementing module-local
// counter instead — simplest robust way to give each composable instance its own tag when the
// caller doesn't supply one.
import { onMounted, onUnmounted } from '@vue/runtime-core';
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
  type KeepAwakeOptions,
} from '../../../core';
import { createKeepAwakeListenerAttachment } from '../../../core/listener-attachment';

let tagCounter = 0;

export function useKeepAwake(tag?: string, options?: KeepAwakeOptions): void {
  const tagOrDefault = tag ?? `keep-awake-tag-${++tagCounter}`;
  // Setup body scope: it runs once per instance, so one attachment spans the single
  // onMounted/onUnmounted pair - no need to re-create it on the mount hook.
  const attachment = createKeepAwakeListenerAttachment(
    tagOrDefault,
    options?.listener,
  );

  onMounted(() => {
    activateKeepAwakeAsync(tagOrDefault)
      .then(() => attachment.attach())
      .catch(() => {});
  });

  onUnmounted(() => {
    attachment.release();
    if (options?.suppressDeactivateWarnings) {
      deactivateKeepAwake(tagOrDefault).catch(() => {});
    } else {
      deactivateKeepAwake(tagOrDefault);
    }
  });
}
