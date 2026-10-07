// React `useVideoPlayer` over the shared player controller

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

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

const ROOT_TAG = 1911;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IProbePlayer = ReturnType<typeof useVideoPlayer>;

let captured: IProbePlayer | undefined;
let setSource: (source: string) => void = () => undefined;
const setup = vi.fn();

function Probe(): null {
  const [source, update] = useState('a.mp4');
  setSource = update;
  captured = useVideoPlayer(source, setup);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
});

afterEach(() => unmount(ROOT_TAG));

describe('useVideoPlayer', () => {
  it('creates the player from the parsed source and runs the setup on it', () => {
    mount(ROOT_TAG, <Probe />);

    expect(players.createVideoPlayer).toHaveBeenCalledWith(
      { uri: 'a.mp4' },
      undefined,
    );
    expect(setup).toHaveBeenCalledWith(captured);
  });

  it('keeps one player across renders of the same source', async () => {
    mount(ROOT_TAG, <Probe />);
    const first = captured;

    setSource('a.mp4');
    await tick();

    expect(captured).toBe(first);
    expect(players.createVideoPlayer).toHaveBeenCalledTimes(1);
  });

  it('replaces the player when the source changes and releases the old one', async () => {
    mount(ROOT_TAG, <Probe />);
    const first = captured;

    setSource('b.mp4');
    await tick();
    await tick();

    expect(captured).not.toBe(first);
    expect(first?.release).toHaveBeenCalledTimes(1);
  });

  it('releases the player when the component unmounts', async () => {
    mount(ROOT_TAG, <Probe />);
    const first = captured;

    unmount(ROOT_TAG);
    await tick();

    expect(first?.release).toHaveBeenCalledTimes(1);
  });
});
