// Ядро `SymbolView`, порт expo-symbols: нативный view на iOS, шрифт Material Symbols на Android
import { Platform, requireNativeViewManager } from 'expo-modules-core';
import { el, txt } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import {
  PlatformColor,
  defineExpoNativeView,
  isRecord,
  processColor,
} from '@symbiote-native/engine';
import type { IColorValue } from '@symbiote-native/engine';
import { loadAsync, renderToImageAsync } from '@symbiote-native/font';
import { androidSymbolToString } from './android';
import type { IAndroidSymbol, IAndroidSymbolWeight } from './android';
import symbols from './android/symbols.json';
import regular from './android/weights/regular';

export const SYMBOL_MODULE_NAME = 'SymbolModule';

// Регистрация идёт при рендере: побочный эффект барреля теряется в release
const symbolView = defineExpoNativeView(
  requireNativeViewManager,
  SYMBOL_MODULE_NAME,
);

export const symbolViewName = symbolView.name;
export const ensureSymbolRegistered = symbolView.ensureRegistered;

const DEFAULT_SIZE = 24;
const WEB_DEFAULT_COLOR = '#7d9bd4';
const ANDROID_DEFAULT_COLOR = '@android:color/system_primary_dark';

function runsOnIos(): boolean {
  return Platform.select({ ios: true, default: false });
}

function defaultSymbolColor(): IColorValue {
  return Platform.select({ android: true, default: false })
    ? PlatformColor(ANDROID_DEFAULT_COLOR)
    : WEB_DEFAULT_COLOR;
}

function isAndroidSymbol(value: unknown): value is IAndroidSymbol {
  return typeof value === 'string' && Object.hasOwn(symbols, value);
}

function isAndroidWeight(value: unknown): value is IAndroidSymbolWeight {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    typeof value['font'] === 'number'
  );
}

// Значение `name` или `weight` для iOS: строка как есть, у объекта берётся запись `ios`
function iosEntryOf(value: unknown): unknown {
  return isRecord(value) ? value['ios'] : value;
}

function glyphNameOf(props: object): IAndroidSymbol | null {
  const name: unknown = Reflect.get(props, 'name');
  const key = Platform.select({ android: 'android', default: 'web' });
  const entry = isRecord(name) ? name[key] : null;
  return isAndroidSymbol(entry) ? entry : null;
}

/** The font of the Android weight, the regular one when none is given */
export function symbolFontOf(weight: unknown): IAndroidSymbolWeight {
  const platformWeight = isRecord(weight) ? weight['android'] : null;
  return isAndroidWeight(platformWeight) ? platformWeight : regular;
}

function sizedStyle(props: object, size: number): unknown {
  return [{ width: size, height: size }, Reflect.get(props, 'style')];
}

function sizeOf(props: object): number {
  const size: unknown = Reflect.get(props, 'size');
  return typeof size === 'number' && size !== 0 ? size : DEFAULT_SIZE;
}

function renderNative(props: object): IDescriptor | null {
  if (!ensureSymbolRegistered()) return null;
  const name = iosEntryOf(Reflect.get(props, 'name'));
  if (!name) return null;

  const colors: unknown = Reflect.get(props, 'colors');
  const colorList = Array.isArray(colors) ? colors : colors ? [colors] : [];
  const size = sizeOf(props);
  const style: unknown = Reflect.get(props, 'style');
  return el(symbolViewName(), {
    ...Object.fromEntries(
      Object.entries(props).filter(([key]) => key !== 'tintColor'),
    ),
    name,
    style: style ? sizedStyle(props, size) : { width: size, height: size },
    colors: colorList.map(color => processColor(color)),
    tint: processColor(Reflect.get(props, 'tintColor')),
    weight: iosEntryOf(Reflect.get(props, 'weight')),
    animated: !!Reflect.get(props, 'animationSpec'),
    type: Reflect.get(props, 'type') ?? 'monochrome',
  });
}

function renderGlyph(props: object, isFontLoaded: boolean): IDescriptor | null {
  const name = glyphNameOf(props);
  if (!name) return null;
  const size = sizeOf(props);
  const style = sizedStyle(props, size);
  if (!isFontLoaded) return el('view', { style });
  const tint: unknown = Reflect.get(props, 'tintColor');
  const glyph = txt(
    {
      style: {
        fontFamily: symbolFontOf(Reflect.get(props, 'weight')).name,
        color: tint ?? defaultSymbolColor(),
        fontSize: size,
        lineHeight: size,
      },
    },
    [androidSymbolToString(name) ?? ''],
  );
  return el('view', { style }, [glyph]);
}

/**
 * The symbol as a descriptor, `null` means the caller renders its own `fallback`
 * `isFontLoaded` only matters off iOS, where the glyph needs the loaded font
 */
export function renderSymbolView(
  props: object,
  isFontLoaded: boolean,
): IDescriptor | null {
  return runsOnIos() ? renderNative(props) : renderGlyph(props, isFontLoaded);
}

/** Loads the Material Symbols font, false when it fails and the symbol stays an empty View */
export async function loadSymbolFont(props: object): Promise<boolean> {
  if (runsOnIos()) return true;
  const font = symbolFontOf(Reflect.get(props, 'weight'));
  const name = glyphNameOf(props);
  try {
    await loadAsync({
      [font.name]: {
        uri: font.font,
        testString: name
          ? (androidSymbolToString(name) ?? undefined)
          : undefined,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the font once and reports the result, the returned function drops a late report
 * Every adapter calls it from its own mount hook, so the lifecycle logic is written once
 */
export function watchSymbolFont(
  props: object,
  onLoaded: (isLoaded: boolean) => void,
): () => void {
  let isActive = true;
  void loadSymbolFont(props).then(isLoaded => {
    if (isActive) onLoaded(isLoaded);
  });
  return () => {
    isActive = false;
  };
}

/**
 * Renders a Material Symbol to an image source, for APIs that take an image such as tab bar icons
 * @platform android
 */
export async function unstable_getMaterialSymbolSourceAsync(
  symbol: IAndroidSymbol | null,
  size: number,
  color: string,
): Promise<{
  uri: string;
  width: number;
  height: number;
  scale: number;
} | null> {
  if (runsOnIos() || !symbol) return null;
  const glyph = androidSymbolToString(symbol);
  if (!glyph) return null;
  const font = regular;
  await loadAsync({ [font.name]: font.font });
  return renderToImageAsync(glyph, {
    fontFamily: font.name,
    size,
    color,
    lineHeight: size,
  });
}
