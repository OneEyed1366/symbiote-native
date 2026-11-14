// Zero-config app entry, outside the package barrel as it reaches `react-native` through
// `@symbiote-native/components/bootstrap`, which Vitest's transform cannot parse

import type { Component } from 'svelte';
import {
  startApp,
  type IBootstrapHostOptions,
} from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type ISymbioteSvelteApp = {
  mount(appName: string): void;
};

// Mirrors the other adapters' `createApp(App).mount(appName)`, where `createApp` stays inert
export function createApp(
  RootComponent: Component,
  options: IBootstrapHostOptions = {},
): ISymbioteSvelteApp {
  return {
    mount(appName: string): void {
      startApp(
        { AppRegistry, setHostRegistrar },
        appName,
        () => RootComponent,
        options,
      );
    },
  };
}
