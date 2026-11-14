// Zero-config app entry, outside the package barrel as it reaches `react-native` through
// `@symbiote-native/components/bootstrap`. It has no decorators, so no ngc/AOT step is needed

import './finalization-registry';
import type { EnvironmentProviders, Provider, Type } from '@angular/core';
import {
  startApp,
  type IBootstrapHostOptions,
} from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';
import { setRootProviders } from './render';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type IBootstrapApplicationOptions = IBootstrapHostOptions & {
  appName: string;
  providers?: (Provider | EnvironmentProviders)[];
};

// Mirrors real Angular's `bootstrapApplication(RootComponent, config)`
export function bootstrapApplication(
  AppComponent: Type<unknown>,
  options: IBootstrapApplicationOptions,
): void {
  const { appName, providers = [], ...hostOptions } = options;
  setRootProviders(providers);
  startApp(
    { AppRegistry, setHostRegistrar },
    appName,
    () => AppComponent,
    hostOptions,
  );
}
