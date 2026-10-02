// Angular twin of `../react`'s `useAudioRecorder` test

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioRecorder } = vi.hoisted(() => ({
  createAudioRecorder: vi.fn(),
}));

vi.mock('../core/audio-recorder', () => ({ createAudioRecorder }));

const { injectAudioRecorder } = await import('./inject-audio-recorder');

function createRecorder(): {
  release: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
} {
  return { release: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) };
}

const ROOT_TAG = 1704;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({ selector: 'audio-recorder-host', standalone: true, template: '' })
class HostFixture {
  readonly sampleRate = signal(44_100);
  readonly recorder = injectAudioRecorder(() => ({
    sampleRate: this.sampleRate(),
  }));
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedHost = undefined;
  createAudioRecorder.mockImplementation(createRecorder);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('injectAudioRecorder (Positive: creates once, recreates on options change, disposes the stale one)', () => {
  it('creates a recorder for the initial options', () => {
    mount(ROOT_TAG, HostFixture);

    expect(createAudioRecorder).toHaveBeenCalledWith({ sampleRate: 44_100 });
    expect(capturedHost?.recorder()).toBeDefined();
  });

  it('recreates and disposes the stale recorder when options change', async () => {
    mount(ROOT_TAG, HostFixture);
    const stale = capturedHost?.recorder();

    capturedHost?.sampleRate.set(48_000);
    await tick();

    expect(capturedHost?.recorder()).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('disposes the current recorder on unmount', () => {
    mount(ROOT_TAG, HostFixture);
    const current = capturedHost?.recorder();

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
