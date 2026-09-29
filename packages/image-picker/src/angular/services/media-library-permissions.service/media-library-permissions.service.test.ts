// Angular twin of `../../react`'s `useMediaLibraryPermissions`

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { MediaLibraryPermissionsService } from './index';
import type { IMediaLibraryPermissionResponse } from '../../../core';

const { getMediaLibraryPermissionsAsync, requestMediaLibraryPermissionsAsync } =
  vi.hoisted(() => ({
    getMediaLibraryPermissionsAsync: vi.fn(),
    requestMediaLibraryPermissionsAsync: vi.fn(),
  }));

vi.mock('../../../core', () => ({
  getMediaLibraryPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
}));

const GRANTED: IMediaLibraryPermissionResponse = {
  granted: true,
  status: 'granted' as IMediaLibraryPermissionResponse['status'],
  canAskAgain: true,
  expires: 'never',
  accessPrivileges: 'all',
};
const DENIED: IMediaLibraryPermissionResponse = {
  ...GRANTED,
  granted: false,
  status: 'denied' as IMediaLibraryPermissionResponse['status'],
  accessPrivileges: 'none',
};

const ROOT_TAG = 993;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedStatus: Signal<IMediaLibraryPermissionResponse | null> | undefined;
let capturedService: MediaLibraryPermissionsService | undefined;

@Component({
  selector: 'media-library-permissions-host',
  standalone: true,
  template: '',
})
class Host {
  readonly service = inject(MediaLibraryPermissionsService);
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
  getMediaLibraryPermissionsAsync.mockResolvedValue(DENIED);
  requestMediaLibraryPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('MediaLibraryPermissionsService.connect (Positive: auto-fetches once, forwards writeOnly)', () => {
  it('reports null before the initial fetch resolves', () => {
    mount(ROOT_TAG, Host);

    expect(capturedStatus?.()).toBeNull();
  });

  it('reports the fetched status once getMediaLibraryPermissionsAsync resolves', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    expect(getMediaLibraryPermissionsAsync).toHaveBeenCalledWith(undefined);
    expect(capturedStatus?.()).toEqual(DENIED);
  });

  it('forwards writeOnly to get()/request() when set', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    await capturedService?.get(true);
    await capturedService?.request(true);

    expect(getMediaLibraryPermissionsAsync).toHaveBeenCalledWith(true);
    expect(requestMediaLibraryPermissionsAsync).toHaveBeenCalledWith(true);
  });
});

describe('MediaLibraryPermissionsService.connect (Negative: an auto-fetch failure surfaces as error)', () => {
  it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
    getMediaLibraryPermissionsAsync.mockRejectedValueOnce(
      new Error('permission query failed'),
    );

    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedService?.error()?.message).toBe('permission query failed');
    expect(capturedStatus?.()).toBeNull();
  });
});
