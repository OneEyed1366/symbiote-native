// Solid `useVideoPlayer` over the shared player controller

import { createSignal, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { VideoPlayer } from '../core';

const players = vi.hoisted(() => ({
  createVideoPlayer: vi.fn((source: unknown) => ({
    source,
    release: vi.fn(),
  })),
}));

vi.mock('../core/video-player', () => players);
vi.mock('../core/video-source', () => ({
  parseSource: (source: unknown) =>
    typeof source === 'string' ? { uri: source } : source,
}));

const { useVideoPlayer } = await import('./use-video-player');

const ROOT_TAG = 1916;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const [source, setSource] = createSignal('a.mp4');
const setup = vi.fn();
const held: { player: Accessor<VideoPlayer> | null } = { player: null };

function Probe(): null {
  held.player = useVideoPlayer(source, setup);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  setSource('a.mp4');
  held.player = null;
});

afterEach(() => unmount(ROOT_TAG));

describe('useVideoPlayer', () => {
  it('creates the player from the parsed source and runs the setup on it', async () => {
    mount(ROOT_TAG, () => <Probe />);
    await tick();

    expect(players.createVideoPlayer).toHaveBeenCalledWith(
      { uri: 'a.mp4' },
      undefined,
    );
    expect(setup).toHaveBeenCalledWith(held.player?.());
  });

  it('replaces the player when the source changes and releases the old one', async () => {
    mount(ROOT_TAG, () => <Probe />);
    await tick();
    const first = held.player?.();

    setSource('b.mp4');
    await tick();

    expect(held.player?.()).not.toBe(first);
    expect(first?.release).toHaveBeenCalledTimes(1);
  });

  it('releases the player when the owner is disposed', async () => {
    mount(ROOT_TAG, () => <Probe />);
    await tick();
    const first = held.player?.();

    unmount(ROOT_TAG);
    await tick();

    expect(first?.release).toHaveBeenCalledTimes(1);
  });
});
