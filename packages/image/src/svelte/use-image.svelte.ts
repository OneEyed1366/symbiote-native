import { untrack } from 'svelte';
import { createImageRefLoader, resolveSource } from '../core';
import type { IImageLoadOptions, IImageSource, ImageRef } from '../core';

export type IUseImageResult = {
  readonly current: ImageRef | null;
};

/**
 * Svelte twin of `expo-image`'s `useImage`, boxed getter shape of the other hooks
 *
 * It loads again when the uri of the source or a value read by `getDependencies` changes
 */
export function useImage(
  getSource: () => IImageSource | string | number,
  getOptions: () => IImageLoadOptions = () => ({}),
  getDependencies: () => unknown[] = () => [],
): IUseImageResult {
  let image = $state.raw<ImageRef | null>(null);
  const key = $derived(resolveSource(getSource())?.uri);

  $effect(() => {
    // Read so the effect tracks them, the source itself is not a trigger
    void key;
    getDependencies();
    const loader = createImageRefLoader(loaded => {
      image = loaded;
    }, getOptions);
    untrack(() => loader.load(getSource()));
    return loader.cancel;
  });

  return {
    get current(): ImageRef | null {
      return image;
    },
  };
}
