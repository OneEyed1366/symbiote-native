// Angular twin of `../react`'s `useAudioPlaylist` test

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioPlaylist } = vi.hoisted(() => ({
  createAudioPlaylist: vi.fn(),
}));

vi.mock('../core/audio-playlist', () => ({ createAudioPlaylist }));

const { injectAudioPlaylist } = await import('./inject-audio-playlist');

function createPlaylist(): { destroy: ReturnType<typeof vi.fn> } {
  return { destroy: vi.fn() };
}

const ROOT_TAG = 1601;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({ selector: 'audio-playlist-host', standalone: true, template: '' })
class HostFixture {
  readonly loop = signal<'none' | 'all'>('none');
  readonly playlist = injectAudioPlaylist(() => ({ loop: this.loop() }));
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedHost = undefined;
  createAudioPlaylist.mockImplementation(createPlaylist);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('injectAudioPlaylist (Positive: creates once, recreates on options change, disposes the stale one)', () => {
  it('creates a playlist for the initial options', () => {
    mount(ROOT_TAG, HostFixture);

    expect(createAudioPlaylist).toHaveBeenCalledWith({ loop: 'none' });
    expect(capturedHost?.playlist()).toBeDefined();
  });

  it('recreates and disposes the stale playlist when options change', async () => {
    mount(ROOT_TAG, HostFixture);
    const stale = capturedHost?.playlist();

    capturedHost?.loop.set('all');
    await tick();

    expect(capturedHost?.playlist()).not.toBe(stale);
    expect(stale?.destroy).toHaveBeenCalledTimes(1);
  });

  it('disposes the current playlist on unmount', () => {
    mount(ROOT_TAG, HostFixture);
    const current = capturedHost?.playlist();

    unmount(ROOT_TAG);

    expect(current?.destroy).toHaveBeenCalledTimes(1);
  });
});
