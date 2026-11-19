// RN's `RootTagContext` for Angular: `mount` provides the surface tag, 0 outside any surface

import { InjectionToken, inject } from '@angular/core';
import type { IRootTag } from '@symbiote-native/engine';

const NO_SURFACE = 0;

export const ROOT_TAG = new InjectionToken<IRootTag>('symbiote.rootTag', {
  factory: () => NO_SURFACE,
});

export function injectRootTag(): IRootTag {
  return inject(ROOT_TAG);
}
