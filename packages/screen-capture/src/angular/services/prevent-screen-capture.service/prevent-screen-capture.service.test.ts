// Angular twin of `../../react`'s `usePreventScreenCapture`, `connect()` shape matching
// `@symbiote-native/keep-awake`'s own `KeepAwakeService`

import '@angular/compiler';
import { Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { PreventScreenCaptureService } from './index';

const { preventScreenCaptureAsync, allowScreenCaptureAsync } = vi.hoisted(
  () => ({
    preventScreenCaptureAsync: vi.fn(),
    allowScreenCaptureAsync: vi.fn(),
  }),
);

vi.mock('../../../core', () => ({
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
}));

const ROOT_TAG = 1007;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'prevent-screen-capture-host',
  standalone: true,
  template: '',
})
class HostFixture {
  readonly service = inject(PreventScreenCaptureService);
  constructor() {
    this.service.connect('my-key');
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  preventScreenCaptureAsync.mockResolvedValue(undefined);
  allowScreenCaptureAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('PreventScreenCaptureService.connect (Positive: prevents on connect, allows on destroy)', () => {
  it('prevents screen capture with the given key', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    expect(preventScreenCaptureAsync).toHaveBeenCalledWith('my-key');
  });

  it('allows screen capture with the same key on destroy', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    unmount(ROOT_TAG);

    expect(allowScreenCaptureAsync).toHaveBeenCalledWith('my-key');
  });
});
