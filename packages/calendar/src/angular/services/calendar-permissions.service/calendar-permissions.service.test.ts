// Angular twin of `../../react`'s `useCalendarPermissions`, DI shape matching
// `@symbiote-native/image-picker`'s `MediaLibraryPermissionsService`

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { CalendarPermissionsService } from './index';
import type { PermissionResponse } from 'expo-modules-core';

const { getCalendarPermissions, requestCalendarPermissions } = vi.hoisted(
  () => ({
    getCalendarPermissions: vi.fn(),
    requestCalendarPermissions: vi.fn(),
  }),
);

vi.mock('../../../core/calendar', () => ({
  getCalendarPermissions,
  requestCalendarPermissions,
}));

const GRANTED: PermissionResponse = {
  granted: true,
  status: 'granted' as PermissionResponse['status'],
  canAskAgain: true,
  expires: 'never',
};
const DENIED: PermissionResponse = {
  ...GRANTED,
  granted: false,
  status: 'denied' as PermissionResponse['status'],
};

const ROOT_TAG = 1107;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedStatus: Signal<PermissionResponse | null> | undefined;
let capturedService: CalendarPermissionsService | undefined;

@Component({
  selector: 'calendar-permissions-host',
  standalone: true,
  template: '',
})
class Host {
  readonly service = inject(CalendarPermissionsService);
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
  getCalendarPermissions.mockResolvedValue(DENIED);
  requestCalendarPermissions.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('CalendarPermissionsService.connect (Positive: auto-fetches once, forwards writeOnly)', () => {
  it('reports the fetched status once getCalendarPermissions resolves', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedStatus?.()).toEqual(DENIED);
    expect(getCalendarPermissions).toHaveBeenCalledWith(undefined);
  });

  it('forwards writeOnly through request()', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    await capturedService?.request(true);

    expect(requestCalendarPermissions).toHaveBeenCalledWith(true);
    expect(capturedStatus?.()).toEqual(GRANTED);
  });
});

describe('CalendarPermissionsService.connect (Negative: an auto-fetch failure surfaces as error)', () => {
  it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
    getCalendarPermissions.mockRejectedValueOnce(
      new Error('permission query failed'),
    );

    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedService?.error()?.message).toBe('permission query failed');
    expect(capturedStatus?.()).toBeNull();
  });
});
