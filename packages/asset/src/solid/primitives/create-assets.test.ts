// Co-located Solid-driven test (ADR 0025) for createAssets, the Solid twin of
// react/hooks/use-assets and vue/composables/use-assets. Driven with `createRoot` + an
// explicit dispose — this primitive renders nothing, so a root is the whole owner it needs.
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssets } from './create-assets';

const STUB_MODULES = [1337, 2337];
const STUB_ASSETS = [
  { name: 'test-first', type: 'jpg', uri: 'non/existing' },
  { name: 'test-second', type: 'png', uri: 'non/existing' },
];

const { Asset } = vi.hoisted(() => ({
  Asset: { loadAsync: vi.fn(async () => STUB_ASSETS) },
}));
vi.mock('../../core', () => ({ Asset }));

function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

let disposeRoot: (() => void) | undefined;

beforeEach(() => {
  Asset.loadAsync.mockClear();
  Asset.loadAsync.mockResolvedValue(STUB_ASSETS);
});

afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
});

describe('createAssets (Solid) — lifecycle (Positive)', () => {
  it('starts undefined before the load resolves', () => {
    Asset.loadAsync.mockReturnValue(new Promise<typeof STUB_ASSETS>(() => {}));
    const { value: result, dispose } = inRoot(() => createAssets(STUB_MODULES));
    disposeRoot = dispose;

    expect(result.assets()).toBeUndefined();
  });

  it('updates to the loaded assets once Asset.loadAsync resolves', async () => {
    const { value: result, dispose } = inRoot(() => createAssets(STUB_MODULES));
    disposeRoot = dispose;

    await vi.waitFor(() => expect(result.assets()).toBe(STUB_ASSETS));
    expect(Asset.loadAsync).toHaveBeenCalledWith(STUB_MODULES);
  });
});

describe('createAssets (Solid) — error path (Positive)', () => {
  it('reports the rejection reason via the error accessor', async () => {
    const error = new Error('load failed');
    Asset.loadAsync.mockRejectedValue(error);

    const { value: result, dispose } = inRoot(() => createAssets(STUB_MODULES));
    disposeRoot = dispose;

    await vi.waitFor(() => expect(result.error()).toBe(error));
  });
});
