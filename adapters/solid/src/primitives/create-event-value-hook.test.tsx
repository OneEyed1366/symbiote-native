// Every `useXStatus`-style primitive (`useAudioPlayerStatus`, `useAudioPlaylistStatus`, ...)
// binds this to its own event name + initial-value getter instead of repeating the effect wiring

import { createSignal, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createEventValueHook } from './create-event-value-hook';

type IFakeStatus = { playing: boolean };
type IFakeSource = {
  currentStatus: IFakeStatus;
  addListener: (
    event: string,
    listener: (value: IFakeStatus) => void,
  ) => { remove: () => void };
};

function createFakeSource(initial: IFakeStatus): {
  source: IFakeSource;
  emit: (value: IFakeStatus) => void;
  removeSpy: ReturnType<typeof vi.fn>;
} {
  let listener: ((value: IFakeStatus) => void) | undefined;
  const removeSpy = vi.fn();
  return {
    source: {
      currentStatus: initial,
      addListener: (_event, cb) => {
        listener = cb;
        return { remove: removeSpy };
      },
    },
    emit: value => listener?.(value),
    removeSpy,
  };
}

const useStatus = createEventValueHook<IFakeSource, IFakeStatus>(
  'statusUpdate',
  source => source.currentStatus,
);

const ROOT_TAG = 90_303;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: Accessor<IFakeStatus> | undefined;
let setSource: ((source: IFakeSource) => void) | undefined;

function Probe(props: { initial: IFakeSource }): null {
  const [source, updateSource] = createSignal(props.initial);
  setSource = updateSource;
  captured = useStatus(source);
  return null;
}

function mountHarness(initial: IFakeSource): void {
  mount(ROOT_TAG, () => <Probe initial={initial} />);
}

beforeEach(() => {
  fabric.reset();
  captured = undefined;
  setSource = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createEventValueHook (Positive: initial value, updates on event, cleans up on unmount)', () => {
  it('returns the source-provided initial value', async () => {
    const { source } = createFakeSource({ playing: false });
    mountHarness(source);
    await tick();

    expect(captured?.()).toEqual({ playing: false });
  });

  it('updates when the source emits the event', async () => {
    const { source, emit } = createFakeSource({ playing: false });
    mountHarness(source);
    await tick();

    emit({ playing: true });
    await tick();

    expect(captured?.()).toEqual({ playing: true });
  });

  it('resubscribes and re-reads the initial value when the source changes', async () => {
    const first = createFakeSource({ playing: false });
    const second = createFakeSource({ playing: true });
    mountHarness(first.source);
    await tick();

    setSource?.(second.source);
    await tick();

    expect(captured?.()).toEqual({ playing: true });
    expect(first.removeSpy).toHaveBeenCalledTimes(1);
  });

  it('removes the subscription on unmount', async () => {
    const { source, removeSpy } = createFakeSource({ playing: false });
    mountHarness(source);
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
