import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
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

const ROOT_TAG = 1401;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function Harness({
  player,
  listener,
}: {
  player: Parameters<typeof useAudioSampleListener>[0];
  listener: (data: unknown) => void;
}): null {
  useAudioSampleListener(player, listener);
  return null;
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
    mount(ROOT_TAG, <Harness player={player} listener={listener} />);
    await tick();

    emit({ channels: [] });

    expect(listener).toHaveBeenCalledWith({ channels: [] });
  });

  it('removes the subscription on unmount', async () => {
    const { player, removeSpy } = createFakePlayer(true);
    mount(ROOT_TAG, <Harness player={player} listener={vi.fn()} />);
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
