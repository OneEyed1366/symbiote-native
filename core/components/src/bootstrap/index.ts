// Zero-config host bootstrap: wires the RN-backed seams from real react-native in one call
// Lives outside the main barrel (the "./bootstrap" export), so apps without RN never load it

import * as ReactNative from 'react-native';
import { processColor } from 'react-native';
// @ts-expect-error react-native ships no types for this internal path (plain .js)
import resolveAssetSource from 'react-native/Libraries/Image/resolveAssetSource';
import {
  setAssetSourceResolver,
  setColorProcessor,
  setImageSourceResolver,
  setNativeViewConfigSource,
  setPressabilityLoader,
  setReactNativeHost,
  type IColorValue,
  type IPressabilityClass,
  type INativeViewConfig,
  type INativeViewConfigSource,
} from '@symbiote-native/engine';
// @ts-expect-error react-native ships no types for this internal path (plain .js) - the
// try/catch below is what actually proves the shape, not TS.
import * as ReactNativeViewConfigRegistry from 'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry';

export type IBootstrapHostOptions = {
  colorProcessor?: (value: IColorValue) => unknown;
  imageSourceResolver?: (source: unknown) => unknown;
  assetSourceResolver?: (source: unknown) => unknown;
  nativeViewConfigSource?: INativeViewConfigSource;
  reactNative?: object;
  pressabilityLoader?: () => IPressabilityClass;
  debug?: boolean;
};

// Third-party Fabric views derive their events + prop processors from RN's own ViewConfig
// registry; `get` throws for an unregistered name, so undefined is the right answer for
// anything the registry doesn't know (our built-ins never reach here).
function defaultNativeViewConfigSource(
  name: string,
): INativeViewConfig | undefined {
  try {
    return ReactNativeViewConfigRegistry.get(name);
  } catch {
    return undefined;
  }
}

// Asset ids and `{uri}` sources go through RN's resolver before the shared render fns
// It is the module behind `Image.resolveAssetSource`, imported directly so the `Image` component
// (which loads React's renderer) stays out of every other adapter's bundle
function defaultImageSourceResolver(source: unknown): unknown {
  return resolveAssetSource(source);
}

// IColorValue is our own structural mirror of the runtime shapes RN's processColor accepts
// (CSS string / PlatformColor / DynamicColorIOS); RN's own ColorValue type is opaque, not
// structurally identical, so this is the I/O edge between the two color representations.
function defaultColorProcessor(value: IColorValue): unknown {
  return processColor(value as Parameters<typeof processColor>[0]);
}

// RN's `Pressability` is not on its index and only `usePressability` needs it, so it loads on use
function defaultPressabilityLoader(): IPressabilityClass {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native/Libraries/Pressability/Pressability').default;
}

// At import, not in `bootstrapHost`: `Dimensions.get('window')` atop an app file runs before it
setReactNativeHost(ReactNative);

export function bootstrapHost(options: IBootstrapHostOptions = {}): void {
  globalThis.__SYMBIOTE_DEBUG__ = options.debug ?? process.env.DEBUG === '1';
  setColorProcessor(options.colorProcessor ?? defaultColorProcessor);
  setImageSourceResolver(
    options.imageSourceResolver ?? defaultImageSourceResolver,
  );
  setAssetSourceResolver(
    options.assetSourceResolver ?? defaultImageSourceResolver,
  );
  // RN subscribes to `hardwareBackPress` when its BackHandler loads, and Android exits only if JS
  // answers it, so an app without a handler of its own needs it loaded at startup
  Reflect.get(options.reactNative ?? ReactNative, 'BackHandler');
  setNativeViewConfigSource(
    options.nativeViewConfigSource ?? defaultNativeViewConfigSource,
  );
  setReactNativeHost(options.reactNative ?? ReactNative);
  setPressabilityLoader(
    options.pressabilityLoader ?? defaultPressabilityLoader,
  );
}
