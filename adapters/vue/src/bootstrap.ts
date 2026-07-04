// Zero-config app entry, the Vue twin of adapters/react/src/bootstrap.ts. createApp(App) stays
// inert (matching real Vue's own semantics); mount(appName) is where the RN host seams and
// AppRegistry actually get wired. Lives OUTSIDE the package's main barrel — see that file's
// header for why anything importing react-native must stay there.

import { AppRegistry as RNAppRegistry } from 'react-native';
import type { Component } from '@vue/runtime-core';
import { bootstrapHost, type IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type ISymbioteVueApp = {
  mount(appName: string): void;
};

// Mirrors real Vue's createApp(App).mount(selector) two-step idiom.
export function createApp(App: Component, options: IBootstrapHostOptions = {}): ISymbioteVueApp {
  return {
    mount(appName: string): void {
      bootstrapHost(options);
      setHostRegistrar(RNAppRegistry);
      AppRegistry.registerComponent(appName, () => App);
    },
  };
}
