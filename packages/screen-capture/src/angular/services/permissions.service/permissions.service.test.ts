// Angular twin of `@symbiote-native/brightness`'s `PermissionsService` test

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { PermissionsService } from './index';
import type { PermissionResponse } from '../../../core';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

vi.mock('../../../core', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
}));

const GRANTED: PermissionResponse = {
  granted: true,
  status: 'granted' as PermissionResponse['status'],
  canAskAgain: true,
  expires: 'never',
};

const ROOT_TAG = 1009;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedStatus: Signal<PermissionResponse | null> | undefined;
let capturedService: PermissionsService | undefined;

@Component({
  selector: 'screen-capture-permissions-host',
  standalone: true,
  template: '',
})
class Host {
  readonly service = inject(PermissionsService);
  readonly status = this.service.connect();
  constructor() {
    capturedStatus = this.status;
    capturedService = this.service;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedStatus = undefined;
  capturedService = undefined;
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('PermissionsService.connect (Positive: auto-fetches once)', () => {
  it('reports null before the initial fetch resolves', () => {
    mount(ROOT_TAG, Host);

    expect(capturedStatus?.()).toBeNull();
  });

  it('reports the fetched status once getPermissionsAsync resolves', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedStatus?.()).toEqual(GRANTED);
  });
});

describe('PermissionsService.connect (Negative: an auto-fetch failure surfaces as error)', () => {
  it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
    getPermissionsAsync.mockRejectedValueOnce(
      new Error('permission query failed'),
    );

    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedService?.error()?.message).toBe('permission query failed');
    expect(capturedStatus?.()).toBeNull();
  });
});
