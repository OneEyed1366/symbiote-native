// Vue twin of `../react`'s `useAudioPlayer` test

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioPlayer } = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
}));

vi.mock('../core/audio-player', () => ({ createAudioPlayer }));

const { useAudioPlayer } = await import('./use-audio-player');

const ROOT_TAG = 1202;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createPlayer(): { remove: ReturnType<typeof vi.fn> } {
  return { remove: vi.fn() };
}

let captured: ReturnType<typeof useAudioPlayer> | undefined;
let source: ReturnType<typeof ref<string>>;

function mountHarness(initial: string): void {
  source = ref(initial);
  const Probe = defineComponent(() => {
    captured = useAudioPlayer(source);
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
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
    expect(captured?.value).toBeDefined();
  });

  it('returns the same player while the source ref is unchanged', async () => {
    mountHarness('a.mp3');
    await tick();
    const first = captured?.value;

    expect(captured?.value).toBe(first);
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale player when the source changes', async () => {
    mountHarness('a.mp3');
    await tick();
    const stale = captured?.value;

    source.value = 'b.mp3';
    await tick();

    expect(captured?.value).not.toBe(stale);
    expect(stale?.remove).toHaveBeenCalledTimes(1);
  });

  it('disposes the current player on unmount', async () => {
    mountHarness('a.mp3');
    await tick();
    const current = captured?.value;

    unmount(ROOT_TAG);

    expect(current?.remove).toHaveBeenCalledTimes(1);
  });
});
