// Mount a Vue app onto a Fabric surface. The native host hands us a rootTag; we create
// a surface for it and let the Vue renderer drive the engine, which commits into
// nativeFabricUIManager; RN's own renderer never in the path.

import {
  createSurface,
  disposeRoot,
  dlog,
  reportUncaughtError,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import type {
  App,
  Component,
  ComponentInternalInstance,
  ComponentPublicInstance,
} from '@vue/runtime-core';
import { createSymbioteRenderer } from './renderer';

// One Vue app per surface, so a surface can be torn down (unmount) or cleanly
// re-mounted on the same rootTag: the bridgeless host stops and restarts a surface on
// Fast Refresh and on lifecycle/focus changes, reusing the rootTag.
const apps = new Map<IRootTag, App>();

// A stack this deep already names the screen; the rest is noise in a redbox.
const MAX_STACK_FRAMES = 20;

// SFC components carry their name on `__name` (the compiler's), plain ones on `name`; neither is
// on Vue's public `ConcreteComponent` type, hence the guarded read rather than a cast.
function displayName(type: object): string {
  for (const key of ['name', '__name']) {
    const value: unknown = Reflect.get(type, key);
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return 'Anonymous';
}

// Vue's own component trace (getComponentTrace, used by `warn`) is internal, so the frames are
// walked off the public instance's parent chain. LogBox renders whatever string it is handed;
// React's shape is `\n    in <Name>`, and matching it keeps the redbox reading the same in an
// app that mixes adapters' errors in one console.
function componentStack(
  instance: ComponentPublicInstance | null,
): string | null {
  if (instance === null) return null;

  const frames: string[] = [];
  let current: ComponentInternalInstance | null = instance.$;
  while (current !== null && frames.length < MAX_STACK_FRAMES) {
    frames.push(`\n    in ${displayName(current.type)}`);
    current = current.parent;
  }

  return frames.length === 0 ? null : frames.join('');
}

// The app-level error seam. Without it, an unclaimed error fell through to Vue's own `logError`
// (runtime-core errorHandling.ts), which does neither useful thing: in a dev bundle it RE-THROWS
// out of `app.mount()`, so it escapes this function, aborts the AppRegistry runnable and leaves
// the surface half-brought-up; in a release bundle it console.errors a bare error with no origin
// and no component context, never touching `global.ErrorUtils`, so nothing reaches the host.
// Setting a handler suppresses both branches and routes to the engine's shared channel instead —
// the native redbox on a device, console.error off one.
//
// CAUGHT vs UNCAUGHT — the asymmetry is Vue's own, and it costs us no code. `handleError` walks
// the `onErrorCaptured` chain BEFORE consulting `config.errorHandler`, and a hook returning
// `false` stops propagation and returns early (runtime-core 3.5 errorHandling.ts), so a boundary
// that claims the error never reaches this function at all. That is the behaviour we want and
// the same split the React adapter makes by hand: writing a boundary IS the developer saying
// "I am handling this", and answering it with a full-screen redbox over the fallback the app
// just rendered contradicts what the app asked for.
//
// So do NOT "fix" this to report from inside an `onErrorCaptured` of our own — that would
// re-report exactly the errors a boundary claimed. A hook that returns undefined instead of
// `false` still lands here, and correctly: Vue treats that error as still propagating.
function reportToHost(
  error: unknown,
  instance: ComponentPublicInstance | null,
  info: string,
): void {
  // `info` is Vue's own phase label ('render function', 'setup function', 'native event
  // handler'), which is the closest thing it has to React's "no error boundary" / "recovered"
  // qualifier. Off a native host it prefixes the log line, where there is no redbox to carry it.
  reportUncaughtError(error, {
    origin: `vue render (${String(info)})`,
    componentStack: componentStack(instance),
  });
}

// Real Vue hands the app object back from `createApp` so the developer can `use()` a plugin,
// `provide()` a value, or set `config.errorHandler` before mounting. Ours is created inside
// `mount()` — the RN host owns the entry point, and `mount` has to return the surface — so this
// is the seam that gives those back. It runs AFTER the default error handler is installed and
// BEFORE `app.mount()`, so an app can replace the handler and still catch its own first render.
export type IAppConfigurator = (app: App) => void;

let configurator: IAppConfigurator | undefined;

export function setAppConfigurator(
  configure: IAppConfigurator | undefined,
): void {
  configurator = configure;
}

function teardown(rootTag: IRootTag): void {
  const app = apps.get(rootTag);
  if (app === undefined) return;
  app.unmount();
  apps.delete(rootTag);
  disposeRoot(rootTag);
}

export function mount(
  rootTag: IRootTag,
  rootComponent: Component,
): SymbioteSurface {
  // A re-mount on a live rootTag starts clean; otherwise the stale app double-drives
  // the surface.
  teardown(rootTag);

  const surface = createSurface(rootTag);
  const renderer = createSymbioteRenderer(surface);
  const app = renderer.createApp(rootComponent);
  app.config.errorHandler = reportToHost;
  configurator?.(app);
  apps.set(rootTag, app);

  // The surface IS the Vue container: a top-level mutation routes to surface.appendChild
  // (renderer.ts), and the engine wraps surface.children in its synthetic flex root.
  app.mount(surface);

  return surface;
}

// Tear down a surface by rootTag: the public pair of `mount`, and the JS half of the
// bridgeless `RN$stopSurface` contract (see installStopSurfaceGlobal).
export function unmount(rootTag: IRootTag): void {
  dlog(`unmount root=${rootTag}`);
  teardown(rootTag);
}

// `global.RN$stopSurface` is the JSI hook C++ AppRegistryBinding::stopSurface calls to
// stop a Fabric surface. RN installs it from its own renderer; symbiote REPLACES that
// renderer, so without this the binding throws "Global was not installed" on every
// surface stop (Fast Refresh, focus/lifecycle) and the screen goes blank. Same contract
// as the React adapter: an app uses one adapter, so exactly one installer runs.
declare global {
  var RN$stopSurface: ((surfaceId: number) => void) | undefined;
}

function installStopSurfaceGlobal(): void {
  globalThis.RN$stopSurface = (surfaceId: number): void => {
    unmount(surfaceId);
  };
  dlog('installed global.RN$stopSurface');
}

installStopSurfaceGlobal();
