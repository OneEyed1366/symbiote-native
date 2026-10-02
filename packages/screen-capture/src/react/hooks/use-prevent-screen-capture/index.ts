// React lifecycle wiring over the framework-agnostic core (core/screen-capture.ts): prevents on
// mount, allows on unmount, mirroring upstream's `usePreventScreenCapture`

import { useEffect } from 'react';
import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from '../../../core';

export function usePreventScreenCapture(key: string = 'default'): void {
  useEffect(() => {
    preventScreenCaptureAsync(key);
    return () => {
      allowScreenCaptureAsync(key);
    };
  }, [key]);
}
