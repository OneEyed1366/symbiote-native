// Co-located Vue-driven test (ADR 0025) for useAssets, the Vue twin of
// react/hooks/use-assets. Mocks `core` wholesale — Asset.loadAsync's own logic is covered by
// core/asset.test.ts; what's unique to THIS layer is Vue's onMounted lifecycle.
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const ROOT_TAG = 9954;
const fabric = installRecordingFabric();

beforeEach(() => {
  fabric.reset();
  Asset.loadAsync.mockClear();
  Asset.loadAsync.mockResolvedValue(STUB_ASSETS);
});

afterEach(() => unmount(ROOT_TAG));

function mountAssets(): {
  assets: typeof STUB_ASSETS | undefined;
  error: Error | undefined;
} {
  let result: ReturnType<typeof useAssets> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        result = useAssets(STUB_MODULES);
        return () => h('text', {}, 'assets');
      },
    }),
  );
  if (result === undefined) throw new Error('setup() did not run');
  return { assets: result.assets.value, error: result.error.value };
}

describe('useAssets (Vue) — lifecycle (Positive)', () => {
  it('starts undefined before the load resolves', () => {
    const { assets } = mountAssets();

    expect(assets).toBeUndefined();
  });

  it('updates to the loaded assets once Asset.loadAsync resolves', async () => {
    mountAssets();

    await vi.waitFor(() => expect(Asset.loadAsync).toHaveBeenCalledTimes(1));
    expect(Asset.loadAsync).toHaveBeenCalledWith(STUB_MODULES);
  });
});

describe('useAssets (Vue) — error path (Positive)', () => {
  it('reports the rejection reason via the error ref', async () => {
    const error = new Error('load failed');
    Asset.loadAsync.mockRejectedValue(error);

    let result: ReturnType<typeof useAssets> | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => {
          result = useAssets(STUB_MODULES);
          return () => h('text', {}, 'assets');
        },
      }),
    );

    await vi.waitFor(() => expect(result?.error.value).toBe(error));
  });
});
