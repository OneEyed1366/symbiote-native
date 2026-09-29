// Solid twin of `../react`'s `useAudioSampleListener` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useAudioSampleListener } from './use-audio-sample-listener';

function createFakePlayer(isSupported: boolean): {
  player: Parameters<typeof useAudioSampleListener>[0];
  emit: (data: unknown) => void;
  removeSpy: ReturnType<typeof vi.fn>;
} {
  let listener: ((data: unknown) => void) | undefined;
  const removeSpy = vi.fn();
  const player = {
    isAudioSamplingSupported: isSupported,
    setAudioSamplingEnabled: vi.fn(),
    addListener: vi.fn((_event: string, cb: (data: unknown) => void) => {
      listener = cb;
      return { remove: removeSpy };
    }),
  };
  return {
    player: player as Parameters<typeof useAudioSampleListener>[0],
    emit: data => listener?.(data),
    removeSpy,
  };
}

const ROOT_TAG = 1403;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function Probe(props: {
  player: Parameters<typeof useAudioSampleListener>[0];
  listener: (data: unknown) => void;
}): null {
  useAudioSampleListener(props.player, props.listener);
  return null;
}

function mountHarness(
  player: Parameters<typeof useAudioSampleListener>[0],
  listener: (data: unknown) => void,
): void {
  mount(ROOT_TAG, () => <Probe player={player} listener={listener} />);
}

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAudioSampleListener (Positive: enables sampling, forwards samples, cleans up)', () => {
  it('forwards emitted samples to the listener', async () => {
    const { player, emit } = createFakePlayer(true);
    const listener = vi.fn();
    mountHarness(player, listener);
    await tick();

    emit({ channels: [] });

    expect(listener).toHaveBeenCalledWith({ channels: [] });
  });

  it('removes the subscription on unmount', async () => {
    const { player, removeSpy } = createFakePlayer(true);
    mountHarness(player, vi.fn());
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
