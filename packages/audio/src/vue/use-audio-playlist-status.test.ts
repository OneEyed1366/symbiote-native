// Vue twin of `../react`'s `useAudioPlaylistStatus` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useAudioPlaylistStatus } from './use-audio-playlist-status';

type IFakeStatus = { currentIndex: number };

function createFakePlaylist(initial: IFakeStatus): {
  playlist: Parameters<typeof useAudioPlaylistStatus>[0];
  emit: (value: IFakeStatus) => void;
} {
  let listener: ((value: IFakeStatus) => void) | undefined;
  const playlist = {
    currentStatus: initial,
    addListener: vi.fn((_event: string, cb: (value: IFakeStatus) => void) => {
      listener = cb;
      return { remove: vi.fn() };
    }),
  };
  return {
    playlist: playlist as Parameters<typeof useAudioPlaylistStatus>[0],
    emit: value => listener?.(value),
  };
}

const ROOT_TAG = 1504;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: ReturnType<typeof useAudioPlaylistStatus> | undefined;

function mountHarness(
  playlist: Parameters<typeof useAudioPlaylistStatus>[0],
): void {
  const Probe = defineComponent(() => {
    captured = useAudioPlaylistStatus(() => playlist);
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  captured = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAudioPlaylistStatus (Positive: reads current status, updates on playlistStatusUpdate)', () => {
  it('returns the playlist current status', async () => {
    const { playlist } = createFakePlaylist({ currentIndex: 0 });
    mountHarness(playlist);
    await tick();

    expect(captured?.value).toEqual({ currentIndex: 0 });
  });

  it('updates when the playlist emits playlistStatusUpdate', async () => {
    const { playlist, emit } = createFakePlaylist({ currentIndex: 0 });
    mountHarness(playlist);
    await tick();

    emit({ currentIndex: 1 });
    await tick();

    expect(captured?.value).toEqual({ currentIndex: 1 });
  });
});
