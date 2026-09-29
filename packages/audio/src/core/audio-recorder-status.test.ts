import { describe, expect, it, vi } from 'vitest';
import { subscribeRecordingStatus } from './audio-recorder-status';

function createFakeRecorder(): {
  recorder: { addListener: ReturnType<typeof vi.fn> };
  emit: (status: unknown) => void;
  removeSpy: ReturnType<typeof vi.fn>;
} {
  let listener: ((status: unknown) => void) | undefined;
  const removeSpy = vi.fn();
  return {
    recorder: {
      addListener: vi.fn((_event: string, cb: (status: unknown) => void) => {
        listener = cb;
        return { remove: removeSpy };
      }),
    },
    emit: status => listener?.(status),
    removeSpy,
  };
}

describe('subscribeRecordingStatus (Positive: forwards recording status updates, cleans up)', () => {
  it('subscribes to recordingStatusUpdate', () => {
    const { recorder } = createFakeRecorder();
    const listener = vi.fn();

    subscribeRecordingStatus(recorder, listener);

    expect(recorder.addListener).toHaveBeenCalledWith(
      'recordingStatusUpdate',
      expect.any(Function),
    );
  });

  it('forwards emitted status to the listener', () => {
    const { recorder, emit } = createFakeRecorder();
    const listener = vi.fn();

    subscribeRecordingStatus(recorder, listener);
    emit({ isRecording: true });

    expect(listener).toHaveBeenCalledWith({ isRecording: true });
  });

  it('removes the subscription when the returned cleanup runs', () => {
    const { recorder, removeSpy } = createFakeRecorder();

    const unsubscribe = subscribeRecordingStatus(recorder, vi.fn());
    unsubscribe();

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no listener is given', () => {
    const { recorder, emit } = createFakeRecorder();

    subscribeRecordingStatus(recorder, undefined);

    expect(() => emit({ isRecording: true })).not.toThrow();
  });
});
