// Co-located Angular-driven test (ADR 0025) for AssetsService, the Angular twin of
// react/hooks/use-assets and vue/composables/use-assets. Mocks `core` wholesale.
import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { AssetsService } from './index';

const STUB_MODULES = [1337, 2337];
const STUB_ASSETS = [
  { name: 'test-first', type: 'jpg', uri: 'non/existing' },
  { name: 'test-second', type: 'png', uri: 'non/existing' },
];

const { Asset } = vi.hoisted(() => ({
  Asset: { loadAsync: vi.fn(async () => STUB_ASSETS) },
}));
vi.mock('../../../core', () => ({ Asset }));

const ROOT_TAG = 975;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedAssets: Signal<typeof STUB_ASSETS | undefined> | undefined;
let capturedError: Signal<Error | undefined> | undefined;

@Component({
  selector: 'symbiote-assets-host',
  standalone: true,
  template: '',
})
class AssetsHost {
  private readonly connected = inject(AssetsService).connect(STUB_MODULES);

  constructor() {
    capturedAssets = this.connected.assets;
    capturedError = this.connected.error;
  }
}

beforeEach(() => {
  capturedAssets = undefined;
  capturedError = undefined;
  Asset.loadAsync.mockClear();
  Asset.loadAsync.mockResolvedValue(STUB_ASSETS);
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
});

describe('AssetsService.connect — lifecycle (Positive)', () => {
  it('reports undefined before the load resolves', () => {
    mount(ROOT_TAG, AssetsHost);

    expect(capturedAssets?.()).toBeUndefined();
  });

  it('reports the loaded assets once Asset.loadAsync resolves', async () => {
    mount(ROOT_TAG, AssetsHost);
    await tick();

    expect(capturedAssets?.()).toBe(STUB_ASSETS);
    expect(Asset.loadAsync).toHaveBeenCalledWith(STUB_MODULES);
  });
});

describe('AssetsService.connect — error path (Positive)', () => {
  it('reports the rejection reason via the error signal', async () => {
    const error = new Error('load failed');
    Asset.loadAsync.mockRejectedValue(error);

    mount(ROOT_TAG, AssetsHost);
    await tick();

    expect(capturedError?.()).toBe(error);
  });
});
