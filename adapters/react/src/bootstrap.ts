// Zero-config app entry: wires the four RN-backed host seams (via @symbiote-native/components'
// bootstrapHost) plus this adapter's own AppRegistry host-registrar bridge, then registers the
// root component — collapsing the canary's manual sequence into one call. Lives OUTSIDE the
// package's main barrel (see package.json's "./bootstrap" export): it imports react-native
// directly, which Vitest's Flow-unaware transform can't parse (see
// @symbiote-native/components/bootstrap for the full reason).

import type { ComponentType } from 'react';
import { AppRegistry as RNAppRegistry } from 'react-native';
import { bootstrapHost, type IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type IRegisterAppOptions = IBootstrapHostOptions & {
  appName: string;
};

// Mirrors bare RN's own `AppRegistry.registerComponent(appName, () => App)` idiom, minus the
// manual host wiring in front of it.
export function registerApp(App: ComponentType<object>, options: IRegisterAppOptions): void {
  const { appName, ...bootstrapOptions } = options;
  bootstrapHost(bootstrapOptions);
  setHostRegistrar(RNAppRegistry);
  AppRegistry.registerComponent(appName, () => App);
}
