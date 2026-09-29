// Every `useXStatus`-style hook (`useAudioPlayerStatus`, `useAudioPlaylistStatus`, ...) binds
// this to its own event name + initial-value getter instead of repeating the subscribe wiring

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
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

const ROOT_TAG = 90_301;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: IFakeStatus | undefined;
let updateSource: ((source: IFakeSource) => void) | undefined;

function Harness({ initial }: { initial: IFakeSource }): null {
  const [source, setSource] = useState(initial);
  updateSource = setSource;
  captured = useStatus(source);
  return null;
}

beforeEach(() => {
  fabric.reset();
  captured = undefined;
  updateSource = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createEventValueHook (Positive: initial value, updates on event, cleans up on unmount)', () => {
  it('returns the source-provided initial value', async () => {
    const { source } = createFakeSource({ playing: false });
    mount(ROOT_TAG, <Harness initial={source} />);
    await tick();

    expect(captured).toEqual({ playing: false });
  });

  it('updates when the source emits the event', async () => {
    const { source, emit } = createFakeSource({ playing: false });
    mount(ROOT_TAG, <Harness initial={source} />);
    await tick();

    emit({ playing: true });
    await tick();

    expect(captured).toEqual({ playing: true });
  });

  it('resubscribes and re-reads the initial value when the source changes', async () => {
    const first = createFakeSource({ playing: false });
    const second = createFakeSource({ playing: true });
    mount(ROOT_TAG, <Harness initial={first.source} />);
    await tick();

    updateSource?.(second.source);
    await vi.waitFor(() => expect(captured).toEqual({ playing: true }));

    expect(first.removeSpy).toHaveBeenCalledTimes(1);
  });

  it('removes the subscription on unmount', async () => {
    const { source, removeSpy } = createFakeSource({ playing: false });
    mount(ROOT_TAG, <Harness initial={source} />);
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
