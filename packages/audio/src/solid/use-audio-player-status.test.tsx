// Solid twin of `../react`'s `useAudioPlayerStatus` test

import { createSignal, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useAudioPlayerStatus } from './use-audio-player-status';

type IFakeStatus = { playing: boolean };
type IFakePlayer = {
  currentStatus: IFakeStatus;
  addListener: (
    event: string,
    listener: (value: IFakeStatus) => void,
  ) => { remove: () => void };
};

function createFakePlayer(initial: IFakeStatus): {
  player: IFakePlayer;
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

type IPlayerSourceGetter = Parameters<typeof useAudioPlayerStatus>[0];

const ROOT_TAG = 1303;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: Accessor<IFakeStatus> | undefined;

function Probe(props: { player: IFakePlayer }): null {
  const [player] = createSignal(props.player);
  captured = useAudioPlayerStatus(player as IPlayerSourceGetter);
  return null;
}

function mountHarness(player: IFakePlayer): void {
  mount(ROOT_TAG, () => <Probe player={player} />);
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
    mountHarness(player);
    await tick();

    expect(captured?.()).toEqual({ playing: false });
  });

  it('updates when the player emits playbackStatusUpdate', async () => {
    const { player, emit } = createFakePlayer({ playing: false });
    mountHarness(player);
    await tick();

    emit({ playing: true });
    await tick();

    expect(captured?.()).toEqual({ playing: true });
  });
});
