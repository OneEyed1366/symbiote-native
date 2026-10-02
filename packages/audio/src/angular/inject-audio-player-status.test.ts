// Angular twin of `../react`'s `useAudioPlayerStatus` test

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { injectAudioPlayerStatus } from './inject-audio-player-status';

type IFakeStatus = { playing: boolean };
type IFakePlayer = {
  currentStatus: IFakeStatus;
  addListener: (
    event: string,
    listener: (value: IFakeStatus) => void,
  ) => { remove: () => void };
};

function createFakePlayer(initial: IFakeStatus): {
  player: IFakePlayer;
  emit: (value: IFakeStatus) => void;
} {
  let listener: ((value: IFakeStatus) => void) | undefined;
  return {
    player: {
      currentStatus: initial,
      addListener: (_event, cb) => {
        listener = cb;
        return { remove: vi.fn() };
      },
    },
    emit: value => listener?.(value),
  };
}

type IPlayerSourceGetter = Parameters<typeof injectAudioPlayerStatus>[0];

const ROOT_TAG = 1304;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({
  selector: 'audio-player-status-host',
  standalone: true,
  template: '',
})
class HostFixture {
  readonly player = signal<IFakePlayer>(
    createFakePlayer({ playing: false }).player,
  );
  readonly status = injectAudioPlayerStatus((() =>
    this.player()) as IPlayerSourceGetter);
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

describe('injectAudioPlayerStatus (Positive: reads current status, updates on playbackStatusUpdate)', () => {
  it('returns the player current status', () => {
    const { player } = createFakePlayer({ playing: false });
    mount(ROOT_TAG, HostFixture);
    capturedHost?.player.set(player);

    expect(capturedHost?.status()).toEqual({ playing: false });
  });

  it('updates when the player emits playbackStatusUpdate', async () => {
    const { player, emit } = createFakePlayer({ playing: false });
    mount(ROOT_TAG, HostFixture);
    capturedHost?.player.set(player);
    await tick();

    emit({ playing: true });
    await tick();

    expect(capturedHost?.status()).toEqual({ playing: true });
  });
});
