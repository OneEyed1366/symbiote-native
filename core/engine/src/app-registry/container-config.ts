// What RN's `AppRegistry` hands its `AppContainer`: a root view style, an instrumentation hook and
// a display mode. There is no container here, so each is kept and a run says it was not applied

import { dlog } from '../debug';
import type { IAppParameters } from './app-parameters';

export type IRootViewStyleProvider = (appParameters: IAppParameters) => object;

export type IComponentProviderInstrumentationHook<TComponentProvider> = (
  component: TComponentProvider,
  scopedPerformanceLogger: unknown,
) => unknown;

export type IContainerConfig<TComponentProvider> = {
  setRootViewStyleProvider(provider: IRootViewStyleProvider): void;
  setComponentProviderInstrumentationHook(
    hook: IComponentProviderInstrumentationHook<TComponentProvider>,
  ): void;
  noteUnapplied(appKey: string, displayMode: number | undefined): void;
};

export function createContainerConfig<
  TComponentProvider,
>(): IContainerConfig<TComponentProvider> {
  let rootViewStyleProvider: IRootViewStyleProvider | undefined;
  let instrumentationHook:
    IComponentProviderInstrumentationHook<TComponentProvider> | undefined;
  return {
    setRootViewStyleProvider(provider) {
      rootViewStyleProvider = provider;
    },
    setComponentProviderInstrumentationHook(hook) {
      instrumentationHook = hook;
    },
    noteUnapplied(appKey, displayMode) {
      if (rootViewStyleProvider !== undefined)
        dlog(`"${appKey}": a root view style provider is set, not applied`);
      if (instrumentationHook !== undefined)
        dlog(`"${appKey}": an instrumentation hook is set, not applied`);
      if (displayMode !== undefined)
        dlog(`"${appKey}": displayMode ${displayMode} is not applied`);
    },
  };
}
