// Общий `connect()`/`get()`/`request()`/`error` для сервисов разрешений всех Expo-пакетов

import '@angular/compiler';
import { Component, inject, Injectable, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { PermissionsServiceBase } from './permissions-service-base';

type IFakePermission = { granted: boolean };

const getMethod = vi.fn<(writeOnly?: boolean) => Promise<IFakePermission>>();
const requestMethod =
  vi.fn<(writeOnly?: boolean) => Promise<IFakePermission>>();

@Injectable({ providedIn: 'root' })
class FakePermissionsService extends PermissionsServiceBase<
  IFakePermission,
  boolean
> {
  constructor() {
    super(getMethod, requestMethod);
  }
}

const ROOT_TAG = 90_301;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedStatus: Signal<IFakePermission | null> | undefined;
let capturedService: FakePermissionsService | undefined;

@Component({
  selector: 'permissions-service-host',
  standalone: true,
  template: '',
})
class Host {
  readonly service = inject(FakePermissionsService);
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
  getMethod.mockResolvedValue({ granted: false });
  requestMethod.mockResolvedValue({ granted: true });
});

afterEach(() => unmount(ROOT_TAG));

describe('PermissionsServiceBase (Positive: auto-fetches once, get/request update the signal)', () => {
  it('reports null before the initial fetch resolves', () => {
    mount(ROOT_TAG, Host);

    expect(capturedStatus?.()).toBeNull();
  });

  it('reports the fetched status once the getter resolves', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedStatus?.()).toEqual({ granted: false });
    expect(getMethod).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch on a second connect() once the auto-fetch started', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    capturedService?.connect();
    await tick();

    expect(getMethod).toHaveBeenCalledTimes(1);
  });

  it('request() updates the signal with the granted response', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    await capturedService?.request();

    expect(capturedStatus?.()).toEqual({ granted: true });
  });

  it('forwards the method options to get() and request()', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    await capturedService?.get(true);
    await capturedService?.request(true);

    expect(getMethod).toHaveBeenLastCalledWith(true);
    expect(requestMethod).toHaveBeenLastCalledWith(true);
  });
});

describe('PermissionsServiceBase (Negative: an auto-fetch failure surfaces as error, not an unhandled rejection)', () => {
  it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
    getMethod.mockRejectedValueOnce(new Error('permission query failed'));

    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedService?.error()?.message).toBe('permission query failed');
    expect(capturedStatus?.()).toBeNull();
  });

  it('clears `error` after the next successful request()', async () => {
    getMethod.mockRejectedValueOnce(new Error('permission query failed'));
    mount(ROOT_TAG, Host);
    await tick();

    await capturedService?.request();

    expect(capturedService?.error()).toBeNull();
  });
});
