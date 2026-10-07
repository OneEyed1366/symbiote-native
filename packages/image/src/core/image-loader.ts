import type { IImageLoadOptions, IImageSource } from './types';

export type IImageLoaderConfig<TImage extends { release(): void }> = {
  load(
    source: IImageSource | string | number,
    options: IImageLoadOptions,
  ): Promise<TImage>;
  /** Called with each image that finished loading */
  onImage(image: TImage): void;
  /** Read at the time of a failure, so the latest callback wins */
  getOptions(): IImageLoadOptions;
};

export type IImageLoader = {
  /** Starts a load and drops the result of the one before */
  load(source: IImageSource | string | number): void;
  /** Drops a load in flight and releases the image loaded last */
  cancel(): void;
};

/** What a `useImage` hook drives with its own lifecycle */
export function createImageLoader<TImage extends { release(): void }>(
  config: IImageLoaderConfig<TImage>,
): IImageLoader {
  let token = 0;
  let loaded: TImage | null = null;

  function release(): void {
    loaded?.release();
    loaded = null;
  }

  function fail(
    source: IImageSource | string | number,
    error: unknown,
    retry: () => void,
  ): void {
    const { onError } = config.getOptions();
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)), retry);
      return;
    }
    console.error(
      `Loading an image from '${JSON.stringify(source)}' failed, use 'onError' to handle errors`,
    );
    console.error(error);
  }

  function load(source: IImageSource | string | number): void {
    release();
    token += 1;
    const mine = token;
    config
      .load(source, config.getOptions())
      .then(image => {
        if (mine !== token) return;
        loaded = image;
        config.onImage(image);
      })
      .catch((error: unknown) => {
        if (mine === token) fail(source, error, () => load(source));
      });
  }

  return {
    load,
    cancel: () => {
      token += 1;
      release();
    },
  };
}
