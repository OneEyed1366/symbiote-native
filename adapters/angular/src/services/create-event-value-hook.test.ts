// Every `useXStatus`-style `injectX` (`injectAudioPlayerStatus`, ...) binds this to its own
// event name + initial-value getter instead of repeating the signal/effect wiring

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
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

const injectStatus = createEventValueHook<IFakeSource, IFakeStatus>(
  'statusUpdate',
  source => source.currentStatus,
);

const ROOT_TAG = 90_304;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({ selector: 'event-value-host', standalone: true, template: '' })
class HostFixture {
  readonly source = signal<IFakeSource>(
    createFakeSource({ playing: false }).source,
  );
  readonly value = injectStatus(() => this.source());
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  capturedHost = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createEventValueHook (Positive: initial value, updates on event, cleans up on unmount)', () => {
  it('returns the source-provided initial value', () => {
    const { source } = createFakeSource({ playing: false });
    mount(ROOT_TAG, HostFixture);
    capturedHost?.source.set(source);

    expect(capturedHost?.value()).toEqual({ playing: false });
  });

  it('updates when the source emits the event', async () => {
    const { source, emit } = createFakeSource({ playing: false });
    mount(ROOT_TAG, HostFixture);
    capturedHost?.source.set(source);
    await tick();

    emit({ playing: true });
    await tick();

    expect(capturedHost?.value()).toEqual({ playing: true });
  });

  it('resubscribes and re-reads the initial value when the source changes', async () => {
    const first = createFakeSource({ playing: false });
    const second = createFakeSource({ playing: true });
    mount(ROOT_TAG, HostFixture);
    capturedHost?.source.set(first.source);
    await tick();

    capturedHost?.source.set(second.source);
    await tick();

    expect(capturedHost?.value()).toEqual({ playing: true });
    expect(first.removeSpy).toHaveBeenCalledTimes(1);
  });

  it('removes the subscription on unmount', async () => {
    const { source, removeSpy } = createFakeSource({ playing: false });
    mount(ROOT_TAG, HostFixture);
    capturedHost?.source.set(source);
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
