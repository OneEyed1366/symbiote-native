// Vue lifecycle wiring over the framework-agnostic core (core/screen-capture.ts): subscribes on
// mount, unsubscribes on unmount, mirroring React's `useScreenshotListener` hook

import { onMounted, onUnmounted } from '@vue/runtime-core';
import { addScreenshotListener } from '../../../core';
import type { EventSubscription } from '../../../core';

export function useScreenshotListener(listener: () => void): void {
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    subscription = addScreenshotListener(listener);
  });

  onUnmounted(() => {
    subscription?.remove();
  });
}
