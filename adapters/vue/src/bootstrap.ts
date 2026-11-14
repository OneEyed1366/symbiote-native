// Zero-config app entry, outside the package barrel as it reaches `react-native` through
// `@symbiote-native/components/bootstrap`, which Vitest's transform cannot parse

import type { Component } from '@vue/runtime-core';
import {
  startApp,
  type IBootstrapHostOptions,
} from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type ISymbioteVueApp = {
  mount(appName: string): void;
};

// Mirrors real Vue's `createApp(App).mount(selector)`, where `createApp` stays inert
export function createApp(
  App: Component,
  options: IBootstrapHostOptions = {},
): ISymbioteVueApp {
  return {
    mount(appName: string): void {
      startApp({ AppRegistry, setHostRegistrar }, appName, () => App, options);
    },
  };
}
