// Adapts `createManipulatorContextController`'s `.release()`-shaped controller to the
// `resolve`/`flushDispose`/`dispose` shape every adapter's `createResourceHook` expects

import {
  createManipulatorContextController,
  type IReleasableContext,
} from './manipulator-context-controller';
import { manipulate } from './index';
import type { IImageManipulatorContext, IImageRef } from './index';

function createManipulatorResourceController<
  TSource,
  TContext extends IReleasableContext,
>(
  manipulateSource: (source: TSource) => TContext,
): {
  resolve: (source: TSource) => TContext;
  flushDispose: () => void;
  dispose: () => void;
} {
  const controller = createManipulatorContextController(manipulateSource);
  return {
    resolve: controller.resolve,
    flushDispose: controller.flushRelease,
    dispose: controller.release,
  };
}

// Bakes in this package's own `manipulate`, so every adapter's `createResourceHook` binds a
// plain zero-arg factory instead of repeating the same arrow wrapper five times
export function createImageManipulatorResourceController(): {
  resolve: (source: string | IImageRef) => IImageManipulatorContext;
  flushDispose: () => void;
  dispose: () => void;
} {
  return createManipulatorResourceController<
    string | IImageRef,
    IImageManipulatorContext
  >(manipulate);
}
