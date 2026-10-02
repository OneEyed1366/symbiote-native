// Svelte twin of `../react`'s `useScreenshotListener`: subscribes on mount, unsubscribes on
// unmount

import { addScreenshotListener } from '../core';

export function useScreenshotListener(listener: () => void): void {
  $effect(() => {
    const subscription = addScreenshotListener(listener);
    return () => {
      subscription.remove();
    };
  });
}
