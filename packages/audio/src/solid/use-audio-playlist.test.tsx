// Solid twin of `../react`'s `useAudioPlaylist` test

import { createSignal, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioPlaylist } = vi.hoisted(() => ({
  createAudioPlaylist: vi.fn(),
}));

vi.mock('../core/audio-playlist', () => ({ createAudioPlaylist }));

const { useAudioPlaylist } = await import('./use-audio-playlist');

const ROOT_TAG = 1505;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createPlaylist(): { destroy: ReturnType<typeof vi.fn> } {
  return { destroy: vi.fn() };
}

let captured: Accessor<ReturnType<typeof createPlaylist>> | undefined;
let setLoop: ((loop: 'none' | 'all') => void) | undefined;

function Probe(props: { initial: 'none' | 'all' }): null {
  const [loop, updateLoop] = createSignal(props.initial);
  setLoop = updateLoop;
  captured = useAudioPlaylist(() => ({ loop: loop() }));
  return null;
}

function mountHarness(initial: 'none' | 'all'): void {
  mount(ROOT_TAG, () => <Probe initial={initial} />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  setLoop = undefined;
  createAudioPlaylist.mockImplementation(createPlaylist);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAudioPlaylist (Positive: creates once, recreates on options change, disposes the stale one)', () => {
  it('creates a playlist for the initial options', async () => {
    mountHarness('none');
    await tick();

    expect(createAudioPlaylist).toHaveBeenCalledWith({ loop: 'none' });
    expect(captured?.()).toBeDefined();
  });

  it('returns the same playlist while options are unchanged', async () => {
    mountHarness('none');
    await tick();
    const first = captured?.();

    expect(captured?.()).toBe(first);
    expect(createAudioPlaylist).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale playlist when options change', async () => {
    mountHarness('none');
    await tick();
    const stale = captured?.();

    setLoop?.('all');
    await tick();

    expect(captured?.()).not.toBe(stale);
    expect(stale?.destroy).toHaveBeenCalledTimes(1);
  });

  it('disposes the current playlist on unmount', async () => {
    mountHarness('none');
    await tick();
    const current = captured?.();

    unmount(ROOT_TAG);

    expect(current?.destroy).toHaveBeenCalledTimes(1);
  });
});
