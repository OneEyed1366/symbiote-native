// Vue twin of `../react`'s `useAudioPlayerStatus` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const ROOT_TAG = 1302;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: ReturnType<typeof useAudioPlayerStatus> | undefined;

type IPlayerSourceGetter = Parameters<typeof useAudioPlayerStatus>[0];

function mountHarness(player: IFakePlayer): void {
  const getSource = (() => player) as IPlayerSourceGetter;
  const Probe = defineComponent(() => {
    captured = useAudioPlayerStatus(getSource);
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
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

    expect(captured?.value).toEqual({ playing: false });
  });

  it('updates when the player emits playbackStatusUpdate', async () => {
    const { player, emit } = createFakePlayer({ playing: false });
    mountHarness(player);
    await tick();

    emit({ playing: true });
    await tick();

    expect(captured?.value).toEqual({ playing: true });
  });
});
