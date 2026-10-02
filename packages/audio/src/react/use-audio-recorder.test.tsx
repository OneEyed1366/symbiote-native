// React twin of expo-audio's `useAudioRecorder`

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioRecorder } = vi.hoisted(() => ({
  createAudioRecorder: vi.fn(),
}));

vi.mock('../core/audio-recorder', () => ({ createAudioRecorder }));

const { useAudioRecorder } = await import('./use-audio-recorder');

const ROOT_TAG = 1701;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createRecorder(): {
  release: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
} {
  return {
    release: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  };
}

let captured: ReturnType<typeof useAudioRecorder> | undefined;
let updateSampleRate: ((sampleRate: number) => void) | undefined;

function Harness({
  initial,
  statusListener,
}: {
  initial: number;
  statusListener?: (status: unknown) => void;
}): null {
  const [sampleRate, setSampleRate] = useState(initial);
  updateSampleRate = setSampleRate;
  captured = useAudioRecorder({ sampleRate }, statusListener);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  updateSampleRate = undefined;
  createAudioRecorder.mockImplementation(createRecorder);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAudioRecorder (Positive: creates once, recreates on options change, disposes the stale one)', () => {
  it('creates a recorder for the initial options', async () => {
    mount(ROOT_TAG, <Harness initial={44_100} />);
    await tick();

    expect(createAudioRecorder).toHaveBeenCalledWith({ sampleRate: 44_100 });
    expect(captured).toBeDefined();
  });

  it('returns the same recorder across re-renders with unchanged options', async () => {
    mount(ROOT_TAG, <Harness initial={44_100} />);
    await tick();
    const first = captured;

    updateSampleRate?.(44_100);
    await tick();

    expect(captured).toBe(first);
    expect(createAudioRecorder).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale recorder when options change', async () => {
    mount(ROOT_TAG, <Harness initial={44_100} />);
    await tick();
    const stale = captured;

    updateSampleRate?.(48_000);
    await vi.waitFor(() =>
      expect(createAudioRecorder).toHaveBeenCalledTimes(2),
    );
    await tick();

    expect(captured).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('disposes the current recorder on unmount', async () => {
    mount(ROOT_TAG, <Harness initial={44_100} />);
    await tick();
    const current = captured;

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });

  it('forwards recording status updates to the status listener', async () => {
    const statusListener = vi.fn();
    mount(
      ROOT_TAG,
      <Harness initial={44_100} statusListener={statusListener} />,
    );
    await tick();

    expect(captured?.addListener).toHaveBeenCalledWith(
      'recordingStatusUpdate',
      expect.any(Function),
    );
    const [, listener] = captured?.addListener.mock.calls[0] ?? [];
    listener?.({ isRecording: true });

    expect(statusListener).toHaveBeenCalledWith({ isRecording: true });
  });
});
