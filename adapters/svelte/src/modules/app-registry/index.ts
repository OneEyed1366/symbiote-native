// AppRegistry: the JS entry point RN apps already use, as `registerComponent(appKey, () => App)`
// The bookkeeping lives in `createAppRegistry` of `@symbiote-native/engine`, shared by all adapters

// KNOWN GAP: `IWrapperComponentProvider` (wrapping the app root from native) is not implemented
// A compiled Svelte component cannot be nested by a function call like Vue's `h(wrapper, ...)`
// It needs its own design, a wrapper snippet most likely, so a set provider is ignored

import type { Component } from 'svelte';
import { mount } from '../../render';
import {
  createAppRegistry,
  dlog,
  HeadlessJsTaskError,
  type IAppParameters,
  type IRunnable,
} from '@symbiote-native/engine';

// RN's IComponentProvider: a thunk returning the root component (lazy so the module
// graph stays cheap until the app actually runs).
export type IComponentProvider = () => Component;

// RN's IWrapperComponentProvider — see the KNOWN GAP note above.
export type IWrapperComponentProvider = (
  appParameters: IAppParameters,
) => Component;

function runnableFor(
  componentProvider: IComponentProvider,
  getWrapperComponentProvider: () => IWrapperComponentProvider | undefined,
): IRunnable {
  return appParameters => {
    dlog(`AppRegistry: mounting on rootTag ${String(appParameters.rootTag)}`);
    if (getWrapperComponentProvider() !== undefined) {
      dlog(
        'AppRegistry: wrapperComponentProvider is set but not yet supported on Svelte — ignored',
      );
    }
    const RootComponent = componentProvider();
    mount(appParameters.rootTag, RootComponent, appParameters.initialProps);
  };
}

const { AppRegistry, setHostRegistrar } = createAppRegistry<
  IComponentProvider,
  IWrapperComponentProvider
>(runnableFor);

export { AppRegistry, HeadlessJsTaskError, setHostRegistrar };
export type {
  IAppConfig,
  IAppParameters,
  IRunnable,
  IHostRegistrar,
  IRegistry,
  IHeadlessTask,
  ITaskProvider,
  ITaskCanceller,
  ITaskCancelProvider,
} from '@symbiote-native/engine';
