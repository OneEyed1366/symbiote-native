// Angular twin of `../react`'s `useAudioSampleListener` test

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { injectAudioSampleListener } from './inject-audio-sample-listener';

function createFakePlayer(isSupported: boolean): {
  player: Parameters<typeof injectAudioSampleListener>[0];
  emit: (data: unknown) => void;
  removeSpy: ReturnType<typeof vi.fn>;
} {
  let listener: ((data: unknown) => void) | undefined;
  const removeSpy = vi.fn();
  const player = {
    isAudioSamplingSupported: isSupported,
    setAudioSamplingEnabled: vi.fn(),
    addListener: vi.fn((_event: string, cb: (data: unknown) => void) => {
      listener = cb;
      return { remove: removeSpy };
    }),
  };
  return {
    player: player as Parameters<typeof injectAudioSampleListener>[0],
    emit: data => listener?.(data),
    removeSpy,
  };
}

const ROOT_TAG = 1404;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedSample: unknown;

function createHostFixture(
  player: Parameters<typeof injectAudioSampleListener>[0],
) {
  @Component({
    selector: 'audio-sample-listener-host',
    standalone: true,
    template: '',
  })
  class HostFixture {
    constructor() {
      injectAudioSampleListener(player, data => {
        capturedSample = data;
      });
    }
  }
  return HostFixture;
}

beforeEach(() => {
  fabric.reset();
  capturedSample = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('injectAudioSampleListener (Positive: enables sampling, forwards samples, cleans up)', () => {
  it('forwards emitted samples to the listener', async () => {
    const { player, emit } = createFakePlayer(true);
    mount(ROOT_TAG, createHostFixture(player));
    await tick();

    emit({ channels: [] });

    expect(capturedSample).toEqual({ channels: [] });
  });

  it('removes the subscription on unmount', async () => {
    const { player, removeSpy } = createFakePlayer(true);
    mount(ROOT_TAG, createHostFixture(player));
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
