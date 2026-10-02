// Angular twin of `useImageManipulator`, `injectX` shape matching
// `@symbiote-native/navigation`'s `injectLinkingIntegration`

import type { Signal } from '@angular/core';
import { createResourceHook } from '@symbiote-native/angular';
import type { IImageManipulatorContext, IImageRef } from '../core';
import { createImageManipulatorResourceController } from '../core/manipulator-resource-controller';

const injectManipulatorResource = createResourceHook(
  createImageManipulatorResourceController,
);

export function injectImageManipulator(
  source: () => string | IImageRef,
): Signal<IImageManipulatorContext> {
  return injectManipulatorResource(() => [source()]);
}
