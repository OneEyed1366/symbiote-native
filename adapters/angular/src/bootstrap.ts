// Zero-config app entry, the Angular twin of adapters/react/src/bootstrap.ts. Lives OUTSIDE the
// package's main barrel — see that file's header for why anything importing react-native must
// stay there. No @Component/@Directive decorators here, so unlike the package's main "." entry
// this needs no ngc/AOT build step and can stay a plain source reference.

import './finalization-registry';
import { AppRegistry as RNAppRegistry } from 'react-native';
import type { EnvironmentProviders, Provider, Type } from '@angular/core';
import {
  bootstrapHost,
  type IBootstrapHostOptions,
} from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';
import { setRootProviders } from './render';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type IBootstrapApplicationOptions = IBootstrapHostOptions & {
  appName: string;
  providers?: (Provider | EnvironmentProviders)[];
};

// Mirrors real Angular's bootstrapApplication(RootComponent, config) idiom.
export function bootstrapApplication(
  AppComponent: Type<unknown>,
  options: IBootstrapApplicationOptions,
): void {
  const { appName, providers = [], ...bootstrapOptions } = options;
  setRootProviders(providers);
  bootstrapHost(bootstrapOptions);
  setHostRegistrar(RNAppRegistry);
  AppRegistry.registerComponent(appName, () => AppComponent);
}
