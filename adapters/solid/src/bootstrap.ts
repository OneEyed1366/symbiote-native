// Zero-config app entry, the Solid twin of adapters/vue/src/bootstrap.ts and
// adapters/svelte/src/bootstrap.ts. Lives OUTSIDE the package's main barrel — react-native's own
// source is Flow syntax Vitest's transform can't parse, so anything importing it directly must stay
// unreachable from the tested main index.ts.

import { AppRegistry as RNAppRegistry } from 'react-native';
import type { Component } from 'solid-js';
import {
  bootstrapHost,
  type IBootstrapHostOptions,
} from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type ISymbioteSolidApp = {
  mount(appName: string): void;
};

// Mirrors the Vue/React/Svelte adapters' createApp(App).mount(appName) two-step idiom: createApp
// stays inert, and mount(appName) is where the RN host seams and AppRegistry get wired.
export function createApp(
  RootComponent: Component,
  options: IBootstrapHostOptions = {},
): ISymbioteSolidApp {
  return {
    mount(appName: string): void {
      bootstrapHost(options);
      setHostRegistrar(RNAppRegistry);
      AppRegistry.registerComponent(appName, () => RootComponent);
    },
  };
}
