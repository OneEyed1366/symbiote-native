// Angular twin of `../react`'s `useAudioPlayer` test

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { injectAudioPlayer } from './inject-audio-player';

const { createAudioPlayer } = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
}));

vi.mock('../core/audio-player', () => ({ createAudioPlayer }));

function createPlayer(): { remove: ReturnType<typeof vi.fn> } {
  return { remove: vi.fn() };
}

const ROOT_TAG = 1204;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({ selector: 'audio-player-host', standalone: true, template: '' })
class HostFixture {
  readonly source = signal('a.mp3');
  readonly player = injectAudioPlayer(this.source);
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedHost = undefined;
  createAudioPlayer.mockImplementation(createPlayer);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('injectAudioPlayer (Positive: creates once, recreates on source change, disposes the stale one)', () => {
  it('creates a player for the initial source', () => {
    mount(ROOT_TAG, HostFixture);

    expect(createAudioPlayer).toHaveBeenCalledWith('a.mp3', {});
    expect(capturedHost?.player()).toBeDefined();
  });

  it('recreates and disposes the stale player when the source changes', async () => {
    mount(ROOT_TAG, HostFixture);
    const stale = capturedHost?.player();

    capturedHost?.source.set('b.mp3');
    await tick();

    expect(capturedHost?.player()).not.toBe(stale);
    expect(stale?.remove).toHaveBeenCalledTimes(1);
  });

  it('disposes the current player on unmount', () => {
    mount(ROOT_TAG, HostFixture);
    const current = capturedHost?.player();

    unmount(ROOT_TAG);

    expect(current?.remove).toHaveBeenCalledTimes(1);
  });
});
