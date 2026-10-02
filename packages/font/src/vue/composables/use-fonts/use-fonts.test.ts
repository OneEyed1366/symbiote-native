// Co-located Vue-driven test (ADR 0025) for useFonts, the Vue twin of react/hooks/use-fonts.
// Mocks `core` wholesale — loadAsync/isFontMapLoaded's own logic is covered by core/font.test.ts;
// what's unique to THIS layer is Vue's onMounted lifecycle.
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const ROOT_TAG = 9955;
const fabric = installRecordingFabric();

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  loadAsync.mockResolvedValue(undefined);
  isFontMapLoaded.mockReturnValue(false);
});

afterEach(() => unmount(ROOT_TAG));

function mountFonts(): { loaded: boolean; error: Error | null } {
  let result: ReturnType<typeof useFonts> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        result = useFonts(STUB_FONTS);
        return () => h('text', {}, 'fonts');
      },
    }),
  );
  if (result === undefined) throw new Error('setup() did not run');
  return { loaded: result.loaded.value, error: result.error.value };
}

describe('useFonts (Vue) — lifecycle (Positive)', () => {
  it('seeds loaded=false when isFontMapLoaded reports not-yet-loaded', () => {
    const { loaded, error } = mountFonts();

    expect(loaded).toBe(false);
    expect(error).toBeNull();
  });

  it('seeds loaded=true synchronously when every font is already loaded', () => {
    isFontMapLoaded.mockReturnValue(true);

    const { loaded } = mountFonts();

    expect(loaded).toBe(true);
  });

  it('updates to loaded once loadAsync resolves', async () => {
    let result: ReturnType<typeof useFonts> | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => {
          result = useFonts(STUB_FONTS);
          return () => h('text', {}, 'fonts');
        },
      }),
    );

    await vi.waitFor(() => expect(result?.loaded.value).toBe(true));
    expect(loadAsync).toHaveBeenCalledWith(STUB_FONTS);
  });
});

describe('useFonts (Vue) — error path (Positive)', () => {
  it('reports the rejection reason via the error ref', async () => {
    const error = new Error('font load failed');
    loadAsync.mockRejectedValue(error);

    let result: ReturnType<typeof useFonts> | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => {
          result = useFonts(STUB_FONTS);
          return () => h('text', {}, 'fonts');
        },
      }),
    );

    await vi.waitFor(() => expect(result?.error.value).toBe(error));
  });
});
