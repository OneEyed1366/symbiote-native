// Solid twin of `../react`'s `useAudioPlayer` test

import { createSignal, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioPlayer } = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
}));

vi.mock('../core/audio-player', () => ({ createAudioPlayer }));

const { useAudioPlayer } = await import('./use-audio-player');

const ROOT_TAG = 1203;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createPlayer(): { remove: ReturnType<typeof vi.fn> } {
  return { remove: vi.fn() };
}

let captured: Accessor<ReturnType<typeof createPlayer>> | undefined;
let setSource: ((source: string) => void) | undefined;

function Probe(props: { initial: string }): null {
  const [source, updateSource] = createSignal(props.initial);
  setSource = updateSource;
  captured = useAudioPlayer(source);
  return null;
}

function mountHarness(initial: string): void {
  mount(ROOT_TAG, () => <Probe initial={initial} />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  setSource = undefined;
  createAudioPlayer.mockImplementation(createPlayer);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAudioPlayer (Positive: creates once, recreates on source change, disposes the stale one)', () => {
  it('creates a player for the initial source', async () => {
    mountHarness('a.mp3');
    await tick();

    expect(createAudioPlayer).toHaveBeenCalledWith('a.mp3', {});
    expect(captured?.()).toBeDefined();
  });

  it('returns the same player while the source signal is unchanged', async () => {
    mountHarness('a.mp3');
    await tick();
    const first = captured?.();

    expect(captured?.()).toBe(first);
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale player when the source changes', async () => {
    mountHarness('a.mp3');
    await tick();
    const stale = captured?.();

    setSource?.('b.mp3');
    await tick();

    expect(captured?.()).not.toBe(stale);
    expect(stale?.remove).toHaveBeenCalledTimes(1);
  });

  it('disposes the current player on unmount', async () => {
    mountHarness('a.mp3');
    await tick();
    const current = captured?.();

    unmount(ROOT_TAG);

    expect(current?.remove).toHaveBeenCalledTimes(1);
  });
});
