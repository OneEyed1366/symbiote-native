// Solid twin of `../react`'s `useAudioRecorderState` test

import type { Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useAudioRecorderState } from './use-audio-recorder-state';

type IFakeState = { isRecording: boolean; durationMillis: number };

function createFakeRecorder(initial: IFakeState): {
  recorder: Parameters<typeof useAudioRecorderState>[0];
  setStatus: (next: IFakeState) => void;
} {
  let status = initial;
  return {
    recorder: { getStatus: () => status } as Parameters<
      typeof useAudioRecorderState
    >[0],
    setStatus: next => {
      status = next;
    },
  };
}

const ROOT_TAG = 1803;
const fabric = installRecordingFabric();

let captured: Accessor<IFakeState> | undefined;

function Probe(props: {
  recorder: Parameters<typeof useAudioRecorderState>[0];
}): null {
  captured = useAudioRecorderState(props.recorder, 10);
  return null;
}

function mountHarness(
  recorder: Parameters<typeof useAudioRecorderState>[0],
): void {
  mount(ROOT_TAG, () => <Probe recorder={recorder} />);
}

beforeEach(() => {
  fabric.reset();
  vi.useFakeTimers();
  captured = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

describe('useAudioRecorderState (Positive: reads the initial status, polls for a meaningful change)', () => {
  it('returns the recorder initial status', async () => {
    const { recorder } = createFakeRecorder({
      isRecording: false,
      durationMillis: 0,
    });
    mountHarness(recorder);
    await vi.advanceTimersByTimeAsync(0);

    expect(captured?.()).toEqual({ isRecording: false, durationMillis: 0 });
  });

  it('updates after a poll observes a meaningful change', async () => {
    const { recorder, setStatus } = createFakeRecorder({
      isRecording: false,
      durationMillis: 0,
    });
    mountHarness(recorder);
    await vi.advanceTimersByTimeAsync(0);

    setStatus({ isRecording: true, durationMillis: 0 });
    await vi.advanceTimersByTimeAsync(10);

    expect(captured?.()).toEqual({ isRecording: true, durationMillis: 0 });
  });

  it('does not update on a poll with no meaningful change', async () => {
    const { recorder, setStatus } = createFakeRecorder({
      isRecording: false,
      durationMillis: 0,
    });
    mountHarness(recorder);
    await vi.advanceTimersByTimeAsync(0);
    const first = captured?.();

    setStatus({ isRecording: false, durationMillis: 10 });
    await vi.advanceTimersByTimeAsync(10);

    expect(captured?.()).toBe(first);
  });
});
