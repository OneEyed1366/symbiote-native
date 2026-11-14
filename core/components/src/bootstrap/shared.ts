// What every platform's bootstrap wires into the engine. A platform differs only in the seams it
// defaults to, so each variant hands its own to `wireHost`

import {
  setAssetSourceResolver,
  setColorProcessor,
  setImageSourceResolver,
  setNativeViewConfigSource,
  setPressabilityLoader,
  setReactNativeHost,
  type IAppRegistry,
  type IColorValue,
  type IHostRegistrar,
  type INativeViewConfigSource,
  type IPressabilityClass,
} from '@symbiote-native/engine';

export type IBootstrapHostOptions = {
  colorProcessor?: (value: IColorValue) => unknown;
  imageSourceResolver?: (source: unknown) => unknown;
  assetSourceResolver?: (source: unknown) => unknown;
  nativeViewConfigSource?: INativeViewConfigSource;
  reactNative?: object;
  pressabilityLoader?: () => IPressabilityClass;
  debug?: boolean;
};

// What an adapter hands `startApp`: its own registry and the bridge to the host's registry
export type IAppHost<TProvider> = {
  AppRegistry: Pick<
    IAppRegistry<TProvider, unknown>,
    'registerComponent' | 'runApplication'
  >;
  setHostRegistrar: (registrar: IHostRegistrar) => void;
};

// The platform's answer for every seam an app did not override
export type IBootstrapSeams = {
  colorProcessor: (value: IColorValue) => unknown;
  imageSourceResolver: (source: unknown) => unknown;
  nativeViewConfigSource: INativeViewConfigSource;
  reactNative: object;
  pressabilityLoader: () => IPressabilityClass;
};

export function wireHost(
  options: IBootstrapHostOptions,
  seams: IBootstrapSeams,
): void {
  globalThis.__SYMBIOTE_DEBUG__ = options.debug ?? process.env.DEBUG === '1';
  setColorProcessor(options.colorProcessor ?? seams.colorProcessor);
  setImageSourceResolver(
    options.imageSourceResolver ?? seams.imageSourceResolver,
  );
  setAssetSourceResolver(
    options.assetSourceResolver ?? seams.imageSourceResolver,
  );
  setNativeViewConfigSource(
    options.nativeViewConfigSource ?? seams.nativeViewConfigSource,
  );
  setReactNativeHost(options.reactNative ?? seams.reactNative);
  setPressabilityLoader(options.pressabilityLoader ?? seams.pressabilityLoader);
}
