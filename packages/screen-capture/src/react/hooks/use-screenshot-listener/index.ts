// React lifecycle wiring over the framework-agnostic core (core/screen-capture.ts): subscribes
// on mount, unsubscribes on unmount, mirroring upstream's `useScreenshotListener`

import { useEffect } from 'react';
import { addScreenshotListener } from '../../../core';

export function useScreenshotListener(listener: () => void): void {
  useEffect(() => {
    const subscription = addScreenshotListener(listener);
    return () => {
      subscription.remove();
    };
  }, [listener]);
}
