import { useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';
import { createImageRefLoader, resolveSource } from '../core';
import type { IImageLoadOptions, IImageSource, ImageRef } from '../core';

/**
 * Loads an image into a native `ImageRef`, `null` until the first one has loaded
 *
 * It loads again when the uri of the source or an item of `dependencies` changes
 */
export function useImage(
  source: IImageSource | string | number,
  options: IImageLoadOptions = {},
  dependencies: DependencyList = [],
): ImageRef | null {
  const [image, setImage] = useState<ImageRef | null>(null);
  // The effect reads the options of the latest render, not the ones it started with
  const latestOptions = useRef(options);
  latestOptions.current = options;
  const key = resolveSource(source)?.uri;

  useEffect(() => {
    const loader = createImageRefLoader(setImage, () => latestOptions.current);
    loader.load(source);
    return loader.cancel;
  }, [key, ...dependencies]);

  return image;
}
