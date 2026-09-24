// Co-located React-driven test (ADR 0025) for useFonts, ported from
// expo-font/src/__tests__/FontHooks-test.ts's "runtime fonts" describe (sdk-57) — this repo
// has no static/SSR render path, so only the runtime branch applies.
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useFonts } from './index';

const STUB_FONTS = {
  'OpenSans-Regular': 'path/to/font.ttf',
  'ComicSans-Regular': 'path/to/jailed/font.ttf',
};

const { loadAsync, isFontMapLoaded } = vi.hoisted(() => ({
  loadAsync: vi.fn(async () => {}),
  isFontMapLoaded: vi.fn(() => false),
}));
vi.mock('../../../core', () => ({ loadAsync, isFontMapLoaded }));

const ROOT_TAG = 955;
const results: [boolean, Error | null][] = [];

function Probe(): ReactElement {
  results.push(useFonts(STUB_FONTS));
  return createElement('view');
}

const fabric = installRecordingFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
  loadAsync.mockResolvedValue(undefined);
  isFontMapLoaded.mockReturnValue(false);
});

afterEach(() => unmount(ROOT_TAG));

describe('useFonts — lifecycle (Positive)', () => {
  it('reports not-loaded before the first mount seed check finds it loaded', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toEqual([false, null]);
  });

  it('seeds loaded=true synchronously when every font is already loaded', () => {
    isFontMapLoaded.mockReturnValue(true);

    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toEqual([true, null]);
  });

  it('reports loaded once loadAsync resolves', async () => {
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() =>
      expect(results[results.length - 1]).toEqual([true, null]),
    );
    expect(loadAsync).toHaveBeenCalledWith(STUB_FONTS);
  });

  it('keeps loaded=true in the last render after unmount', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() =>
      expect(results[results.length - 1]).toEqual([true, null]),
    );

    unmount(ROOT_TAG);

    expect(results[results.length - 1]).toEqual([true, null]);
  });

  it('reports the rejection reason as the error result', async () => {
    const error = new Error('font load failed');
    loadAsync.mockRejectedValue(error);

    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() =>
      expect(results[results.length - 1]).toEqual([false, error]),
    );
  });
});
