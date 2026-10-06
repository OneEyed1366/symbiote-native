// Ядро `SymbolView`, порт expo-symbols: нативный view на iOS, шрифт Material Symbols на Android

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformColor, processColor } from '@symbiote-native/engine';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const loadAsync = vi.hoisted(() => vi.fn());
const renderToImageAsync = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
}));
vi.mock('@symbiote-native/font', () => ({ loadAsync, renderToImageAsync }));
vi.mock('@expo-google-fonts/material-symbols/400Regular', () => ({
  MaterialSymbols_400Regular: 400,
}));
vi.mock('@expo-google-fonts/material-symbols/700Bold', () => ({
  MaterialSymbols_700Bold: 700,
}));

const {
  SYMBOL_MODULE_NAME,
  ensureSymbolRegistered,
  loadSymbolFont,
  renderSymbolView,
  symbolViewName,
  unstable_getMaterialSymbolSourceAsync,
  watchSymbolFont,
} = await import('./symbols');
const { default: bold } = await import('./android/weights/bold');

const NATIVE_VIEW = 'ViewManagerAdapter_SymbolModule';
const HOME_GLYPH = String.fromCharCode(59530);
const REGULAR_FONT = 'MaterialSymbols_400Regular';

beforeEach(() => {
  vi.restoreAllMocks();
  requireNativeViewManager.mockReset();
  loadAsync.mockReset().mockResolvedValue(undefined);
  renderToImageAsync.mockReset();
  platform.OS = 'ios';
  Reflect.deleteProperty(globalThis, 'expo');
});

describe('registration', () => {
  it('names the single view after the module and registers it', () => {
    expect(SYMBOL_MODULE_NAME).toBe('SymbolModule');
    expect(symbolViewName()).toBe(NATIVE_VIEW);
    expect(ensureSymbolRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith('SymbolModule');
  });
});

describe('renderSymbolView on iOS (Positive)', () => {
  it('is the native view with defaults for type, size and animation', () => {
    const descriptor = renderSymbolView({ name: 'star.fill' }, false);

    expect(descriptor).toMatchObject({
      type: NATIVE_VIEW,
      props: {
        name: 'star.fill',
        type: 'monochrome',
        animated: false,
        colors: [],
        style: { width: 24, height: 24 },
      },
    });
  });

  it('reads the iOS entries of per-platform name and weight', () => {
    const descriptor = renderSymbolView(
      {
        name: { ios: 'star.fill', android: 'home' },
        weight: { ios: 'bold', android: bold },
      },
      false,
    );

    expect(descriptor?.props).toMatchObject({
      name: 'star.fill',
      weight: 'bold',
    });
  });

  it('puts the size before the author style', () => {
    const style = { opacity: 0.5 };

    const descriptor = renderSymbolView({ name: 'a', size: 40, style }, false);

    expect(descriptor?.props.style).toEqual([{ width: 40, height: 40 }, style]);
  });

  it('processes the tint and every palette color', () => {
    const descriptor = renderSymbolView(
      { name: 'a', tintColor: 'red', colors: ['blue', 'green'] },
      false,
    );

    expect(descriptor?.props.tint).toBe(processColor('red'));
    expect(descriptor?.props.colors).toEqual([
      processColor('blue'),
      processColor('green'),
    ]);
    expect(descriptor?.props).not.toHaveProperty('tintColor');
  });

  it('wraps a single color into a one-element palette', () => {
    const descriptor = renderSymbolView({ name: 'a', colors: 'blue' }, false);

    expect(descriptor?.props.colors).toEqual([processColor('blue')]);
  });

  it('marks the symbol animated when an animation spec is given', () => {
    const animationSpec = { effect: { type: 'bounce' }, repeating: true };

    const descriptor = renderSymbolView({ name: 'a', animationSpec }, false);

    expect(descriptor?.props).toMatchObject({ animated: true, animationSpec });
  });

  it('forwards the scale, resize mode and view props untouched', () => {
    const descriptor = renderSymbolView(
      { name: 'a', scale: 'large', resizeMode: 'center', testID: 'sym' },
      false,
    );

    expect(descriptor?.props).toMatchObject({
      scale: 'large',
      resizeMode: 'center',
      testID: 'sym',
    });
  });
});

describe('renderSymbolView on iOS (fallback)', () => {
  it('asks for the fallback when the platform has no name', () => {
    expect(renderSymbolView({ name: { android: 'home' } }, false)).toBeNull();
  });

  it('asks for the fallback when registration fails', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });

    expect(renderSymbolView({ name: 'star' }, false)).toBeNull();
  });
});

