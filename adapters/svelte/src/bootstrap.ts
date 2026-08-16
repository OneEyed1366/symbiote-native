// Zero-config app entry, the Svelte twin of adapters/vue/src/bootstrap.ts and
// adapters/react/src/bootstrap.ts. Lives OUTSIDE the package's main barrel — react-native's
// own source is Flow syntax Vitest's transform can't parse, so anything importing it directly
// must stay unreachable from the tested main index.ts.

import { AppRegistry as RNAppRegistry } from 'react-native';
import type { Component } from 'svelte';
import { bootstrapHost, type IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type ISymbioteSvelteApp = {
  mount(appName: string): void;
};

// Mirrors the Vue/React adapters' createApp(App).mount(appName) two-step idiom.
export function createApp(
  RootComponent: Component,
  options: IBootstrapHostOptions = {},
): ISymbioteSvelteApp {
  return {
    mount(appName: string): void {
      bootstrapHost(options);
      setHostRegistrar(RNAppRegistry);
      AppRegistry.registerComponent(appName, () => RootComponent);
    },
  };
}
