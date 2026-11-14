// Zero-config host bootstrap: wires the RN-backed seams from real react-native in one call
// Lives outside the main barrel (the "./bootstrap" export), so apps without RN never load it

import * as ReactNative from 'react-native';
import { AppRegistry as RNAppRegistry, processColor } from 'react-native';
import {
  setReactNativeHost,
  type IColorValue,
  type INativeViewConfig,
} from '@symbiote-native/engine';
// @ts-expect-error react-native ships no types for this internal path (plain .js) - the
// try/catch below is what actually proves the shape, not TS.
import * as ReactNativeViewConfigRegistry from 'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry';
import {
  defaultImageSourceResolver,
  defaultPressabilityLoader,
} from './rn-seams';
import { wireHost, type IAppHost, type IBootstrapHostOptions } from './shared';

export type { IAppHost, IBootstrapHostOptions } from './shared';

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

// IColorValue is our own structural mirror of the runtime shapes RN's processColor accepts
// (CSS string / PlatformColor / DynamicColorIOS); RN's own ColorValue type is opaque, not
// structurally identical, so this is the I/O edge between the two color representations.
function defaultColorProcessor(value: IColorValue): unknown {
  return processColor(value as Parameters<typeof processColor>[0]);
}

// At import, not in `bootstrapHost`: `Dimensions.get('window')` atop an app file runs before it
setReactNativeHost(ReactNative);

// The native host owns the surface, so the app is only registered and the host runs it when asked
export function startApp<TProvider>(
  host: IAppHost<TProvider>,
  appName: string,
  provider: TProvider,
  options: IBootstrapHostOptions = {},
): void {
  bootstrapHost(options);
  host.setHostRegistrar(RNAppRegistry);
  host.AppRegistry.registerComponent(appName, provider);
}

export function bootstrapHost(options: IBootstrapHostOptions = {}): void {
  // RN subscribes to `hardwareBackPress` when its BackHandler loads, and Android exits only if JS
  // answers it, so an app without a handler of its own needs it loaded at startup
  Reflect.get(options.reactNative ?? ReactNative, 'BackHandler');
  wireHost(options, {
    colorProcessor: defaultColorProcessor,
    imageSourceResolver: defaultImageSourceResolver,
    nativeViewConfigSource: defaultNativeViewConfigSource,
    reactNative: ReactNative,
    pressabilityLoader: defaultPressabilityLoader,
  });
}
