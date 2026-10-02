// Vue twin of `../react`'s `useAudioRecorderState` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const ROOT_TAG = 1802;
const fabric = installRecordingFabric();

let captured: ReturnType<typeof useAudioRecorderState> | undefined;

function mountHarness(
  recorder: Parameters<typeof useAudioRecorderState>[0],
): void {
  const Probe = defineComponent(() => {
    captured = useAudioRecorderState(recorder, 10);
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
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

    expect(captured?.value).toEqual({ isRecording: false, durationMillis: 0 });
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

    expect(captured?.value).toEqual({ isRecording: true, durationMillis: 0 });
  });

  it('does not update on a poll with no meaningful change', async () => {
    const { recorder, setStatus } = createFakeRecorder({
      isRecording: false,
      durationMillis: 0,
    });
    mountHarness(recorder);
    await vi.advanceTimersByTimeAsync(0);
    const first = captured?.value;

    setStatus({ isRecording: false, durationMillis: 10 });
    await vi.advanceTimersByTimeAsync(10);

    expect(captured?.value).toBe(first);
  });
});
