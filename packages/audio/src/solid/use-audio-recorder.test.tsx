// Solid twin of `../react`'s `useAudioRecorder` test

import { createSignal, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioRecorder } = vi.hoisted(() => ({
  createAudioRecorder: vi.fn(),
}));

vi.mock('../core/audio-recorder', () => ({ createAudioRecorder }));

const { useAudioRecorder } = await import('./use-audio-recorder');

const ROOT_TAG = 1703;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createRecorder(): {
  release: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
} {
  return { release: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) };
}

let captured: Accessor<ReturnType<typeof createRecorder>> | undefined;
let setSampleRate: ((sampleRate: number) => void) | undefined;

function Probe(props: { initial: number }): null {
  const [sampleRate, updateSampleRate] = createSignal(props.initial);
  setSampleRate = updateSampleRate;
  captured = useAudioRecorder(() => ({ sampleRate: sampleRate() }));
  return null;
}

function mountHarness(initial: number): void {
  mount(ROOT_TAG, () => <Probe initial={initial} />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  setSampleRate = undefined;
  createAudioRecorder.mockImplementation(createRecorder);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAudioRecorder (Positive: creates once, recreates on options change, disposes the stale one)', () => {
  it('creates a recorder for the initial options', async () => {
    mountHarness(44_100);
    await tick();

    expect(createAudioRecorder).toHaveBeenCalledWith({ sampleRate: 44_100 });
    expect(captured?.()).toBeDefined();
  });

  it('returns the same recorder while options are unchanged', async () => {
    mountHarness(44_100);
    await tick();
    const first = captured?.();

    expect(captured?.()).toBe(first);
    expect(createAudioRecorder).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale recorder when options change', async () => {
    mountHarness(44_100);
    await tick();
    const stale = captured?.();

    setSampleRate?.(48_000);
    await tick();

    expect(captured?.()).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('disposes the current recorder on unmount', async () => {
    mountHarness(44_100);
    await tick();
    const current = captured?.();

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