describe('renderSymbolView on Android (Positive)', () => {
  beforeEach(() => {
    platform.OS = 'android';
  });

  it('is an empty sized View until the font loads', () => {
    const descriptor = renderSymbolView(
      { name: { android: 'home' }, size: 32 },
      false,
    );

    expect(descriptor).toMatchObject({
      type: 'view',
      props: { style: [{ width: 32, height: 32 }, undefined] },
      children: [],
    });
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });

  it('draws the glyph in the regular font once the font is loaded', () => {
    const descriptor = renderSymbolView(
      { name: { android: 'home' }, tintColor: 'red', size: 32 },
      true,
    );

    const [glyph] = descriptor?.children ?? [];
    expect(glyph).toMatchObject({
      props: {
        style: {
          fontFamily: REGULAR_FONT,
          color: 'red',
          fontSize: 32,
          lineHeight: 32,
        },
      },
      children: [HOME_GLYPH],
    });
  });

  it('uses the system primary color when no tint is given', () => {
    const descriptor = renderSymbolView({ name: { android: 'home' } }, true);

    const [glyph] = descriptor?.children ?? [];
    expect(glyph).toMatchObject({
      props: {
        style: {
          color: PlatformColor('@android:color/system_primary_dark'),
          fontSize: 24,
        },
      },
    });
  });

  it('draws with the weight font when an Android weight is given', () => {
    const descriptor = renderSymbolView(
      { name: { android: 'home' }, weight: { ios: 'bold', android: bold } },
      true,
    );

    const [glyph] = descriptor?.children ?? [];
    expect(glyph).toMatchObject({
      props: { style: { fontFamily: 'MaterialSymbols_700Bold' } },
    });
  });

  it('asks for the fallback when the name has no Android entry', () => {
    expect(renderSymbolView({ name: 'star.fill' }, true)).toBeNull();
    expect(renderSymbolView({ name: { ios: 'star.fill' } }, true)).toBeNull();
  });
});

describe('renderSymbolView off Android and iOS', () => {
  it('reads the web entry of the name', () => {
    platform.OS = 'web';

    const descriptor = renderSymbolView({ name: { web: 'home' } }, true);

    expect(descriptor?.children).toHaveLength(1);
  });
});

describe('loadSymbolFont', () => {
  it('loads the regular font with the glyph as test string on Android', async () => {
    platform.OS = 'android';

    const isLoaded = await loadSymbolFont({ name: { android: 'home' } });

    expect(isLoaded).toBe(true);
    expect(loadAsync).toHaveBeenCalledWith({
      [REGULAR_FONT]: { uri: 400, testString: HOME_GLYPH },
    });
  });

  it('loads the weight font when an Android weight is given', async () => {
    platform.OS = 'android';

    await loadSymbolFont({
      name: { android: 'home' },
      weight: { ios: 'bold', android: bold },
    });

    expect(loadAsync).toHaveBeenCalledWith({
      MaterialSymbols_700Bold: { uri: 700, testString: HOME_GLYPH },
    });
  });

  it('reports false when loading fails, the symbol then stays an empty View', async () => {
    platform.OS = 'android';
    loadAsync.mockRejectedValue(new Error('network'));

    expect(await loadSymbolFont({ name: { android: 'home' } })).toBe(false);
  });

  it('needs no font on iOS', async () => {
    expect(await loadSymbolFont({ name: 'star' })).toBe(true);
    expect(loadAsync).not.toHaveBeenCalled();
  });
});

describe('watchSymbolFont', () => {
  it('reports the load result to the callback', async () => {
    platform.OS = 'android';
    const onLoaded = vi.fn();

    watchSymbolFont({ name: { android: 'home' } }, onLoaded);
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));
  });

  it('stays silent after the cancel, e.g. an unmount during the load', async () => {
    platform.OS = 'android';
    const onLoaded = vi.fn();

    const cancel = watchSymbolFont({ name: { android: 'home' } }, onLoaded);
    cancel();
    await loadSymbolFont({ name: { android: 'home' } });

    expect(onLoaded).not.toHaveBeenCalled();
  });
});

describe('unstable_getMaterialSymbolSourceAsync', () => {
  it('renders the glyph to an image source on Android', async () => {
    platform.OS = 'android';
    const image = { uri: 'file:///home.png', width: 24, height: 24, scale: 3 };
    renderToImageAsync.mockResolvedValue(image);

    const source = await unstable_getMaterialSymbolSourceAsync(
      'home',
      24,
      'red',
    );

    expect(source).toBe(image);
    expect(loadAsync).toHaveBeenCalledWith({ [REGULAR_FONT]: 400 });
    expect(renderToImageAsync).toHaveBeenCalledWith(HOME_GLYPH, {
      fontFamily: REGULAR_FONT,
      size: 24,
      color: 'red',
      lineHeight: 24,
    });
  });

  it('reports null for a missing symbol and on iOS', async () => {
    platform.OS = 'android';
    expect(
      await unstable_getMaterialSymbolSourceAsync(null, 24, 'red'),
    ).toBeNull();

    platform.OS = 'ios';
    expect(
      await unstable_getMaterialSymbolSourceAsync('home', 24, 'red'),
    ).toBeNull();
    expect(renderToImageAsync).not.toHaveBeenCalled();
  });
});
