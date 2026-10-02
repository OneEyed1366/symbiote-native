// Vue lifecycle wiring over the framework-agnostic core (core/screen-capture.ts): prevents on
// mount, allows on unmount, mirroring React's `usePreventScreenCapture` hook

import { onMounted, onUnmounted } from '@vue/runtime-core';
import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from '../../../core';

export function usePreventScreenCapture(key: string = 'default'): void {
  onMounted(() => {
    preventScreenCaptureAsync(key);
  });

  onUnmounted(() => {
    allowScreenCaptureAsync(key);
  });
}
