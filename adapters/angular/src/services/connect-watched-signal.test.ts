// A signal fed by a `watch` subscription that lives as long as the injector's owner

import '@angular/compiler';
import { Component, inject, Injector, type Signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { connectWatchedSignal } from './connect-watched-signal';

const ROOT_TAG = 90_305;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const stop = vi.fn();
let push: ((value: number) => void) | undefined;
let captured: Signal<number> | undefined;

@Component({ selector: 'watched-signal-host', standalone: true, template: '' })
class HostFixture {
  constructor() {
    captured = connectWatchedSignal(inject(Injector), 0, set => {
      push = set;
      return stop;
    });
  }
}

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
  push = undefined;
  captured = undefined;
});

describe('connectWatchedSignal', () => {
  it('starts at the initial value', () => {
    mount(ROOT_TAG, HostFixture);

    expect(captured?.()).toBe(0);
  });

  it('follows the values the watcher pushes', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    push?.(7);

    expect(captured?.()).toBe(7);
  });

  it('runs the returned stop when the host is destroyed', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(stop).toHaveBeenCalledOnce();
  });
});
