// Angular twin of `../react`'s `useAudioPlaylistStatus` test

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { injectAudioPlaylistStatus } from './inject-audio-playlist-status';

type IFakeStatus = { currentIndex: number };
type IPlaylistSourceGetter = Parameters<typeof injectAudioPlaylistStatus>[0];

function createFakePlaylist(initial: IFakeStatus): {
  playlist: ReturnType<IPlaylistSourceGetter>;
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
    playlist: playlist as unknown as ReturnType<IPlaylistSourceGetter>,
    emit: value => listener?.(value),
  };
}

const ROOT_TAG = 1602;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({
  selector: 'audio-playlist-status-host',
  standalone: true,
  template: '',
})
class HostFixture {
  readonly playlist = signal(createFakePlaylist({ currentIndex: 0 }).playlist);
  readonly status = injectAudioPlaylistStatus(() => this.playlist());
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  capturedHost = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('injectAudioPlaylistStatus (Positive: reads current status, updates on playlistStatusUpdate)', () => {
  it('returns the playlist current status', () => {
    const { playlist } = createFakePlaylist({ currentIndex: 0 });
    mount(ROOT_TAG, HostFixture);
    capturedHost?.playlist.set(playlist);

    expect(capturedHost?.status()).toEqual({ currentIndex: 0 });
  });

  it('updates when the playlist emits playlistStatusUpdate', async () => {
    const { playlist, emit } = createFakePlaylist({ currentIndex: 0 });
    mount(ROOT_TAG, HostFixture);
    capturedHost?.playlist.set(playlist);
    await tick();

    emit({ currentIndex: 1 });
    await tick();

    expect(capturedHost?.status()).toEqual({ currentIndex: 1 });
  });
});
