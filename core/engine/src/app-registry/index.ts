// Entry point RN apps already use: `registerComponent(appKey, () => App)` stores a runnable that
// calls the adapter's own `mount`. `runnableFor` is the only framework-specific seam

import { dlog } from '../debug';
import { invariant } from '../invariant';
import { isDevBuild } from '../platform/shared';
import type { IRootTag } from '../fabric';
import type { IAppParameters } from './app-parameters';
import { createContainerConfig } from './container-config';
import type {
  IComponentProviderInstrumentationHook,
  IRootViewStyleProvider,
} from './container-config';
import { createHeadlessTasks } from './headless-tasks';
import type { ITaskCancelProvider, ITaskProvider } from './headless-tasks';

export type { IAppParameters } from './app-parameters';
export type {
  IComponentProviderInstrumentationHook,
  IRootViewStyleProvider,
} from './container-config';

export { HeadlessJsTaskError } from './headless-tasks';
export type {
  IHeadlessTask,
  ITaskCancelProvider,
  ITaskCanceller,
  ITaskProvider,
} from './headless-tasks';

// What actually mounts an app onto a surface for a given app key
export type IRunnable = (appParameters: IAppParameters) => void;

// A point-in-time view of the registry, RN's `getRegistry`
export type IRegistry = {
  sections: string[];
  runnables: Record<string, IRunnable>;
};

// RN's own AppRegistry, injected by adapter bootstrap: native drives it, not the local registry
export type IHostRegistrar = {
  registerRunnable(appKey: string, run: IRunnable): string;
  registerCancellableHeadlessTask?(
    taskKey: string,
    taskProvider: ITaskProvider,
    taskCancelProvider: ITaskCancelProvider,
  ): void;
  // RN routes this through `RendererProxy`, the host owns the container teardown
  unmountAtRootTag?(rootTag: IRootTag): void;
};

// RN's `AppConfig`: a `run`, or a `component` with an optional `section` flag
export type IAppConfig<TComponentProvider> = {
  appKey: string;
  component?: TComponentProvider;
  run?: IRunnable;
  section?: boolean;
};

export type IAppRegistry<TComponentProvider, TWrapperComponentProvider> = {
  registerComponent(
    appKey: string,
    componentProvider: TComponentProvider,
  ): string;
  registerRunnable(appKey: string, run: IRunnable): string;
  registerSection(
    appKey: string,
    componentProvider: TComponentProvider,
  ): string;
  // A `run` registers as a runnable, a `component` as a (section) component
  registerConfig(config: IAppConfig<TComponentProvider>[]): void;
  // Throws for an unregistered key, as RN's invariant does
  runApplication(
    appKey: string,
    appParameters: IAppParameters,
    displayMode?: number,
  ): void;
  // Runs the runnable again with new parameters for an already rendered surface
  setSurfaceProps(
    appKey: string,
    appParameters: IAppParameters,
    displayMode?: number,
  ): void;
  // Both configure the `AppContainer` RN renders, which has no counterpart here: a call is accepted
  // and logged, so a library written against RN's typings finds the method
  setRootViewStyleProvider(provider: IRootViewStyleProvider): void;
  setComponentProviderInstrumentationHook(
    hook: IComponentProviderInstrumentationHook<TComponentProvider>,
  ): void;
  // Delegates to the host registrar, no-op headless
  unmountApplicationComponentAtRootTag(rootTag: IRootTag): void;
  setWrapperComponentProvider(provider: TWrapperComponentProvider): void;
  getAppKeys(): string[];
  getRunnable(appKey: string): IRunnable | undefined;
  getSectionKeys(): string[];
  getSections(): Record<string, IRunnable>;
  getRegistry(): IRegistry;
  registerHeadlessTask(taskKey: string, taskProvider: ITaskProvider): void;
  registerCancellableHeadlessTask(
    taskKey: string,
    taskProvider: ITaskProvider,
    taskCancelProvider: ITaskCancelProvider,
  ): void;
  // Only native calls this one, it settles the task through `HeadlessJsTaskSupport`
  startHeadlessTask(taskId: number, taskKey: string, data: unknown): void;
  cancelHeadlessTask(taskId: number, taskKey: string): void;
};

export type ICreateAppRegistryResult<
  TComponentProvider,
  TWrapperComponentProvider,
> = {
  AppRegistry: IAppRegistry<TComponentProvider, TWrapperComponentProvider>;
  setHostRegistrar(registrar: IHostRegistrar): void;
};

