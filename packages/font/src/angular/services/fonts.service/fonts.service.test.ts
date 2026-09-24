// Co-located Angular-driven test (ADR 0025) for FontsService, the Angular twin of
// react/hooks/use-fonts and vue/composables/use-fonts. Mocks `core` wholesale.
import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { FontsService } from './index';

const STUB_FONTS = {
  'OpenSans-Regular': 'path/to/font.ttf',
  'ComicSans-Regular': 'path/to/jailed/font.ttf',
};

const { loadAsync, isFontMapLoaded } = vi.hoisted(() => ({
  loadAsync: vi.fn(async () => {}),
  isFontMapLoaded: vi.fn(() => false),
}));
vi.mock('../../../core', () => ({ loadAsync, isFontMapLoaded }));

const ROOT_TAG = 976;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedLoaded: Signal<boolean> | undefined;
let capturedError: Signal<Error | null> | undefined;

@Component({
  selector: 'symbiote-fonts-host',
  standalone: true,
  template: '',
})
class FontsHost {
  private readonly connected = inject(FontsService).connect(STUB_FONTS);

  constructor() {
    capturedLoaded = this.connected.loaded;
    capturedError = this.connected.error;
  }
}

beforeEach(() => {
  capturedLoaded = undefined;
  capturedError = undefined;
  vi.clearAllMocks();
  loadAsync.mockResolvedValue(undefined);
  isFontMapLoaded.mockReturnValue(false);
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
});

describe('FontsService.connect — lifecycle (Positive)', () => {
  it('seeds loaded=false when isFontMapLoaded reports not-yet-loaded', () => {
    mount(ROOT_TAG, FontsHost);

    expect(capturedLoaded?.()).toBe(false);
    expect(capturedError?.()).toBeNull();
  });

  it('seeds loaded=true synchronously when every font is already loaded', () => {
    isFontMapLoaded.mockReturnValue(true);

    mount(ROOT_TAG, FontsHost);

    expect(capturedLoaded?.()).toBe(true);
  });

  it('updates to loaded once loadAsync resolves', async () => {
    mount(ROOT_TAG, FontsHost);
    await tick();

    expect(capturedLoaded?.()).toBe(true);
    expect(loadAsync).toHaveBeenCalledWith(STUB_FONTS);
  });
});

describe('FontsService.connect — error path (Positive)', () => {
  it('reports the rejection reason via the error signal', async () => {
    const error = new Error('font load failed');
    loadAsync.mockRejectedValue(error);

    mount(ROOT_TAG, FontsHost);
    await tick();

    expect(capturedError?.()).toBe(error);
  });
});
