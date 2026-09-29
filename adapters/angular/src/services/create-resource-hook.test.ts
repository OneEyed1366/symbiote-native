// Every `useReleasingSharedObject`-style `injectX` (`injectAudioPlayer`, `injectImageManipulator`,
// ...) binds this to its own `createXController()` instead of repeating the signal/effect wiring

import '@angular/compiler';
import { Component, signal, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createResourceHook } from './create-resource-hook';

type IFakeResource = { key: string; dispose: ReturnType<typeof vi.fn> };

const create = vi.fn();
const dispose = vi.fn();

function createController(): {
  resolve: (key: string) => IFakeResource;
  flushDispose: () => void;
  dispose: () => void;
} {
  let current: { key: string; resource: IFakeResource } | null = null;
  let pending: IFakeResource | null = null;
  return {
    resolve: (key: string) => {
      if (current && current.key === key) return current.resource;
      if (current) pending = current.resource;
      const resource = create(key);
      current = { key, resource };
      return resource;
    },
    flushDispose: () => {
      if (pending) {
        dispose(pending);
        pending = null;
      }
    },
    dispose: () => {
      if (current) {
        dispose(current.resource);
        current = null;
      }
    },
  };
}

const injectResource = createResourceHook(createController);

const ROOT_TAG = 90_204;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({ selector: 'resource-host', standalone: true, template: '' })
class HostFixture {
  readonly key = signal('a');
  readonly resource: Signal<IFakeResource> = injectResource(() => [this.key()]);
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedHost = undefined;
  create.mockImplementation((k: string) => ({ key: k, dispose: vi.fn() }));
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createResourceHook (Positive: creates once, recreates on key change, disposes the stale one)', () => {
  it('creates a resource for the initial key', () => {
    mount(ROOT_TAG, HostFixture);

    expect(create).toHaveBeenCalledWith('a');
    expect(capturedHost?.resource().key).toBe('a');
  });

  it('recreates and disposes the stale resource when the key changes', async () => {
    mount(ROOT_TAG, HostFixture);
    const stale = capturedHost?.resource();

    capturedHost?.key.set('b');
    await tick();

    expect(capturedHost?.resource()).not.toBe(stale);
    expect(dispose).toHaveBeenCalledWith(stale);
  });

  it('disposes the current resource on unmount', () => {
    mount(ROOT_TAG, HostFixture);
    const current = capturedHost?.resource();

    unmount(ROOT_TAG);

    expect(dispose).toHaveBeenCalledWith(current);
  });
});
