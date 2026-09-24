// Co-located React-driven test (ADR 0025) for useAssets, ported from
// expo-asset/src/__tests__/AssetHooks-test.ts (sdk-57). Mocks `core`, not expo-modules-core
// internals — same pattern as packages/network's use-network-state.test.tsx.
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useAssets } from './index';

const STUB_MODULES = [1337, 2337];
const STUB_ASSETS = [
  { name: 'test-first', type: 'jpg', uri: 'non/existing' },
  { name: 'test-second', type: 'png', uri: 'non/existing' },
];

const { Asset } = vi.hoisted(() => ({
  Asset: { loadAsync: vi.fn(async () => STUB_ASSETS) },
}));
vi.mock('../../../core', () => ({ Asset }));

const ROOT_TAG = 954;
const results: [typeof STUB_ASSETS | undefined, Error | undefined][] = [];

function Probe(): ReactElement {
  results.push(useAssets(STUB_MODULES));
  return createElement('view');
}

const fabric = installRecordingFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  Asset.loadAsync.mockReset();
  Asset.loadAsync.mockResolvedValue(STUB_ASSETS);
});

afterEach(() => unmount(ROOT_TAG));

describe('useAssets — lifecycle (Positive)', () => {
  it('reports undefined assets before the load resolves', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1][0]).toBeUndefined();
  });

  it('reports the loaded assets once Asset.loadAsync resolves', async () => {
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() =>
      expect(results[results.length - 1][0]).toBe(STUB_ASSETS),
    );
  });

  it('never reloads on a changed module list — only the initial mount loads', async () => {
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() => expect(Asset.loadAsync).toHaveBeenCalledTimes(1));
    expect(Asset.loadAsync).toHaveBeenCalledWith(STUB_MODULES);
  });

  it('keeps the loaded assets in the last render after unmount', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() =>
      expect(results[results.length - 1][0]).toBe(STUB_ASSETS),
    );

    unmount(ROOT_TAG);

    expect(results[results.length - 1][0]).toBe(STUB_ASSETS);
  });
});

describe('useAssets — error path (Positive)', () => {
  it('reports the rejection reason as the error result', async () => {
    const error = new Error('load failed');
    Asset.loadAsync.mockRejectedValue(error);

    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() => expect(results[results.length - 1][1]).toBe(error));
  });
});
