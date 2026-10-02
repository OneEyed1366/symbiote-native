// Angular twin of `../react`'s `useAudioRecorderState` test

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { injectAudioRecorderState } from './inject-audio-recorder-state';

type IFakeState = { isRecording: boolean; durationMillis: number };

function createFakeRecorder(initial: IFakeState): {
  recorder: Parameters<typeof injectAudioRecorderState>[0];
  setStatus: (next: IFakeState) => void;
} {
  let status = initial;
  return {
    recorder: { getStatus: () => status } as Parameters<
      typeof injectAudioRecorderState
    >[0],
    setStatus: next => {
      status = next;
    },
  };
}

const ROOT_TAG = 1804;
const fabric = installRecordingFabric();

let capturedState: ReturnType<typeof injectAudioRecorderState> | undefined;

function createHostFixture(
  recorder: Parameters<typeof injectAudioRecorderState>[0],
) {
  @Component({
    selector: 'audio-recorder-state-host',
    standalone: true,
    template: '',
  })
  class HostFixture {
    readonly state = injectAudioRecorderState(recorder, 10);
    constructor() {
      capturedState = this.state;
    }
  }
  return HostFixture;
}

beforeEach(() => {
  fabric.reset();
  vi.useFakeTimers();
  capturedState = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

describe('injectAudioRecorderState (Positive: reads the initial status, polls for a meaningful change)', () => {
  it('returns the recorder initial status', async () => {
    const { recorder } = createFakeRecorder({
      isRecording: false,
      durationMillis: 0,
    });
    mount(ROOT_TAG, createHostFixture(recorder));
    await vi.advanceTimersByTimeAsync(0);

    expect(capturedState?.()).toEqual({
      isRecording: false,
      durationMillis: 0,
    });
  });

  it('updates after a poll observes a meaningful change', async () => {
    const { recorder, setStatus } = createFakeRecorder({
      isRecording: false,
      durationMillis: 0,
    });
    mount(ROOT_TAG, createHostFixture(recorder));
    await vi.advanceTimersByTimeAsync(0);

    setStatus({ isRecording: true, durationMillis: 0 });
    await vi.advanceTimersByTimeAsync(10);

    expect(capturedState?.()).toEqual({ isRecording: true, durationMillis: 0 });
  });
});
