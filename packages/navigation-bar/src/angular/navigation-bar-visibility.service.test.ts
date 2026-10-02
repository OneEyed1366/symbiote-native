// Angular twin of the `../react`/`../vue`/`../solid`/`../svelte` visibility hook tests, DI shape
// matching `ColorSchemeService`

import '@angular/compiler';
import { Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { INavigationBarVisibilityEvent } from '../core';

const { addVisibilityListener, getVisibilityAsync } = vi.hoisted(() => ({
  addVisibilityListener: vi.fn(),
  getVisibilityAsync: vi.fn(),
}));

vi.mock('../core', () => ({ addVisibilityListener, getVisibilityAsync }));

const { NavigationBarVisibilityService } =
  await import('./navigation-bar-visibility.service');

const ROOT_TAG = 985;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedService:
  InstanceType<typeof NavigationBarVisibilityService> | undefined;
let capturedListener:
  ((event: INavigationBarVisibilityEvent) => void) | undefined;
let removeListenerSpy: ReturnType<typeof vi.fn>;

@Component({
  selector: 'navigation-bar-visibility-consumer',
  standalone: true,
  providers: [NavigationBarVisibilityService],
  template: '',
})
class Consumer {
  readonly service = inject(NavigationBarVisibilityService);
  constructor() {
    capturedService = this.service;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedService = undefined;
  removeListenerSpy = vi.fn();
  getVisibilityAsync.mockResolvedValue('visible');
  addVisibilityListener.mockImplementation(
    (listener: typeof capturedListener) => {
      capturedListener = listener;
      return { remove: removeListenerSpy };
    },
  );
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('NavigationBarVisibilityService (Positive: resolves, tracks, and cleans up)', () => {
  it('starts null and resolves the initial visibility', async () => {
    mount(ROOT_TAG, Consumer);
    expect(capturedService?.visibility()).toBeNull();

    await tick();

    expect(capturedService?.visibility()).toBe('visible');
  });

  it('updates when the listener fires', async () => {
    mount(ROOT_TAG, Consumer);
    await tick();

    capturedListener?.({ visibility: 'hidden', rawVisibility: 0 });
    await tick();

    expect(capturedService?.visibility()).toBe('hidden');
  });

  it('removes the listener on unmount', async () => {
    mount(ROOT_TAG, Consumer);
    await tick();

    unmount(ROOT_TAG);

    expect(removeListenerSpy).toHaveBeenCalledTimes(1);
  });
});
