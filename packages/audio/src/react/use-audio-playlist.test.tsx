// React twin of expo-audio's `useAudioPlaylist`

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioPlaylist } = vi.hoisted(() => ({
  createAudioPlaylist: vi.fn(),
}));

vi.mock('../core/audio-playlist', () => ({ createAudioPlaylist }));

const { useAudioPlaylist } = await import('./use-audio-playlist');

const ROOT_TAG = 1501;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createPlaylist(): { destroy: ReturnType<typeof vi.fn> } {
  return { destroy: vi.fn() };
}

let captured: ReturnType<typeof useAudioPlaylist> | undefined;
let updateLoop: ((loop: 'none' | 'all') => void) | undefined;

function Harness({ initial }: { initial: 'none' | 'all' }): null {
  const [loop, setLoop] = useState(initial);
  updateLoop = setLoop;
  captured = useAudioPlaylist({ loop });
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  updateLoop = undefined;
  createAudioPlaylist.mockImplementation(createPlaylist);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAudioPlaylist (Positive: creates once, recreates on options change, disposes the stale one)', () => {
  it('creates a playlist for the initial options', async () => {
    mount(ROOT_TAG, <Harness initial="none" />);
    await tick();

    expect(createAudioPlaylist).toHaveBeenCalledWith({ loop: 'none' });
    expect(captured).toBeDefined();
  });

  it('returns the same playlist across re-renders with unchanged options', async () => {
    mount(ROOT_TAG, <Harness initial="none" />);
    await tick();
    const first = captured;

    updateLoop?.('none');
    await tick();

    expect(captured).toBe(first);
    expect(createAudioPlaylist).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale playlist when options change', async () => {
    mount(ROOT_TAG, <Harness initial="none" />);
    await tick();
    const stale = captured;

    updateLoop?.('all');
    await vi.waitFor(() =>
      expect(createAudioPlaylist).toHaveBeenCalledTimes(2),
    );
    await tick();

    expect(captured).not.toBe(stale);
    expect(stale?.destroy).toHaveBeenCalledTimes(1);
  });

  it('disposes the current playlist on unmount', async () => {
    mount(ROOT_TAG, <Harness initial="none" />);
    await tick();
    const current = captured;

    unmount(ROOT_TAG);

    expect(current?.destroy).toHaveBeenCalledTimes(1);
  });
});