function requireRunnable(
  runnables: Map<string, IRunnable>,
  appKey: string,
): IRunnable {
  const run = runnables.get(appKey);
  invariant(
    run !== undefined,
    `"${appKey}" has not been registered. This can happen if:\n` +
      '* Metro (the local dev server) is run from the wrong folder. ' +
      'Check if Metro is running, stop it and restart it in the current project.\n' +
      "* A module failed to load due to an error and `AppRegistry.registerComponent` wasn't called.",
  );
  return run;
}

// `getWrapperComponentProvider` is read at mount time, so `setWrapperComponentProvider` reaches
// every runnable already registered
export function createAppRegistry<
  TComponentProvider,
  TWrapperComponentProvider,
>(
  runnableFor: (
    componentProvider: TComponentProvider,
    getWrapperComponentProvider: () => TWrapperComponentProvider | undefined,
  ) => IRunnable,
): ICreateAppRegistryResult<TComponentProvider, TWrapperComponentProvider> {
  let hostRegistrar: IHostRegistrar | undefined;
  let wrapperComponentProvider: TWrapperComponentProvider | undefined;
  const containerConfig = createContainerConfig<TComponentProvider>();
  const runnables = new Map<string, IRunnable>();
  const sections = new Map<string, IRunnable>();
  const tasks = createHeadlessTasks(() => hostRegistrar);

  function register(appKey: string, run: IRunnable, isSection = false): string {
    runnables.set(appKey, run);
    if (isSection) sections.set(appKey, run);
    hostRegistrar?.registerRunnable(appKey, run);
    return appKey;
  }

  function runnableOf(componentProvider: TComponentProvider): IRunnable {
    return runnableFor(componentProvider, () => wrapperComponentProvider);
  }

  function registerConfigEntry(
    appConfig: IAppConfig<TComponentProvider>,
  ): void {
    if (appConfig.run !== undefined) {
      register(appConfig.appKey, appConfig.run);
      return;
    }
    invariant(
      appConfig.component != null,
      `AppRegistry.registerConfig(...): Every config is expected to set either \`run\` or \`component\`, but \`${appConfig.appKey}\` has neither.`,
    );
    register(
      appConfig.appKey,
      runnableOf(appConfig.component),
      appConfig.section === true,
    );
  }

  return {
    AppRegistry: {
      registerComponent: (appKey, componentProvider) =>
        register(appKey, runnableOf(componentProvider)),
      registerRunnable: (appKey, run) => register(appKey, run),
      registerSection: (appKey, componentProvider) =>
        register(appKey, runnableOf(componentProvider), true),
      registerConfig(config) {
        config.forEach(registerConfigEntry);
      },
      runApplication(appKey, appParameters, displayMode) {
        const params = isDevBuild()
          ? ` with ${JSON.stringify(appParameters)}`
          : '';
        dlog(`Running "${appKey}"${params}`);
        containerConfig.noteUnapplied(appKey, displayMode);
        requireRunnable(runnables, appKey)(appParameters);
      },
      setSurfaceProps(appKey, appParameters, displayMode) {
        dlog(
          `Updating props for Surface "${appKey}" with ${JSON.stringify(appParameters)}`,
        );
        containerConfig.noteUnapplied(appKey, displayMode);
        requireRunnable(runnables, appKey)(appParameters);
      },
      setRootViewStyleProvider: containerConfig.setRootViewStyleProvider,
      setComponentProviderInstrumentationHook:
        containerConfig.setComponentProviderInstrumentationHook,
      unmountApplicationComponentAtRootTag(rootTag) {
        dlog(
          `AppRegistry.unmountApplicationComponentAtRootTag: rootTag ${String(rootTag)}`,
        );
        hostRegistrar?.unmountAtRootTag?.(rootTag);
      },
      setWrapperComponentProvider(provider) {
        wrapperComponentProvider = provider;
      },
      getAppKeys: () => [...runnables.keys()],
      getRunnable: appKey => runnables.get(appKey),
      getSectionKeys: () => [...sections.keys()],
      getSections: () => Object.fromEntries(sections),
      getRegistry: () => ({
        sections: [...sections.keys()],
        runnables: Object.fromEntries(runnables),
      }),
      registerHeadlessTask: (taskKey, taskProvider) =>
        tasks.register(taskKey, taskProvider, () => () => {}),
      registerCancellableHeadlessTask: tasks.register,
      startHeadlessTask: tasks.start,
      cancelHeadlessTask: tasks.cancel,
    },
    setHostRegistrar(registrar) {
      if (hostRegistrar === registrar) return;
      hostRegistrar = registrar;
      tasks.replayTo(registrar);
    },
  };
}
