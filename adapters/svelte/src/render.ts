// Mount a Svelte app onto a Fabric surface. The native host hands us a rootTag; we create a
// surface for it and a real engine root node, then hand Svelte's OWN mount() our renderer via
// `{ renderer }` (svelte-adapter-custom-renderer skill) — no more globalThis DOM patching, no
// more shim classes. `setActiveSurface` is what actually wires commits: renderer.ts's module-
// level renderer object (the SAME instance every compiled component auto-imports) reads it,
// since single root per process is still the design (unchanged from §10 of the retired
// svelte-adapter-dom-shim skill) — just one variable instead of nine patched globals.

import { mount as svelteMount, unmount as svelteUnmount, type Component } from 'svelte';
import {
  createSurface,
  disposeRoot,
  dlog,
  routeProp,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { createElementNode, setActiveSurface, symbioteRenderer } from './renderer';

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

const ROOT_INTRINSIC = 'symbiote-view';

// Unlike Vue/React, whose app root mounts directly onto the surface (its own flex:1 class/style
// reaches the engine's synthetic flex:1 AppContainer with nothing in between), Svelte's mount()
// needs a real target node to insert into — without flex:1 here, a flex:1-styled app root nested
// one level inside it has no resolved parent height to grow into and the whole tree collapses to
// 0x0 (nothing throws; it only shows up as a blank, untappable screen).
const ROOT_WRAPPER_STYLE = { flex: 1 };

export function mount(
  rootTag: IRootTag,
  RootComponent: Component,
  props?: object,
): SymbioteSurface {
  teardown(rootTag);

  const surface = createSurface(rootTag);
  setActiveSurface(surface);
  const target = createElementNode(ROOT_INTRINSIC);
  routeProp(target, 'style', ROOT_WRAPPER_STYLE);
  surface.appendChild(target);
  surface.requestCommit();

  const svelteApp = svelteMount(RootComponent, {
    target,
    renderer: symbioteRenderer,
    props: props ?? {},
  });
  apps.set(rootTag, { svelteApp });

  return surface;
}

// Tear down a surface by rootTag: the public pair of `mount`, and the JS half of the
// bridgeless `RN$stopSurface` contract (see installStopSurfaceGlobal below).
export function unmount(rootTag: IRootTag): void {
  dlog(`svelte unmount root=${rootTag}`);
  teardown(rootTag);
  setActiveSurface(undefined);
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
