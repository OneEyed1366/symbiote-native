// Solid twin of `../../react`'s `useScreenshotListener`: subscribes synchronously in the
// primitive body, unsubscribes on `onCleanup`

import { onCleanup } from 'solid-js';
import { addScreenshotListener } from '../../core';

export function createScreenshotListener(listener: () => void): void {
  const subscription = addScreenshotListener(listener);

  onCleanup(() => {
    subscription.remove();
  });
}
