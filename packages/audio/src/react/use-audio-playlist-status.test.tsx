// React twin of expo-audio's `useAudioPlaylistStatus`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
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

const ROOT_TAG = 1502;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: IFakeStatus | undefined;

function Harness({
  playlist,
}: {
  playlist: Parameters<typeof useAudioPlaylistStatus>[0];
}): null {
  captured = useAudioPlaylistStatus(playlist);
  return null;
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
    mount(ROOT_TAG, <Harness playlist={playlist} />);
    await tick();

    expect(captured).toEqual({ currentIndex: 0 });
  });

  it('updates when the playlist emits playlistStatusUpdate', async () => {
    const { playlist, emit } = createFakePlaylist({ currentIndex: 0 });
    mount(ROOT_TAG, <Harness playlist={playlist} />);
    await tick();

    emit({ currentIndex: 1 });
    await tick();

    expect(captured).toEqual({ currentIndex: 1 });
  });
});
