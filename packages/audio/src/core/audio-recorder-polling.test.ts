import { describe, expect, it, vi } from 'vitest';
import { pollRecorderState } from './audio-recorder-polling';
import type { IRecorderState } from './types';

function createState(overrides: Partial<IRecorderState> = {}): IRecorderState {
  return {
    canRecord: true,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    url: null,
    ...overrides,
  };
}

describe('pollRecorderState (Positive: polls on an interval, writes only a meaningful change)', () => {
  it('writes the new state when a poll observes a meaningful change', () => {
    vi.useFakeTimers();
    const recorder = {
      getStatus: vi.fn(() => createState({ isRecording: true })),
    };
    let current = createState({ isRecording: false });
    const update = vi.fn(
      (updater: (prev: IRecorderState) => IRecorderState) => {
        current = updater(current);
      },
    );

    pollRecorderState(recorder, 10, update);
    vi.advanceTimersByTime(10);

    expect(current).toEqual(createState({ isRecording: true }));
    vi.useRealTimers();
  });

  it('does not change state on a poll with no meaningful change', () => {
    vi.useFakeTimers();
    const recorder = {
      getStatus: vi.fn(() => createState({ durationMillis: 10 })),
    };
    let current = createState({ durationMillis: 0 });
    const update = vi.fn(
      (updater: (prev: IRecorderState) => IRecorderState) => {
        current = updater(current);
      },
    );

    pollRecorderState(recorder, 10, update);
    vi.advanceTimersByTime(10);

    expect(current).toEqual(createState({ durationMillis: 0 }));
    vi.useRealTimers();
  });

  it('stops polling when the returned cleanup runs', () => {
    vi.useFakeTimers();
    const recorder = { getStatus: vi.fn(() => createState()) };
    const update = vi.fn();

    const stop = pollRecorderState(recorder, 10, update);
    stop();
    vi.advanceTimersByTime(30);

    expect(recorder.getStatus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
