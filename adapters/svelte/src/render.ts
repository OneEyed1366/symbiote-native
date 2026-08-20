// Mount a Svelte app onto a Fabric surface. The native host hands us a rootTag; we create a
// surface for it, install the DOM shim, and let stock compiled Svelte output drive it while
// believing it is talking to the real DOM. Decided during Svelte adapter planning
// (2026-08-11, svelte-adapter-dom-shim skill §10): single root per process, so
// patchGlobals()/restoreGlobals() need no ref-counting.

import {
  mount as svelteMount,
  unmount as svelteUnmount,
  type Component,
} from 'svelte';
import {
  createSurface,
  disposeRoot,
  dlog,
  reportUncaughtError,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { patchGlobals, restoreGlobals } from './dom-shim';
import { createRootShimElement } from './root-element';

type IMountedApp = {
  readonly svelteApp: ReturnType<typeof svelteMount>;
};

// One Svelte app per surface — same re-mount-starts-clean shape as every other adapter's
// render.ts (Fast Refresh / focus-lifecycle restarts a surface and reuses the rootTag).
const apps = new Map<IRootTag, IMountedApp>();

function teardown(rootTag: IRootTag): void {
  const entry = apps.get(rootTag);
  if (entry === undefined) return;
  svelteUnmount(entry.svelteApp);
  apps.delete(rootTag);
  disposeRoot(rootTag);
}

// `transformError` is svelte's own mount-level hook for errors a `<svelte:boundary>` is about to
// HANDLE - upstream reaches for it to run SvelteKit's `handleError`. Svelte calls it only from
// Boundary.#handle_error (dom/blocks/boundary.js), i.e. only once some boundary with an `onerror`
// or a `failed` snippet has claimed the error, and it inherits down the boundary tree, so one
// hook at mount covers every boundary the app writes. We use it as a read-only tap and return the
// error untouched, so the `failed` snippet still receives the real thing.
//
// Why this is `dlog` and NOT reportUncaughtError - read this before "fixing" it back: writing a
// `<svelte:boundary>` IS the developer saying "this can throw and I am handling it here".
// Answering that with a full-screen redbox over the fallback the app just rendered contradicts
// what the app asked for. The UNCAUGHT path below still reports; the only difference is whether
// anyone claimed the error. Same asymmetry as the React adapter's onCaughtError.
function tapBoundaryError(error: unknown): unknown {
  dlog(() => `svelte render (caught by <svelte:boundary>): ${String(error)}`);
  return error;
}

export function mount(
  rootTag: IRootTag,
  RootComponent: Component,
  props?: object,
): SymbioteSurface {
  teardown(rootTag);

  // Safe to install unconditionally - patchGlobals() is itself idempotent if a surface is
  // already live.
  patchGlobals();

  const surface = createSurface(rootTag);
  const target = createRootShimElement(surface);

  let svelteApp: ReturnType<typeof svelteMount>;
  try {
    svelteApp = svelteMount(RootComponent, {
      target,
      props: props ?? {},
      transformError: tapBoundaryError,
    });
  } catch (error) {
    // Svelte has no mount-level hook for an UNCAUGHT error, so the seam is the throw itself:
    // while a subtree is still being created, error-handling.js rethrows synchronously
    // (`handle_error` bails out before REACTION_RAN is set, and the implicit root boundary
    // `_mount` installs carries only a `pending` snippet, so it re-throws too). Without this the
    // throw left the surface half-committed - nothing painted, nothing logged, a blank screen.
    //
    // Reported AND rethrown, deliberately: the report is the channel we control and is the whole
    // point of this seam, while the rethrow keeps upstream's contract that `mount()` fails loudly
    // - an app or a test harness wrapping mount() in its own try/catch must still see the error.
    //
    // Reaches the SYNCHRONOUS mount-time throw only. An error raised later - a reactive update,
    // an `$effect` body, a rejected `{#await}` - is rethrown from inside svelte's own microtask
    // flush (queue_micro_task, internal/client/dom/task.js), past any try/catch of ours; those
    // land on the host's uncaught-exception path. `flushSync()` here would pull the mount-time
    // `$effect` case in, at the price of running user effects BEFORE the engine's first commit,
    // where getNativeTag() is still undefined - a worse bug than the one it closes.
    reportUncaughtError(error, {
      origin: 'svelte render (no <svelte:boundary>)',
    });
    throw error;
  }

  apps.set(rootTag, { svelteApp });

  return surface;
}

// Tear down a surface by rootTag: the public pair of `mount`, and the JS half of the
// bridgeless `RN$stopSurface` contract (see installStopSurfaceGlobal below).
export function unmount(rootTag: IRootTag): void {
  dlog(`svelte unmount root=${rootTag}`);
  teardown(rootTag);
  // No other surface can still need the shim (single root per process, see module header).
  restoreGlobals();
}

// `global.RN$stopSurface` is the JSI hook C++ AppRegistryBinding::stopSurface calls to stop a
// Fabric surface. RN installs it from its own renderer; symbiote REPLACES that renderer, so
// without this the binding throws "Global was not installed" on every surface stop (Fast
// Refresh, focus/lifecycle) and the screen goes blank. Same contract as every other adapter:
// an app uses one adapter, so exactly one installer runs.
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
