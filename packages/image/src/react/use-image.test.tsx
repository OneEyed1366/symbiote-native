// React `useImage` over the shared loader

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const loadImageAsync = vi.hoisted(() => vi.fn());

vi.mock('../core/image-api', () => ({ loadImageAsync }));
vi.mock('expo-modules-core', () => ({
  Platform: {
    OS: 'ios',
    select: (spec: Record<string, unknown>) => spec['ios'],
  },
  SharedRef: class {},
  requireNativeViewManager: () => undefined,
  requireNativeModule: () => ({}),
}));

const { useImage } = await import('./use-image');

const ROOT_TAG = 2111;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: ReturnType<typeof useImage> | undefined;
let setSource: (source: string) => void = () => undefined;

function Probe(): null {
  const [source, update] = useState('https://x/a.png');
  setSource = update;
  captured = useImage(source, { maxWidth: 10 });
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
});

afterEach(() => unmount(ROOT_TAG));

describe('useImage', () => {
  it('is null until the image has loaded and then the image', async () => {
    const image = { release: vi.fn() };
    loadImageAsync.mockResolvedValue(image);
    mount(ROOT_TAG, <Probe />);
    expect(captured).toBeNull();

    await tick();

    expect(captured).toBe(image);
    expect(loadImageAsync).toHaveBeenCalledWith('https://x/a.png', {
      maxWidth: 10,
    });
  });

  it('loads again and releases the old image when the uri changes', async () => {
    const first = { release: vi.fn() };
    const second = { release: vi.fn() };
    loadImageAsync.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    mount(ROOT_TAG, <Probe />);
    await tick();

    setSource('https://x/b.png');
    await vi.waitFor(() => expect(captured).toBe(second));

    expect(first.release).toHaveBeenCalledTimes(1);
  });

  it('releases the image when the component unmounts', async () => {
    const image = { release: vi.fn() };
    loadImageAsync.mockResolvedValue(image);
    mount(ROOT_TAG, <Probe />);
    await tick();

    unmount(ROOT_TAG);

    expect(image.release).toHaveBeenCalledTimes(1);
  });
});
