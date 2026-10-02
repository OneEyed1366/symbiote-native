import { describe, expect, it, vi } from 'vitest';

const { createAudioRecorder } = vi.hoisted(() => ({
  createAudioRecorder: vi.fn((options: unknown) => ({
    options,
    release: vi.fn(),
  })),
}));

vi.mock('./audio-recorder', () => ({ createAudioRecorder }));

const { createAudioRecorderController } =
  await import('./audio-recorder-controller');

describe('createAudioRecorderController (Positive: recreates on options change)', () => {
  it('reuses the same recorder for unchanged options', () => {
    const controller = createAudioRecorderController();

    const first = controller.resolve({ isMeteringEnabled: false });
    const second = controller.resolve({ isMeteringEnabled: false });

    expect(first).toBe(second);
  });

  it('creates a new recorder when options change, deferring disposal of the old one', () => {
    const controller = createAudioRecorderController();

    const first = controller.resolve({ isMeteringEnabled: false });
    const second = controller.resolve({ isMeteringEnabled: true });

    expect(second).not.toBe(first);
    expect(first.release).not.toHaveBeenCalled();

    controller.flushDispose();

    expect(first.release).toHaveBeenCalledTimes(1);
  });

  it('dispose() releases the current recorder', () => {
    const controller = createAudioRecorderController();

    const recorder = controller.resolve({ isMeteringEnabled: false });
    controller.dispose();

    expect(recorder.release).toHaveBeenCalledTimes(1);
  });
});
