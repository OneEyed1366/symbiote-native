// Mounts a Svelte app onto a Fabric surface through `svelte/renderer`
// The native host hands over a `rootTag`, and the surface made for it is the mount target

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
import { liveSurfaces } from './active-surface';
import { createRootElement } from './root-element';
import symbioteRenderer from './symbiote-renderer';
import { ROOT_TAG_KEY, SURFACE_KEY } from './runes/use-root-tag';

type IMountedApp = {
  readonly svelteApp: ReturnType<typeof svelteMount>;
  readonly surface: SymbioteSurface;
};

// One app per surface, as a restart reuses the `rootTag` and has to start clean
const apps = new Map<IRootTag, IMountedApp>();

function teardown(rootTag: IRootTag): void {
  const entry = apps.get(rootTag);
  if (entry === undefined) return;
  svelteUnmount(entry.svelteApp);
  liveSurfaces.delete(entry.surface);
  apps.delete(rootTag);
  disposeRoot(rootTag);
}

// `transformError` runs once a `<svelte:boundary>` claims an error, one hook covers every boundary
// A read-only tap: the error returns untouched, so the `failed` snippet still gets it
// Logged, not reported: a boundary means the dev handles it, no redbox over the fallback
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

  const surface = createSurface(rootTag);
  liveSurfaces.add(surface);
  const target = createRootElement(surface);

  let svelteApp: ReturnType<typeof svelteMount>;
  try {
    svelteApp = svelteMount(RootComponent, {
      renderer: symbioteRenderer,
      target,
      props: props ?? {},
      context: new Map<symbol, unknown>([
        [ROOT_TAG_KEY, rootTag],
        [SURFACE_KEY, surface],
      ]),
      transformError: tapBoundaryError,
    });
  } catch (error) {
    liveSurfaces.delete(surface);
    // Svelte has no mount-level hook for an uncaught error, so the seam is the synchronous throw
    // Reported and rethrown, `mount()` keeps failing loudly for a caller's own try/catch
    // Later errors land in svelte's microtask flush, past this catch
    reportUncaughtError(error, {
      origin: 'svelte render (no <svelte:boundary>)',
    });
    throw error;
  }

  apps.set(rootTag, { svelteApp, surface });

  return surface;
}

// The public pair of `mount`, and the JS half of the bridgeless `RN$stopSurface` contract
export function unmount(rootTag: IRootTag): void {
  dlog(`svelte unmount root=${rootTag}`);
  teardown(rootTag);
}

// `global.RN$stopSurface` is what `AppRegistryBinding::stopSurface` calls to stop a surface
// RN installs it from its own renderer, which is replaced here, so every stop would throw
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
