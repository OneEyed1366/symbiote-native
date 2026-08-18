// Mount a Solid app onto a Fabric surface. The native host hands us a rootTag; we create a surface
// for it and let Solid's universal renderer drive the engine, which commits into
// nativeFabricUIManager — RN's own renderer never in the path.

import {
  createSurface,
  disposeRoot,
  dlog,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import type { Component } from 'solid-js';
import { createComponent, render, setActiveSurface } from './renderer';

// One Solid root per surface, so a surface can be torn down (unmount) or cleanly re-mounted on the
// same rootTag: the bridgeless host stops and restarts a surface on Fast Refresh and on
// lifecycle/focus changes, reusing the rootTag. The value is Solid's own dispose function — the
// whole reactive root goes with it, effects and cleanups included.
const roots = new Map<IRootTag, () => void>();

function teardown(rootTag: IRootTag): void {
  const dispose = roots.get(rootTag);
  if (dispose === undefined) return;
  dispose();
  roots.delete(rootTag);
  // Cleared AFTER dispose() on purpose: disposing runs user cleanups, which can still mutate the
  // tree, and those mutations should reach the surface they belong to rather than be dropped by
  // renderer.ts's post-unmount guard.
  setActiveSurface(undefined);
  disposeRoot(rootTag);
}

export function mount(
  rootTag: IRootTag,
  RootComponent: Component,
): SymbioteSurface {
  // A re-mount on a live rootTag starts clean; otherwise the stale root double-drives the surface.
  teardown(rootTag);

  const surface = createSurface(rootTag);
  setActiveSurface(surface);

  // `createComponent(RootComponent, {})` is exactly what compiled JSX emits for `<RootComponent />`
  // — written by hand here because this file is plain TS, deliberately: render.ts is the one module
  // an app's entry point imports before any JSX has been compiled, so keeping it JSX-free means it
  // needs no Babel pass of its own.
  //
  // The surface IS the render container: a top-level insert routes to surface.appendChild
  // (renderer.ts's insertNode), and the engine wraps surface.children in its synthetic flex root.
  const dispose = render(() => createComponent(RootComponent, {}), surface);
  roots.set(rootTag, dispose);

  return surface;
}

// Tear down a surface by rootTag: the public pair of `mount`, and the JS half of the bridgeless
// `RN$stopSurface` contract (see installStopSurfaceGlobal below).
export function unmount(rootTag: IRootTag): void {
  dlog(`solid unmount root=${rootTag}`);
  teardown(rootTag);
}

// `global.RN$stopSurface` is the JSI hook C++ AppRegistryBinding::stopSurface calls to stop a Fabric
// surface. RN installs it from its own renderer; symbiote REPLACES that renderer, so without this
// the binding throws "Global was not installed" on every surface stop (Fast Refresh,
// focus/lifecycle) and the screen goes blank. Same contract as every other adapter: an app uses one
// adapter, so exactly one installer runs.
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
