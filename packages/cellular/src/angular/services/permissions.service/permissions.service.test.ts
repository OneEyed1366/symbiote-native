// Co-located Angular-driven test (ADR 0025) for PermissionsService. See
// packages/battery/src/angular/services/battery-state.service/battery-state.service.test.ts for
// the shared rationale, adapted here to test the get/request permission pair instead of a
// listener subscription.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { PermissionsService } from './index';

type IPermissionResponse = {
  status: string;
  expires: 'never';
  granted: boolean;
  canAskAgain: boolean;
};

const GRANTED: IPermissionResponse = {
  status: 'granted',
  expires: 'never',
  granted: true,
  canAskAgain: true,
};
const DENIED: IPermissionResponse = {
  status: 'denied',
  expires: 'never',
  granted: false,
  canAskAgain: true,
};

const getPermissionsAsyncMock = vi.fn(async () => GRANTED);
const requestPermissionsAsyncMock = vi.fn(async () => GRANTED);

vi.mock('../../../core', () => ({
  getPermissionsAsync: () => getPermissionsAsyncMock(),
  requestPermissionsAsync: () => requestPermissionsAsyncMock(),
}));

const ROOT_TAG = 973;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<IPermissionResponse | null> | undefined;
let capturedService: PermissionsService | undefined;

@Component({
  selector: 'symbiote-permissions-host',
  standalone: true,
  template: '',
})
class PermissionsHost {
  private readonly service = inject(PermissionsService);
  readonly status = this.service.connect();

  constructor() {
    capturedResult = this.status;
    capturedService = this.service;
  }
}

beforeEach(() => {
  fabric.reset();
  capturedResult = undefined;
  capturedService = undefined;
  getPermissionsAsyncMock.mockClear();
  requestPermissionsAsyncMock.mockClear();
  getPermissionsAsyncMock.mockResolvedValue(GRANTED);
  requestPermissionsAsyncMock.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

describe('PermissionsService.connect', () => {
  it('starts at null before the initial get() resolves', () => {
    mount(ROOT_TAG, PermissionsHost);

    expect(capturedResult?.()).toBeNull();
  });

  it('fetches the permission status once connect() is called', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    expect(capturedResult?.()).toEqual(GRANTED);
    expect(getPermissionsAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('request() re-fetches and updates the signal', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    requestPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
    await capturedService?.request();

    expect(capturedResult?.()).toEqual(DENIED);
  });

  it('get() re-fetches and updates the signal', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    getPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
    await capturedService?.get();

    expect(capturedResult?.()).toEqual(DENIED);
  });
});
