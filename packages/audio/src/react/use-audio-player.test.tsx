// React twin of expo-audio's `useAudioPlayer`

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioPlayer } = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
}));

vi.mock('../core/audio-player', () => ({ createAudioPlayer }));

const { useAudioPlayer } = await import('./use-audio-player');

const ROOT_TAG = 1201;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createPlayer(): { remove: ReturnType<typeof vi.fn> } {
  return { remove: vi.fn() };
}

let captured: ReturnType<typeof useAudioPlayer> | undefined;
let updateSource: ((source: string) => void) | undefined;

function Harness({ initial }: { initial: string }): null {
  const [source, setSource] = useState(initial);
  updateSource = setSource;
  captured = useAudioPlayer(source);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  updateSource = undefined;
  createAudioPlayer.mockImplementation(createPlayer);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAudioPlayer (Positive: creates once, recreates on source change, disposes the stale one)', () => {
  it('creates a player for the initial source', async () => {
    mount(ROOT_TAG, <Harness initial="a.mp3" />);
    await tick();

    expect(createAudioPlayer).toHaveBeenCalledWith('a.mp3', {});
    expect(captured).toBeDefined();
  });

  it('returns the same player across re-renders with an unchanged source', async () => {
    mount(ROOT_TAG, <Harness initial="a.mp3" />);
    await tick();
    const first = captured;

    updateSource?.('a.mp3');
    await tick();

    expect(captured).toBe(first);
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale player when the source changes', async () => {
    mount(ROOT_TAG, <Harness initial="a.mp3" />);
    await tick();
    const stale = captured;

    updateSource?.('b.mp3');
    await vi.waitFor(() => expect(createAudioPlayer).toHaveBeenCalledTimes(2));
    await tick();

    expect(captured).not.toBe(stale);
    expect(stale?.remove).toHaveBeenCalledTimes(1);
  });

  it('disposes the current player on unmount', async () => {
    mount(ROOT_TAG, <Harness initial="a.mp3" />);
    await tick();
    const current = captured;

    unmount(ROOT_TAG);

    expect(current?.remove).toHaveBeenCalledTimes(1);
  });
});
