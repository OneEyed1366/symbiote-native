// Co-located Solid-driven test (ADR 0025) for createFonts, the Solid twin of
// react/hooks/use-fonts and vue/composables/use-fonts. Driven with `createRoot` + an explicit
// dispose — this primitive renders nothing, so a root is the whole owner it needs.
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFonts } from './create-fonts';

const STUB_FONTS = {
  'OpenSans-Regular': 'path/to/font.ttf',
  'ComicSans-Regular': 'path/to/jailed/font.ttf',
};

const { loadAsync, isFontMapLoaded } = vi.hoisted(() => ({
  loadAsync: vi.fn(async () => {}),
  isFontMapLoaded: vi.fn(() => false),
}));
vi.mock('../../core', () => ({ loadAsync, isFontMapLoaded }));

function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

let disposeRoot: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  loadAsync.mockResolvedValue(undefined);
  isFontMapLoaded.mockReturnValue(false);
});

afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
});

describe('createFonts (Solid) — lifecycle (Positive)', () => {
  it('seeds loaded=false when isFontMapLoaded reports not-yet-loaded', () => {
    const { value: result, dispose } = inRoot(() => createFonts(STUB_FONTS));
    disposeRoot = dispose;

    expect(result.loaded()).toBe(false);
    expect(result.error()).toBeNull();
  });

  it('seeds loaded=true synchronously when every font is already loaded', () => {
    isFontMapLoaded.mockReturnValue(true);
    const { value: result, dispose } = inRoot(() => createFonts(STUB_FONTS));
    disposeRoot = dispose;

    expect(result.loaded()).toBe(true);
  });

  it('updates to loaded once loadAsync resolves', async () => {
    const { value: result, dispose } = inRoot(() => createFonts(STUB_FONTS));
    disposeRoot = dispose;

    await vi.waitFor(() => expect(result.loaded()).toBe(true));
    expect(loadAsync).toHaveBeenCalledWith(STUB_FONTS);
  });
});

describe('createFonts (Solid) — error path (Positive)', () => {
  it('reports the rejection reason via the error accessor', async () => {
    const error = new Error('font load failed');
    loadAsync.mockRejectedValue(error);

    const { value: result, dispose } = inRoot(() => createFonts(STUB_FONTS));
    disposeRoot = dispose;

    await vi.waitFor(() => expect(result.error()).toBe(error));
  });
});
