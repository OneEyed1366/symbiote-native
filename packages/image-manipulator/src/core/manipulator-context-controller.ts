// Thin binding of `@symbiote-native/engine`'s generic `createResourceController` to this
// package's own `.release()`-shaped context, kept for its own descriptive type names

import { createResourceController } from '@symbiote-native/engine';

export type IReleasableContext = { release: () => void };

export type IManipulatorContextController<
  TSource,
  TContext extends IReleasableContext,
> = {
  resolve: (source: TSource) => TContext;
  flushRelease: () => void;
  release: () => void;
};

export function createManipulatorContextController<
  TSource,
  TContext extends IReleasableContext,
>(
  manipulate: (source: TSource) => TContext,
): IManipulatorContextController<TSource, TContext> {
  const controller = createResourceController<TSource, TContext>(
    manipulate,
    context => {
      context.release();
    },
  );
  return {
    resolve: controller.resolve,
    flushRelease: controller.flushDispose,
    release: controller.dispose,
  };
}
