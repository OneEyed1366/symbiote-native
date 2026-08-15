// Mount a Svelte app onto a Fabric surface. The native host hands us a rootTag; we create a
// surface for it, install the DOM shim, and let stock compiled Svelte output drive it while
// believing it is talking to the real DOM. Decided during Svelte adapter planning
// (2026-08-11, svelte-adapter-dom-shim skill §10): single root per process, so
// patchGlobals()/restoreGlobals() need no ref-counting.

import { mount as svelteMount, unmount as svelteUnmount, type Component } from 'svelte';
import {
  createSurface,
  disposeRoot,
  dlog,
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

export function mount(
  rootTag: IRootTag,
  RootComponent: Component,
  props?: object,
): SymbioteSurface {
  teardown(rootTag);

  // Single root per process (decided 2026-08-11): safe to install unconditionally —
  // patchGlobals() is itself idempotent if a surface is already live.
  patchGlobals();

  const surface = createSurface(rootTag);
  const target = createRootShimElement(surface);
  const svelteApp = svelteMount(RootComponent, { target, props: props ?? {} });
  apps.set(rootTag, { svelteApp });

  return surface;
}

// Tear down a surface by rootTag: the public pair of `mount`, and the JS half of the
// bridgeless `RN$stopSurface` contract (see installStopSurfaceGlobal below).
export function unmount(rootTag: IRootTag): void {
  dlog(`svelte unmount root=${rootTag}`);
  teardown(rootTag);
  // Single root per process: no other surface can still need the shim, so this is always
  // safe — no ref-counting (svelte-adapter-dom-shim skill §10).
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
