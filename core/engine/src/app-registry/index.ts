// AppRegistry: the JS entry point RN apps already use — `AppRegistry.registerComponent(appKey,
// () => App)`. RN's version stores a runnable that calls its own React renderer; every symbiote
// adapter instead stores a runnable that calls ITS OWN `mount`, driving @symbiote-native/engine. That
// difference — building a runnable from a component provider — is the ONLY framework-specific
// bit (React wraps via createElement, Vue via createApp/h, Angular via createComponent), so it is
// the one thing each adapter supplies; everything else (registry bookkeeping, sections, the
// host-registrar bridge, headless tasks) is byte-identical across adapters and lives here once.
//
// The catch: native invokes RN's registered callable AppRegistry for both surface runnables and
// headless tasks; it cannot see this local registry. `setHostRegistrar` mirrors those native-facing
// registrations there while the core remains react-native-free.

import { getNativeModule } from '../native-modules';
import { dlog } from '../debug';
import type { IRootTag } from '../fabric';

// What the native host hands a runnable when it mounts a surface: the surface's
// rootTag plus any initial props passed from native.
export interface IAppParameters {
  rootTag: IRootTag;
  initialProps?: object;
}

// What actually mounts an app onto a surface for a given app key.
export type IRunnable = (appParameters: IAppParameters) => void;

// A point-in-time view of the registry: section keys plus the runnable map,
// mirroring RN's `getRegistry` (AppRegistryImpl.js:140).
export interface IRegistry {
  sections: string[];
  runnables: Record<string, IRunnable>;
}

// A headless task: a bit of code that runs without a UI, resolving when done.
// Mirrors RN's `IHeadlessTask` (AppRegistry.flow.js:16).
export type IHeadlessTask = (taskData: unknown) => Promise<void>;

// Lazy provider of a headless task (so the task module graph stays cheap until
// native actually starts it). Mirrors RN's `ITaskProvider`.
export type ITaskProvider = () => IHeadlessTask;

// Cancels a running headless task. Mirrors RN's `ITaskCanceller`.
export type ITaskCanceller = () => void;

// Lazy provider of a task canceller, paired with a registered task.
export type ITaskCancelProvider = () => ITaskCanceller;

// RN's own AppRegistry, injected by adapter bootstrap. Native drives this registrar for surface
// runnables and headless tasks; the engine keeps only the framework-independent mirror.
export interface IHostRegistrar {
  registerRunnable(appKey: string, run: IRunnable): string;
  // Android starts headless work through RN's native-callable AppRegistry, not this local object.
  // Bootstrap injects RN's AppRegistry here so the same task providers reach native too.
  registerCancellableHeadlessTask?(
    taskKey: string,
    taskProvider: ITaskProvider,
    taskCancelProvider: ITaskCancelProvider,
  ): void;
  // Native unmount of a surface by rootTag. RN routes this through RendererProxy's
  // `unmountComponentAtNodeAndRemoveContainer` (AppRegistryImpl.js:212); the host
  // owns the container teardown, so we delegate when wired and no-op headless.
  unmountAtRootTag?(rootTag: IRootTag): void;
}

// The native module backing headless tasks. RN registers it under the name
// "HeadlessJsTaskSupport" (the spec's TurboModuleRegistry.get<Spec>(...) name in
// INativeHeadlessJsTaskSupport.js); a native module's registered name is
// platform-specific in general, but this spec uses the same name on both platforms. A
// headless fake answers to any name, so on-device resolution is the only proof.
interface INativeHeadlessJsTaskSupport {
  notifyTaskFinished?(taskId: number): void;
  notifyTaskRetry?(taskId: number): Promise<boolean>;
}

const HEADLESS_TASK_MODULE = 'HeadlessJsTaskSupport';

