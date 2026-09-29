// Vue twin of `../react`'s `useAudioRecorder` test

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { createAudioRecorder } = vi.hoisted(() => ({
  createAudioRecorder: vi.fn(),
}));

vi.mock('../core/audio-recorder', () => ({ createAudioRecorder }));

const { useAudioRecorder } = await import('./use-audio-recorder');

const ROOT_TAG = 1702;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createRecorder(): {
  release: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
} {
  return { release: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) };
}

let captured: ReturnType<typeof useAudioRecorder> | undefined;
let sampleRate: ReturnType<typeof ref<number>>;

function mountHarness(initial: number): void {
  sampleRate = ref(initial);
  const Probe = defineComponent(() => {
    captured = useAudioRecorder(() => ({ sampleRate: sampleRate.value }));
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
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
    expect(captured?.value).toBeDefined();
  });

  it('returns the same recorder while options are unchanged', async () => {
    mountHarness(44_100);
    await tick();
    const first = captured?.value;

    expect(captured?.value).toBe(first);
    expect(createAudioRecorder).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale recorder when options change', async () => {
    mountHarness(44_100);
    await tick();
    const stale = captured?.value;

    sampleRate.value = 48_000;
    await tick();

    expect(captured?.value).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('disposes the current recorder on unmount', async () => {
    mountHarness(44_100);
    await tick();
    const current = captured?.value;

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
