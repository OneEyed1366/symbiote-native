// Ported from expo-font/src/FontUtils.ts's own contract (sdk-57 ships no dedicated FontUtils
// test) — the Android-only ExpoFontUtils.renderToImageAsync wrapper's guard and color-pipe.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const processColor = vi.fn((color: string) => `processed(${color})`);
vi.mock('react-native', () => ({ processColor }));

const renderToImageAsync = vi.fn(async () => ({
  uri: 'file:///cache/glyphs.png',
  width: 100,
  height: 40,
  scale: 2,
}));
const { nativeModule } = vi.hoisted(() => ({
  nativeModule: {
    current: undefined as
      { renderToImageAsync: typeof renderToImageAsync } | undefined,
  },
}));
vi.mock('./native-modules', () => ({
  get expoFontUtils() {
    return nativeModule.current;
  },
}));

const { renderToImageAsync: coreRenderToImageAsync } =
  await import('./font-utils');
const { UnavailabilityError } = await import('expo-modules-core');

afterEach(() => {
  vi.clearAllMocks();
});

describe('renderToImageAsync (Positive)', () => {
  nativeModule.current = { renderToImageAsync };

  it('processes the color option before forwarding to the native module', async () => {
    await coreRenderToImageAsync('Abc', {
      color: '#ff0000',
      fontFamily: 'Inter',
    });

    expect(processColor).toHaveBeenCalledWith('#ff0000');
    expect(renderToImageAsync).toHaveBeenCalledWith('Abc', {
      fontFamily: 'Inter',
      color: 'processed(#ff0000)',
    });
  });

  it('resolves with the native module result', async () => {
    await expect(coreRenderToImageAsync('Abc')).resolves.toEqual({
      uri: 'file:///cache/glyphs.png',
      width: 100,
      height: 40,
      scale: 2,
    });
  });
});

describe('renderToImageAsync (Negative — native module absent)', () => {
  it('rejects with UnavailabilityError when ExpoFontUtils is not present', async () => {
    nativeModule.current = undefined;

    await expect(coreRenderToImageAsync('Abc')).rejects.toBeInstanceOf(
      UnavailabilityError,
    );

    nativeModule.current = { renderToImageAsync };
  });
});
