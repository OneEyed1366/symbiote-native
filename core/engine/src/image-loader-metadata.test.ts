// RN `Image.prefetchWithMetadata`: iOS hands the query root to native, Android is `prefetch`
import { afterEach, describe, expect, it, vi } from 'vitest';

type ICalls = {
  withMetadata: unknown[][];
  plain: unknown[][];
};

function installLoader(hasMetadata: boolean): ICalls {
  const calls: ICalls = { withMetadata: [], plain: [] };
  const loader = {
    prefetchImage: (...args: unknown[]) => {
      calls.plain.push(args);
      return Promise.resolve(true);
    },
    ...(hasMetadata && {
      prefetchImageWithMetadata: (...args: unknown[]) => {
        calls.withMetadata.push(args);
        return Promise.resolve(true);
      },
    }),
  };
  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === 'ImageLoader' ? Object.assign(Object.create(null), loader) : null;
  return calls;
}

async function statics(os: 'ios' | 'android') {
  vi.resetModules();
  vi.doMock('./platform', () => ({ Platform: { OS: os } }));
  return (await import('./image-loader')).imageStatics;
}

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

describe('imageStatics.prefetchWithMetadata', () => {
  it('passes the query root and a zero root tag to native on iOS', async () => {
    const calls = installLoader(true);
    const image = await statics('ios');

    await image.prefetchWithMetadata('foo-bar.jpg', 'foo-queryRootName');

    expect(calls.withMetadata).toEqual([
      ['foo-bar.jpg', 'foo-queryRootName', 0],
    ]);
    expect(calls.plain).toEqual([]);
  });

  it('passes an explicit root tag through on iOS', async () => {
    const calls = installLoader(true);
    const image = await statics('ios');

    await image.prefetchWithMetadata('foo-bar.jpg', 'root', 7);

    expect(calls.withMetadata).toEqual([['foo-bar.jpg', 'root', 7]]);
  });

  it('falls back to the plain prefetch when native has no metadata call', async () => {
    const calls = installLoader(false);
    const image = await statics('ios');

    await image.prefetchWithMetadata('foo-bar.jpg', 'root');

    expect(calls.plain).toEqual([['foo-bar.jpg']]);
  });

  it('is prefetch on Android, with the request id reported', async () => {
    const calls = installLoader(true);
    const image = await statics('android');
    const ids: number[] = [];

    await image.prefetchWithMetadata('foo-bar.jpg', 'root', undefined, id =>
      ids.push(id),
    );

    expect(calls.withMetadata).toEqual([]);
    expect(calls.plain).toEqual([['foo-bar.jpg', ids[0]]]);
  });
});