export interface IAppRegistry<TComponentProvider, TWrapperComponentProvider> {
  registerComponent(
    appKey: string,
    componentProvider: TComponentProvider,
  ): string;
  registerRunnable(appKey: string, run: IRunnable): string;
  // Registers an app as a section, mirroring RN's `registerSection`
  // (AppRegistryImpl.js:115). Same path as a component, additionally tracked under
  // the section keys.
  registerSection(
    appKey: string,
    componentProvider: TComponentProvider,
  ): string;
  runApplication(appKey: string, appParameters: IAppParameters): void;
  // Tears down a mounted surface by rootTag, delegating to the host registrar
  // (RN routes through RendererProxy, AppRegistryImpl.js:212). No-op headless.
  unmountApplicationComponentAtRootTag(rootTag: IRootTag): void;
  // Installs the wrapper-component provider used by every subsequent mount
  // (AppRegistryImpl.js:45).
  setWrapperComponentProvider(provider: TWrapperComponentProvider): void;
  getAppKeys(): string[];
  // The runnable registered under an app key, or undefined (AppRegistryImpl.js:136).
  getRunnable(appKey: string): IRunnable | undefined;
  // Section keys only (AppRegistryImpl.js:126).
  getSectionKeys(): string[];
  // The section runnables as a plain map (AppRegistryImpl.js:130).
  getSections(): Record<string, IRunnable>;
  // A point-in-time registry snapshot (AppRegistryImpl.js:140).
  getRegistry(): IRegistry;
  // Registers a headless task: code that runs without a UI. Mirrors RN's
  // `registerHeadlessTask` (AppRegistryImpl.js:221): a thin wrapper over
  // `registerCancellableHeadlessTask` with a no-op canceller.
  registerHeadlessTask(taskKey: string, taskProvider: ITaskProvider): void;
  // Registers a cancellable headless task (AppRegistryImpl.js:236).
  registerCancellableHeadlessTask(
    taskKey: string,
    taskProvider: ITaskProvider,
    taskCancelProvider: ITaskCancelProvider,
  ): void;
  // Only called from native: starts a registered headless task and drives the
  // native completion/retry protocol (AppRegistryImpl.js:255).
  startHeadlessTask(taskId: number, taskKey: string, data: unknown): void;
  // Only called from native: cancels a running headless task (AppRegistryImpl.js:301).
  cancelHeadlessTask(taskId: number, taskKey: string): void;
}

export interface ICreateAppRegistryResult<
  TComponentProvider,
  TWrapperComponentProvider,
> {
  AppRegistry: IAppRegistry<TComponentProvider, TWrapperComponentProvider>;
  setHostRegistrar(registrar: IHostRegistrar): void;
}

