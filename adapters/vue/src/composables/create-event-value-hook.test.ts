// Every `useXStatus`-style composable (`useAudioPlayerStatus`, `useAudioPlaylistStatus`, ...)
// binds this to its own event name + initial-value getter instead of repeating the watch wiring

import { defineComponent, h, shallowRef, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const ROOT_TAG = 90_302;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: ReturnType<typeof useStatus> | undefined;
let source: ReturnType<typeof shallowRef<IFakeSource>>;

function mountHarness(initial: IFakeSource): void {
  source = shallowRef(initial);
  const Probe = defineComponent(() => {
    captured = useStatus(() => source.value);
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

describe('createEventValueHook (Positive: initial value, updates on event, cleans up on unmount)', () => {
  it('returns the source-provided initial value', async () => {
    const { source: fake } = createFakeSource({ playing: false });
    mountHarness(fake);
    await tick();

    expect(captured?.value).toEqual({ playing: false });
  });

  it('updates when the source emits the event', async () => {
    const { source: fake, emit } = createFakeSource({ playing: false });
    mountHarness(fake);
    await tick();

    emit({ playing: true });
    await tick();

    expect(captured?.value).toEqual({ playing: true });
  });

  it('resubscribes and re-reads the initial value when the source changes', async () => {
    const first = createFakeSource({ playing: false });
    const second = createFakeSource({ playing: true });
    mountHarness(first.source);
    await tick();

    source.value = second.source;
    await tick();

    expect(captured?.value).toEqual({ playing: true });
    expect(first.removeSpy).toHaveBeenCalledTimes(1);
  });

  it('removes the subscription on unmount', async () => {
    const { source: fake, removeSpy } = createFakeSource({ playing: false });
    mountHarness(fake);
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
