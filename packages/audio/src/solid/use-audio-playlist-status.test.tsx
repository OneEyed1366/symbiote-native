// Solid twin of `../react`'s `useAudioPlaylistStatus` test

import { createSignal, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useAudioPlaylistStatus } from './use-audio-playlist-status';

type IFakeStatus = { currentIndex: number };

type IPlaylistSource = ReturnType<Parameters<typeof useAudioPlaylistStatus>[0]>;

function createFakePlaylist(initial: IFakeStatus): {
  playlist: IPlaylistSource;
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
    playlist: playlist as unknown as IPlaylistSource,
    emit: value => listener?.(value),
  };
}

const ROOT_TAG = 1506;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: Accessor<IFakeStatus> | undefined;

function Probe(props: { playlist: IPlaylistSource }): null {
  const [playlist] = createSignal(props.playlist);
  captured = useAudioPlaylistStatus(playlist);
  return null;
}

function mountHarness(playlist: IPlaylistSource): void {
  mount(ROOT_TAG, () => <Probe playlist={playlist} />);
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

    expect(captured?.()).toEqual({ currentIndex: 0 });
  });

  it('updates when the playlist emits playlistStatusUpdate', async () => {
    const { playlist, emit } = createFakePlaylist({ currentIndex: 0 });
    mountHarness(playlist);
    await tick();

    emit({ currentIndex: 1 });
    await tick();

    expect(captured?.()).toEqual({ currentIndex: 1 });
  });
});
