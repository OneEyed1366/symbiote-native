import { computed, effect, signal, untracked } from '@angular/core';
import type { Signal } from '@angular/core';
import { createImageRefLoader, resolveSource } from '../core';
import type { IImageLoadOptions, IImageSource, ImageRef } from '../core';

/**
 * Angular twin of `useImage`, `null` until the first image has loaded
 *
 * It loads again when the uri of the source or a signal read by `dependencies` changes
 */
export function injectImage(
  source: () => IImageSource | string | number,
  options: () => IImageLoadOptions = () => ({}),
  dependencies: () => unknown[] = () => [],
): Signal<ImageRef | null> {
  const image = signal<ImageRef | null>(null);
  const key = computed(() => resolveSource(source())?.uri);

  effect(onCleanup => {
    // Read so the effect tracks them, the source itself is not a trigger
    key();
    dependencies();
    const loader = createImageRefLoader(loaded => image.set(loaded), options);
    untracked(() => loader.load(source()));
    onCleanup(loader.cancel);
  });

  return image.asReadonly();
}
