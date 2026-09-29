// React twin of expo-audio's `useAudioRecorderState`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
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

const ROOT_TAG = 1801;
const fabric = installRecordingFabric();

let captured: ReturnType<typeof useAudioRecorderState> | undefined;

function Harness({
  recorder,
}: {
  recorder: Parameters<typeof useAudioRecorderState>[0];
}): null {
  captured = useAudioRecorderState(recorder, 10);
  return null;
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
    mount(ROOT_TAG, <Harness recorder={recorder} />);
    await vi.advanceTimersByTimeAsync(0);

    expect(captured).toEqual({ isRecording: false, durationMillis: 0 });
  });

  it('updates after a poll observes a meaningful change', async () => {
    const { recorder, setStatus } = createFakeRecorder({
      isRecording: false,
      durationMillis: 0,
    });
    mount(ROOT_TAG, <Harness recorder={recorder} />);
    await vi.advanceTimersByTimeAsync(0);

    setStatus({ isRecording: true, durationMillis: 0 });
    await vi.advanceTimersByTimeAsync(10);

    expect(captured).toEqual({ isRecording: true, durationMillis: 0 });
  });

  it('does not update on a poll with no meaningful change', async () => {
    const { recorder, setStatus } = createFakeRecorder({
      isRecording: false,
      durationMillis: 0,
    });
    mount(ROOT_TAG, <Harness recorder={recorder} />);
    await vi.advanceTimersByTimeAsync(0);
    const first = captured;

    setStatus({ isRecording: false, durationMillis: 10 });
    await vi.advanceTimersByTimeAsync(10);

    expect(captured).toBe(first);
  });
});
