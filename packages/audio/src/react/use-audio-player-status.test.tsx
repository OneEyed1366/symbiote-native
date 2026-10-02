// React twin of expo-audio's `useAudioPlayerStatus`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useAudioPlayerStatus } from './use-audio-player-status';

type IFakeStatus = { playing: boolean };

function createFakePlayer(initial: IFakeStatus): {
  player: {
    currentStatus: IFakeStatus;
    addListener: (
      event: string,
      listener: (value: IFakeStatus) => void,
    ) => { remove: () => void };
  };
  emit: (value: IFakeStatus) => void;
} {
  let listener: ((value: IFakeStatus) => void) | undefined;
  return {
    player: {
      currentStatus: initial,
      addListener: (_event, cb) => {
        listener = cb;
        return { remove: vi.fn() };
      },
    },
    emit: value => listener?.(value),
  };
}

const ROOT_TAG = 1301;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: IFakeStatus | undefined;

function Harness({
  player,
}: {
  player: ReturnType<typeof createFakePlayer>['player'];
}): null {
  captured = useAudioPlayerStatus(
    player as Parameters<typeof useAudioPlayerStatus>[0],
  );
  return null;
}

beforeEach(() => {
  fabric.reset();
  captured = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAudioPlayerStatus (Positive: reads current status, updates on playbackStatusUpdate)', () => {
  it('returns the player current status', async () => {
    const { player } = createFakePlayer({ playing: false });
    mount(ROOT_TAG, <Harness player={player} />);
    await tick();

    expect(captured).toEqual({ playing: false });
  });

  it('updates when the player emits playbackStatusUpdate', async () => {
    const { player, emit } = createFakePlayer({ playing: false });
    mount(ROOT_TAG, <Harness player={player} />);
    await tick();

    emit({ playing: true });
    await tick();

    expect(captured).toEqual({ playing: true });
  });
});
