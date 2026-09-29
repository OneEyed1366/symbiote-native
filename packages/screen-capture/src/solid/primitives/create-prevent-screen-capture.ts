// Solid twin of `../../react`'s `usePreventScreenCapture`: prevents synchronously in the
// primitive body, allows on `onCleanup` - same "nothing can interleave" reasoning as
// `create-keep-awake.ts` (`@symbiote-native/keep-awake`)

import { onCleanup } from 'solid-js';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from '../../core';

export function createPreventScreenCapture(key: string = 'default'): void {
  preventScreenCaptureAsync(key);

  onCleanup(() => {
    allowScreenCaptureAsync(key);
  });
}
