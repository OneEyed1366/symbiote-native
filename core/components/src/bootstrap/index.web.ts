// The web bootstrap. `react-native` is react-native-web under the Expo alias, so the host
// modules come from it

import * as ReactNative from 'react-native';
import { setReactNativeHost, type IColorValue } from '@symbiote-native/engine';
import {
  defaultImageSourceResolver,
  defaultPressabilityLoader,
} from './rn-seams';
import { runAppOnWeb } from '@symbiote-native/web';
import { wireHost, type IAppHost, type IBootstrapHostOptions } from './shared';

export type { IAppHost, IBootstrapHostOptions } from './shared';

// A browser reads a CSS color as it is, where Fabric needs a platform int
const keepColor = (value: IColorValue): unknown => value;

// The registry exists only on a native host, a view the engine does not know has no config here
const noViewConfig = (): undefined => undefined;

// At import, as the native variant does: an app file may read `Dimensions` before `registerApp`
setReactNativeHost(ReactNative);

// No native host drives the registry on a page, so the app is registered and run in one call
export function startApp<TProvider>(
  host: IAppHost<TProvider>,
  appName: string,
  provider: TProvider,
  options: IBootstrapHostOptions = {},
): void {
  bootstrapHost(options);
  runAppOnWeb(host.AppRegistry, appName, provider);
}

export function bootstrapHost(options: IBootstrapHostOptions = {}): void {
  wireHost(options, {
    colorProcessor: keepColor,
    imageSourceResolver: defaultImageSourceResolver,
    nativeViewConfigSource: noViewConfig,
    reactNative: ReactNative,
    pressabilityLoader: defaultPressabilityLoader,
  });
}
