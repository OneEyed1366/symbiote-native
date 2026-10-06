import { describe, expect, it, vi } from 'vitest';

const loadImageAsync = vi.hoisted(() => vi.fn());

vi.mock('./image-api', () => ({ loadImageAsync }));

const { createImageRefLoader } = await import('./image-ref-loader');

describe('createImageRefLoader', () => {
  it('loads through the native module with the latest options', async () => {
    const image = { release: vi.fn() };
    loadImageAsync.mockResolvedValue(image);
    const received: unknown[] = [];
    let options = { maxWidth: 10 };
    const loader = createImageRefLoader(
      loaded => received.push(loaded),
      () => options,
    );

    options = { maxWidth: 20 };
    loader.load('https://x/a.png');
    await Promise.resolve();
    await Promise.resolve();

    expect(loadImageAsync).toHaveBeenCalledWith('https://x/a.png', {
      maxWidth: 20,
    });
    expect(received).toEqual([image]);
  });
});
