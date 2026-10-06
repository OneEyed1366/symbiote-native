import { shallowRef, toValue, watch } from '@vue/runtime-core';
import type {
  MaybeRefOrGetter,
  ShallowRef,
  WatchSource,
} from '@vue/runtime-core';
import { createImageRefLoader, resolveSource } from '../core';
import type { IImageLoadOptions, IImageSource, ImageRef } from '../core';

/**
 * Vue twin of `expo-image`'s `useImage`, `null` until the first image has loaded
 *
 * It loads again when the uri of the source or a watched `dependencies` source changes
 */
export function useImage(
  source: MaybeRefOrGetter<IImageSource | string | number>,
  options: MaybeRefOrGetter<IImageLoadOptions> = {},
  dependencies: WatchSource[] = [],
): Readonly<ShallowRef<ImageRef | null>> {
  const image = shallowRef<ImageRef | null>(null);

  watch(
    [() => resolveSource(toValue(source))?.uri, ...dependencies],
    (_next, _previous, onCleanup) => {
      const loader = createImageRefLoader(
        loaded => {
          image.value = loaded;
        },
        () => toValue(options),
      );
      loader.load(toValue(source));
      onCleanup(loader.cancel);
    },
    { immediate: true },
  );

  return image;
}
