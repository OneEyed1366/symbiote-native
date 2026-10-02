// Vue twin of `../react`'s `useAudioPlaylist` test

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioPlaylist } = vi.hoisted(() => ({
  createAudioPlaylist: vi.fn(),
}));

vi.mock('../core/audio-playlist', () => ({ createAudioPlaylist }));

const { useAudioPlaylist } = await import('./use-audio-playlist');

const ROOT_TAG = 1503;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createPlaylist(): { destroy: ReturnType<typeof vi.fn> } {
  return { destroy: vi.fn() };
}

let captured: ReturnType<typeof useAudioPlaylist> | undefined;
let loop: ReturnType<typeof ref<'none' | 'all'>>;

function mountHarness(initial: 'none' | 'all'): void {
  loop = ref(initial);
  const Probe = defineComponent(() => {
    captured = useAudioPlaylist(() => ({ loop: loop.value }));
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
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
    expect(captured?.value).toBeDefined();
  });

  it('returns the same playlist while options are unchanged', async () => {
    mountHarness('none');
    await tick();
    const first = captured?.value;

    expect(captured?.value).toBe(first);
    expect(createAudioPlaylist).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale playlist when options change', async () => {
    mountHarness('none');
    await tick();
    const stale = captured?.value;

    loop.value = 'all';
    await tick();

    expect(captured?.value).not.toBe(stale);
    expect(stale?.destroy).toHaveBeenCalledTimes(1);
  });

  it('disposes the current playlist on unmount', async () => {
    mountHarness('none');
    await tick();
    const current = captured?.value;

    unmount(ROOT_TAG);

    expect(current?.destroy).toHaveBeenCalledTimes(1);
  });
});
