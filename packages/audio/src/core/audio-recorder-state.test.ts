import { describe, expect, it } from 'vitest';
import { shouldUpdateRecorderState } from './audio-recorder-state';
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

describe('shouldUpdateRecorderState (Positive: flags a meaningful change, ignores noise)', () => {
  it('flags a change in isRecording', () => {
    expect(
      shouldUpdateRecorderState(
        createState({ isRecording: false }),
        createState({ isRecording: true }),
      ),
    ).toBe(true);
  });

  it('flags a change in canRecord', () => {
    expect(
      shouldUpdateRecorderState(
        createState({ canRecord: true }),
        createState({ canRecord: false }),
      ),
    ).toBe(true);
  });

  it('flags a change in mediaServicesDidReset', () => {
    expect(
      shouldUpdateRecorderState(
        createState({ mediaServicesDidReset: false }),
        createState({ mediaServicesDidReset: true }),
      ),
    ).toBe(true);
  });

  it('flags a change in url', () => {
    expect(
      shouldUpdateRecorderState(
        createState({ url: null }),
        createState({ url: 'file://a.m4a' }),
      ),
    ).toBe(true);
  });

  it('flags a duration change larger than 50ms', () => {
    expect(
      shouldUpdateRecorderState(
        createState({ durationMillis: 0 }),
        createState({ durationMillis: 51 }),
      ),
    ).toBe(true);
  });

  it('ignores a duration change of 50ms or less', () => {
    expect(
      shouldUpdateRecorderState(
        createState({ durationMillis: 0 }),
        createState({ durationMillis: 50 }),
      ),
    ).toBe(false);
  });

  it('flags metering appearing where it was previously absent', () => {
    expect(
      shouldUpdateRecorderState(
        createState({ metering: undefined }),
        createState({ metering: -10 }),
      ),
    ).toBe(true);
  });

  it('flags a metering change larger than 0.1', () => {
    expect(
      shouldUpdateRecorderState(
        createState({ metering: -10 }),
        createState({ metering: -10.2 }),
      ),
    ).toBe(true);
  });

  it('ignores a metering change of 0.1 or less', () => {
    expect(
      shouldUpdateRecorderState(
        createState({ metering: -10 }),
        createState({ metering: -10.1 }),
      ),
    ).toBe(false);
  });

  it('reports no change when nothing meaningful differs', () => {
    expect(shouldUpdateRecorderState(createState(), createState())).toBe(false);
  });
});
