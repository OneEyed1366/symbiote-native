// Svelte twin of `../react`'s `usePreventScreenCapture`: prevents on mount, allows on unmount

import { allowScreenCaptureAsync, preventScreenCaptureAsync } from '../core';

export function usePreventScreenCapture(key: string = 'default'): void {
  $effect(() => {
    preventScreenCaptureAsync(key);
    return () => {
      allowScreenCaptureAsync(key);
    };
  });
}
