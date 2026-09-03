// AppRegistry: the JS entry point RN apps already use:
//   AppRegistry.registerComponent(appKey, () => App)
// The registry bookkeeping (sections, host-registrar bridge, headless tasks) is
// framework-agnostic and lives in @symbiote-native/engine's createAppRegistry, the same one every
// other adapter uses; this file supplies only the one Solid-specific seam.
//
// Unlike the Svelte adapter, `IWrapperComponentProvider` is fully supported here and needs no
// design pass: a Solid component is an ordinary function value, so wrapping composes exactly the
// way Vue's `h(wrapper, null, { default: renderRoot })` does — `createComponent(Wrapper, { get
// children() {…} })`, which is also the literal shape compiled JSX emits for children.

import type { Component } from 'solid-js';
import {
  createAppRegistry,
  dlog,
  type IAppParameters,
  type IRunnable,
} from '@symbiote-native/engine';
import { createComponent } from '../../renderer';
import { mount } from '../../render';

// RN's IComponentProvider: a thunk returning the root component (lazy so the module graph stays
// cheap until the app actually runs).
export type IComponentProvider = () => Component;

// RN's IWrapperComponentProvider: given the surface's parameters, returns a component to wrap the
// app root in (e.g. a context provider). Optional.
export type IWrapperComponentProvider = (
  appParameters: IAppParameters,
) => Component;

function runnableFor(
  componentProvider: IComponentProvider,
  getWrapperComponentProvider: () => IWrapperComponentProvider | undefined,
): IRunnable {
  return appParameters => {
    dlog(`AppRegistry: mounting on rootTag ${String(appParameters.rootTag)}`);
    const RootComponent = componentProvider();
    const renderRoot = () =>
      createComponent(RootComponent, appParameters.initialProps ?? {});

    // Read live, so setWrapperComponentProvider affects every runnable's next run rather than only
    // ones registered afterwards — same contract as Vue's.
    const wrapperComponentProvider = getWrapperComponentProvider();
    const mounted =
      wrapperComponentProvider === undefined
        ? renderRoot
        : () =>
            createComponent(wrapperComponentProvider(appParameters), {
              // A getter, not a value: children must stay lazy so the root is created inside the
              // wrapper's own reactive owner (its context providers, error boundaries and cleanups
              // then actually cover the root). Evaluating it eagerly here would build the root
              // outside that owner and quietly break every one of those.
              get children() {
                return renderRoot();
              },
            });

    mount(appParameters.rootTag, mounted);
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
