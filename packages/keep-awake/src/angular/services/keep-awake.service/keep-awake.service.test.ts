// Co-located Angular-driven test (ADR 0025) for KeepAwakeService. See battery's
// low-power-mode.service.test.ts for the shared rationale.
//
// Two host classes rather than one @Input-driven host: Angular sets @Input-bound properties
// AFTER construction, so a constructor-time `connect(this.tag)` read off an @Input would always
// see `undefined` — the same field-initializer/constructor timing every other service host in
// this repo relies on (see battery's own PermissionsHost/BatteryLevelHost).

import '@angular/compiler';
import { Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { KeepAwakeService } from './index';

const activateKeepAwakeAsyncMock = vi.fn(async (_tag: string) => undefined);
const addListenerMock = vi.fn();
const deactivateKeepAwakeMock = vi.fn(async (_tag: string) => undefined);

vi.mock('../../../core', () => ({
  activateKeepAwakeAsync: (tag: string) => activateKeepAwakeAsyncMock(tag),
  addListener: (...args: unknown[]) => addListenerMock(...args),
  deactivateKeepAwake: (tag: string) => deactivateKeepAwakeMock(tag),
}));

const ROOT_TAG = 974;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-keep-awake-default-host',
  standalone: true,
  template: '',
})
class KeepAwakeDefaultHost {
  constructor() {
    inject(KeepAwakeService).connect();
  }
}

@Component({
  selector: 'symbiote-keep-awake-custom-host',
  standalone: true,
  template: '',
})
class KeepAwakeCustomHost {
  constructor() {
    inject(KeepAwakeService).connect('custom-tag');
  }
}

beforeEach(() => {
  activateKeepAwakeAsyncMock.mockClear();
  addListenerMock.mockClear();
  deactivateKeepAwakeMock.mockClear();
  activateKeepAwakeAsyncMock.mockResolvedValue(undefined);
  deactivateKeepAwakeMock.mockResolvedValue(undefined);
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('KeepAwakeService.connect', () => {
  it('activates a default tag on mount', async () => {
    mount(ROOT_TAG, KeepAwakeDefaultHost);
    await tick();

    expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1);
    expect(typeof activateKeepAwakeAsyncMock.mock.calls[0][0]).toBe('string');
  });

  it('activates the explicit tag when one is given', async () => {
    mount(ROOT_TAG, KeepAwakeCustomHost);
    await tick();

    expect(activateKeepAwakeAsyncMock).toHaveBeenCalledWith('custom-tag');
  });

  it('deactivates the same tag when the host component is unmounted', async () => {
    mount(ROOT_TAG, KeepAwakeCustomHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(deactivateKeepAwakeMock).toHaveBeenCalledWith('custom-tag');
  });

  it('never touches addListener when no options are given', async () => {
    mount(ROOT_TAG, KeepAwakeCustomHost);
    await tick();

    expect(addListenerMock).not.toHaveBeenCalled();
  });
});
