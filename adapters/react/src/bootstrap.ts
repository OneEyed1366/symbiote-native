// Zero-config app entry: `bootstrapHost` wires the RN-backed host seams, then the root registers
// Lives outside the barrel (the "./bootstrap" export) since it imports react-native, which Vitest
// cannot parse (see @symbiote-native/components/bootstrap)

import type { ComponentType } from 'react';
import { AppRegistry as RNAppRegistry } from 'react-native';
import {
  bootstrapHost,
  type IBootstrapHostOptions,
} from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';

// Голый import: приложение на intrinsic-тегах не трогает barrel, а без поведений
// ScrollView на Android монтируется без content view
import './register';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type IRegisterAppOptions = IBootstrapHostOptions & {
  appName: string;
};

// Mirrors bare RN's own `AppRegistry.registerComponent(appName, () => App)` idiom, minus the
// manual host wiring in front of it.
export function registerApp(
  App: ComponentType<object>,
  options: IRegisterAppOptions,
): void {
  const { appName, ...bootstrapOptions } = options;
  bootstrapHost(bootstrapOptions);
  setHostRegistrar(RNAppRegistry);
  AppRegistry.registerComponent(appName, () => App);
}
