// Angular `injectVideoPlayer` over the shared player controller

import '@angular/compiler';
import { Component, signal, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { VideoPlayer } from '../core';

const players = vi.hoisted(() => ({
  createVideoPlayer: vi.fn((source: unknown) => ({
    source,
    release: vi.fn(),
  })),
}));

vi.mock('../core/video-player', () => players);
vi.mock('../core/video-source', () => ({
  parseSource: (source: unknown) =>
    typeof source === 'string' ? { uri: source } : source,
}));

const { injectVideoPlayer } = await import('./inject-video-player');

const ROOT_TAG = 1919;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const source = signal('a.mp4');
const setup = vi.fn();
const held: { player: Signal<VideoPlayer> | null } = { player: null };

@Component({ selector: 'video-player-host', standalone: true, template: '' })
class Host {
  readonly player = injectVideoPlayer(source, setup);
  constructor() {
    held.player = this.player;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  source.set('a.mp4');
  held.player = null;
});

afterEach(() => unmount(ROOT_TAG));

describe('injectVideoPlayer', () => {
  it('creates the player from the parsed source and runs the setup on it', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    expect(players.createVideoPlayer).toHaveBeenCalledWith(
      { uri: 'a.mp4' },
      undefined,
    );
    expect(setup).toHaveBeenCalledWith(held.player?.());
  });

  it('replaces the player when the source changes and releases the old one', async () => {
    mount(ROOT_TAG, Host);
    await tick();
    const first = held.player?.();

    source.set('b.mp4');
    await tick();
    await tick();

    expect(held.player?.()).not.toBe(first);
    expect(first?.release).toHaveBeenCalledTimes(1);
  });

  it('releases the player when the owner is destroyed', async () => {
    mount(ROOT_TAG, Host);
    await tick();
    const first = held.player?.();

    unmount(ROOT_TAG);
    await tick();

    expect(first?.release).toHaveBeenCalledTimes(1);
  });
});
