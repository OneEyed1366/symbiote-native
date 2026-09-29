import { describe, expect, it, vi } from 'vitest';
import { subscribeAudioSampleListener } from './audio-sample-listener';

function createFakePlayer(isSupported: boolean): {
  player: {
    isAudioSamplingSupported: boolean;
    setAudioSamplingEnabled: ReturnType<typeof vi.fn>;
    addListener: ReturnType<typeof vi.fn>;
  };
  emit: (data: unknown) => void;
  removeSpy: ReturnType<typeof vi.fn>;
} {
  let listener: ((data: unknown) => void) | undefined;
  const removeSpy = vi.fn();
  return {
    player: {
      isAudioSamplingSupported: isSupported,
      setAudioSamplingEnabled: vi.fn(),
      addListener: vi.fn((_event: string, cb: (data: unknown) => void) => {
        listener = cb;
        return { remove: removeSpy };
      }),
    },
    emit: data => listener?.(data),
    removeSpy,
  };
}

describe('subscribeAudioSampleListener (Positive: enables sampling and forwards samples when supported)', () => {
  it('enables sampling and subscribes when sampling is supported', () => {
    const { player } = createFakePlayer(true);
    const listener = vi.fn();

    subscribeAudioSampleListener(player, listener);

    expect(player.setAudioSamplingEnabled).toHaveBeenCalledWith(true);
    expect(player.addListener).toHaveBeenCalledWith(
      'audioSampleUpdate',
      listener,
    );
  });

  it('forwards emitted samples to the listener', () => {
    const { player, emit } = createFakePlayer(true);
    const listener = vi.fn();

    subscribeAudioSampleListener(player, listener);
    emit({ channels: [] });

    expect(listener).toHaveBeenCalledWith({ channels: [] });
  });

  it('removes the subscription when the returned cleanup runs', () => {
    const { player, removeSpy } = createFakePlayer(true);

    const unsubscribe = subscribeAudioSampleListener(player, vi.fn());
    unsubscribe();

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when sampling is not supported', () => {
    const { player } = createFakePlayer(false);

    const unsubscribe = subscribeAudioSampleListener(player, vi.fn());
    unsubscribe();

    expect(player.setAudioSamplingEnabled).not.toHaveBeenCalled();
    expect(player.addListener).not.toHaveBeenCalled();
  });
});