// Builds one adapter's AppRegistry. `runnableFor` is the sole framework-specific seam: given a
// component provider and a getter for the CURRENT wrapper-component provider (read at mount
// time, not registration time — setWrapperComponentProvider must affect every runnable's next
// run, mirroring AppRegistryImpl.js reading it live inside the runnable it returns), it returns
// the IRunnable that actually mounts the app for a rootTag — e.g. React's createElement + mount,
// Vue's createApp(component, props).mount(surface), Angular's createComponent + setInput.
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

  const runnables = new Map<string, IRunnable>();
  const sections = new Map<string, IRunnable>();
  const taskProviders = new Map<string, ITaskProvider>();
  const taskCancelProviders = new Map<string, ITaskCancelProvider>();

  function register(appKey: string, run: IRunnable, isSection = false): string {
    runnables.set(appKey, run);
    if (isSection) sections.set(appKey, run);
    // Bridge to the native registrar so the Fabric host can mount this app by key.
    // Absent (headless / not yet wired) → registration is local only, which is what
    // runApplication and the smokes drive directly.
    hostRegistrar?.registerRunnable(appKey, run);
    return appKey;
  }

  // Runs a registered headless task and drives the native completion/retry
  // protocol, mirroring RN's `startHeadlessTask` (AppRegistryImpl.js:255). Native
  // is the only caller; it must be told when the task settles so the OS can release
  // the wakelock. Headless (no native module) → we just run the task.
  function runHeadlessTask(
    taskId: number,
    taskKey: string,
    data: unknown,
  ): void {
    const native =
      getNativeModule<INativeHeadlessJsTaskSupport>(HEADLESS_TASK_MODULE);
    dlog(`AppRegistry.startHeadlessTask: ${taskKey} (taskId=${taskId})`);

    const provider = taskProviders.get(taskKey);
    if (provider === undefined) {
      dlog(
        `AppRegistry.startHeadlessTask: no task registered for key "${taskKey}"`,
      );
      native?.notifyTaskFinished?.(taskId);
      return;
    }

    void provider()(data)
      .then(() => {
        native?.notifyTaskFinished?.(taskId);
      })
      .catch((reason: unknown) => {
        dlog(
          `AppRegistry.startHeadlessTask: "${taskKey}" failed: ${String(reason)}`,
        );
        // RN asks native whether a retry was scheduled; if not, finish the task.
        // Without the native module there is nothing to notify.
        const retry = native?.notifyTaskRetry?.(taskId);
        if (retry === undefined) {
          native?.notifyTaskFinished?.(taskId);
          return;
        }
        void retry.then(retryPosted => {
          if (!retryPosted) native?.notifyTaskFinished?.(taskId);
        });
      });
  }

  const AppRegistry: IAppRegistry<
    TComponentProvider,
    TWrapperComponentProvider
  > = {
    registerComponent(appKey, componentProvider) {
      return register(
        appKey,
        runnableFor(componentProvider, () => wrapperComponentProvider),
      );
    },

    registerRunnable(appKey, run) {
      return register(appKey, run);
    },

    registerSection(appKey, componentProvider) {
      return register(
        appKey,
        runnableFor(componentProvider, () => wrapperComponentProvider),
        true,
      );
    },

    runApplication(appKey, appParameters) {
      const run = runnables.get(appKey);
      if (run === undefined) {
        dlog(`AppRegistry.runApplication: no app registered for "${appKey}"`);
        return;
      }
      run(appParameters);
    },

    unmountApplicationComponentAtRootTag(rootTag) {
      dlog(
        `AppRegistry.unmountApplicationComponentAtRootTag: rootTag ${String(rootTag)}`,
      );
      hostRegistrar?.unmountAtRootTag?.(rootTag);
    },

    setWrapperComponentProvider(provider) {
      wrapperComponentProvider = provider;
    },

    getAppKeys() {
      return [...runnables.keys()];
    },

    getRunnable(appKey) {
      return runnables.get(appKey);
    },

    getSectionKeys() {
      return [...sections.keys()];
    },

    getSections() {
      return Object.fromEntries(sections);
    },

    getRegistry() {
      return {
        sections: [...sections.keys()],
        runnables: Object.fromEntries(runnables),
      };
    },

    registerHeadlessTask(taskKey, taskProvider) {
      AppRegistry.registerCancellableHeadlessTask(
        taskKey,
        taskProvider,
        () => () => {},
      );
    },

    registerCancellableHeadlessTask(taskKey, taskProvider, taskCancelProvider) {
      if (taskProviders.has(taskKey)) {
        dlog(
          `AppRegistry: headless task registered multiple times for key "${taskKey}"`,
        );
      }
      taskProviders.set(taskKey, taskProvider);
      taskCancelProviders.set(taskKey, taskCancelProvider);
      hostRegistrar?.registerCancellableHeadlessTask?.(
        taskKey,
        taskProvider,
        taskCancelProvider,
      );
    },

    startHeadlessTask(taskId, taskKey, data) {
      runHeadlessTask(taskId, taskKey, data);
    },

    cancelHeadlessTask(taskId, taskKey) {
      dlog(`AppRegistry.cancelHeadlessTask: ${taskKey} (taskId=${taskId})`);
      const cancelProvider = taskCancelProviders.get(taskKey);
      if (cancelProvider === undefined) {
        dlog(
          `AppRegistry.cancelHeadlessTask: no canceller registered for key "${taskKey}"`,
        );
        return;
      }
      cancelProvider()();
    },
  };

  return {
    AppRegistry,
    setHostRegistrar(registrar) {
      if (hostRegistrar === registrar) return;
      hostRegistrar = registrar;
      // Headless tasks are commonly registered before adapter bootstrap attaches RN's callable
      // AppRegistry. Replay only this missing native-facing registry; app runnables retain their
      // existing register-after-bootstrap contract.
      for (const [taskKey, taskProvider] of taskProviders) {
        const taskCancelProvider = taskCancelProviders.get(taskKey);
        if (taskCancelProvider !== undefined) {
          registrar.registerCancellableHeadlessTask?.(
            taskKey,
            taskProvider,
            taskCancelProvider,
          );
        }
      }
    },
  };
}
