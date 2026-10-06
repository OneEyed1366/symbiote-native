import { describe, expect, it, vi } from 'vitest';
import { createImageLoader } from './image-loader';
import type { IImageLoadOptions } from './types';

type IFakeImage = { release: () => void };

type IDeferred = {
  promise: Promise<IFakeImage>;
  resolve(image: IFakeImage): void;
  reject(error: Error): void;
};

function deferred(): IDeferred {
  let resolve: IDeferred['resolve'] = () => undefined;
  let reject: IDeferred['reject'] = () => undefined;
  const promise = new Promise<IFakeImage>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeImage(): IFakeImage {
  return { release: vi.fn() };
}

function setup(options: IImageLoadOptions = {}) {
  const pending: IDeferred[] = [];
  const load = vi.fn(() => {
    const next = deferred();
    pending.push(next);
    return next.promise;
  });
  const images: IFakeImage[] = [];
  const loader = createImageLoader<IFakeImage>({
    load,
    onImage: image => images.push(image),
    getOptions: () => options,
  });
  return { loader, pending, images, load };
}

async function settle(item: IDeferred | undefined): Promise<void> {
  await item?.promise.catch(() => undefined);
  await Promise.resolve();
}

describe('createImageLoader', () => {
  it('hands over the image once it has loaded', async () => {
    const { loader, pending, images } = setup();
    const image = fakeImage();

    loader.load('a');
    pending[0]?.resolve(image);
    await settle(pending[0]);

    expect(images).toEqual([image]);
  });

  it('drops a result that arrives after `cancel`', async () => {
    const { loader, pending, images } = setup();

    loader.load('a');
    loader.cancel();
    pending[0]?.resolve(fakeImage());
    await settle(pending[0]);

    expect(images).toEqual([]);
  });

  it('releases the loaded image when a newer load starts', async () => {
    const { loader, pending } = setup();
    const first = fakeImage();

    loader.load('a');
    pending[0]?.resolve(first);
    await settle(pending[0]);
    loader.load('b');

    expect(first.release).toHaveBeenCalledTimes(1);
  });

  it('gives a failure to `onError` with a retry that loads again', async () => {
    const onError = vi.fn();
    const { loader, pending, load } = setup({ onError });

    loader.load('a');
    pending[0]?.reject(new Error('boom'));
    await settle(pending[0]);

    expect(onError).toHaveBeenCalledTimes(1);
    onError.mock.calls[0]?.[1]();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('prints a failure when there is no `onError`', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { loader, pending } = setup();

    loader.load('a');
    pending[0]?.reject(new Error('boom'));
    await settle(pending[0]);

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
