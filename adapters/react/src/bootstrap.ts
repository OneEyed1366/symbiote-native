// Zero-config app entry, outside the package barrel as it reaches `react-native` through
// `@symbiote-native/components/bootstrap`, which Vitest's transform cannot parse

import type { ComponentType } from 'react';
import {
  startApp,
  type IBootstrapHostOptions,
} from '@symbiote-native/components/bootstrap';
import { AppRegistry, setHostRegistrar } from './modules/app-registry';

export type { IBootstrapHostOptions } from '@symbiote-native/components/bootstrap';

export type IRegisterAppOptions = IBootstrapHostOptions & {
  appName: string;
};

// Mirrors bare RN's `AppRegistry.registerComponent(appName, () => App)`, minus the host wiring
export function registerApp(
  App: ComponentType<object>,
  options: IRegisterAppOptions,
): void {
  const { appName, ...hostOptions } = options;
  startApp({ AppRegistry, setHostRegistrar }, appName, () => App, hostOptions);
}
