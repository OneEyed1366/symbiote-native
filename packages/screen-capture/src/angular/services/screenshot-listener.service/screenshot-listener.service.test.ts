// Angular twin of `../../react`'s `useScreenshotListener`, `connect()` shape matching
// `@symbiote-native/keep-awake`'s own `KeepAwakeService`

import '@angular/compiler';
import { Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { ScreenshotListenerService } from './index';

const { addScreenshotListener } = vi.hoisted(() => ({
  addScreenshotListener: vi.fn(),
}));

vi.mock('../../../core', () => ({ addScreenshotListener }));

const ROOT_TAG = 1008;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let removeSpy: ReturnType<typeof vi.fn>;
const listenerSpy = vi.fn();

@Component({
  selector: 'screenshot-listener-host',
  standalone: true,
  template: '',
})
class HostFixture {
  readonly service = inject(ScreenshotListenerService);
  constructor() {
    this.service.connect(listenerSpy);
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  removeSpy = vi.fn();
  addScreenshotListener.mockReturnValue({ remove: removeSpy });
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('ScreenshotListenerService.connect (Positive: subscribes on connect, unsubscribes on destroy)', () => {
  it('subscribes the given listener', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    expect(addScreenshotListener).toHaveBeenCalledWith(listenerSpy);
  });

  it('removes the subscription on destroy', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
