// AppRegistry: the JS entry point RN apps already use:
//   AppRegistry.registerComponent(appKey, () => App)
// The registry bookkeeping (sections, host-registrar bridge, headless tasks) is
// framework-agnostic and lives in @symbiote-native/engine's createAppRegistry, the same one
// every other adapter uses; this file supplies only the one Svelte-specific seam.
//
// KNOWN GAP, not silently dropped: `IWrapperComponentProvider` (wrapping the app root in a
// context-provider-style component from native) has no implementation here yet. Vue composes
// it with `h(wrapper, null, { default: renderRoot })` — Svelte has no equivalent JS-level
// composition of two independently-authored components (a Svelte component is compiled
// output, not a value you can nest via a function call the way Vue's `h()` nests vnodes).
// Closing this needs its own design pass (a synthetic wrapper snippet, most likely) — tracked
// in the svelte-adapter-dom-shim skill, not solved here. `setWrapperComponentProvider` is
// re-exported (parity with the engine's API surface) but a set provider is currently ignored.

import type { Component } from 'svelte';
import { mount } from '../../render';
import {
  createAppRegistry,
  dlog,
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

export { AppRegistry, setHostRegistrar };
export type {
  IAppParameters,
  IRunnable,
  IHostRegistrar,
  IRegistry,
  IHeadlessTask,
  ITaskProvider,
  ITaskCanceller,
  ITaskCancelProvider,
} from '@symbiote-native/engine';
