import { createEffect, createSignal, on, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { createImageRefLoader, resolveSource } from '../core';
import type { IImageLoadOptions, IImageSource, ImageRef } from '../core';

/**
 * Solid twin of `expo-image`'s `useImage`, `null` until the first image has loaded
 *
 * It loads again when the uri of the source or a `dependencies` accessor changes
 */
export function useImage(
  source: Accessor<IImageSource | string | number>,
  options: Accessor<IImageLoadOptions> = () => ({}),
  dependencies: Accessor<unknown>[] = [],
): Accessor<ImageRef | null> {
  const [image, setImage] = createSignal<ImageRef | null>(null);

  createEffect(
    on(
      () => [resolveSource(source())?.uri, ...dependencies.map(read => read())],
      () => {
        const loader = createImageRefLoader(setImage, options);
        loader.load(source());
        onCleanup(loader.cancel);
      },
    ),
  );

  return image;
}
