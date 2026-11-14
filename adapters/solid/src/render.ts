// Mount a Solid app onto a Fabric surface. The native host hands us a rootTag; we create a surface
// for it and let Solid's universal renderer drive the engine, which commits into
// nativeFabricUIManager — RN's own renderer never in the path.

import {
  createSurface,
  disposeRoot,
  dlog,
  reportUncaughtError,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { catchError, createRoot, type Component } from 'solid-js';
import { createComponent, insert, setActiveSurface } from './renderer';
import { RootTagContext } from './root-tag-context';

// One Solid root per surface, so a surface can be torn down or re-mounted on the same `rootTag`
// The bridgeless host does that on Fast Refresh and on lifecycle or focus changes
// The value is Solid's own `dispose`, the whole reactive root goes with it
const roots = new Map<IRootTag, () => void>();

// Insertion-ordered, so the last entry is the most recently mounted surface. Kept alongside
// `roots` only to answer one question: when a surface is torn down, is there another one still
// live for the renderer to keep committing into?
const surfaces = new Map<IRootTag, SymbioteSurface>();
let activeRootTag: IRootTag | undefined;

function teardown(rootTag: IRootTag): void {
  const dispose = roots.get(rootTag);
  if (dispose === undefined) return;
  dispose();
  roots.delete(rootTag);
  surfaces.delete(rootTag);
  // Cleared after `dispose()`, since user cleanups run inside it and can still mutate the tree
  // Cleared only for the surface the renderer commits into, else a live surface goes dead
  // With two surfaces up, unmounting the first must leave the second painting, as `createTunnel`
  if (activeRootTag !== rootTag) {
    disposeRoot(rootTag);
    return;
  }
  const remaining = Array.from(surfaces.entries()).pop();
  activeRootTag = remaining?.[0];
  setActiveSurface(remaining?.[1]);
  disposeRoot(rootTag);
}

// The root error seam. Without it a throw under the root reached nobody: Solid unwinds to whoever
// is on the stack — the native event dispatcher for an update, the host's AppRegistry runnable for
// the first paint — and neither logs. `catchError` is what `<ErrorBoundary>` itself is built from,
// so a throw in a component body, a memo or an effect all arrive here through one ERROR context.
//
// CAUGHT vs UNCAUGHT: an `<ErrorBoundary>` OVERRIDES that context for its subtree, so an error it
// claims never reaches this function and stays silent. Keep it that way — writing a boundary IS the
// developer saying "this can throw and I handle it", and a full-screen redbox over the fallback the
// app just rendered contradicts that. React and Vue were aligned TO Solid here; do not invert it.
//
// Then RETHROWN, unlike the React, Vue and Angular adapters. Those sit on a reconciler that can
// abandon one subtree and leave a live tree on screen, so swallowing leaves something coherent.
// Solid has no reconciler — `insert` REPLACES — so an error leaves a half-built tree, and it is
// this adapter's tested contract that a bare string outside `<Text>` throws out of `mount`. The
// report is additive: it is the half that survives when the catching frame is native code.
//
// The rethrow costs one latch. `handleError` hands the error to the FIRST owner whose context
// carries a handler, and every descendant inherits that context BY COPY — so throwing back out
// lands in `handleError` again at the next owner up, all the way to the root. Measured on a
// four-deep tree: one error, six reports. The latch is per-root, so a later, DIFFERENT error still
// reports; it swallows only the same Error OBJECT thrown twice, which no code here does.
type IUnwinding = { readonly error: unknown };

export function mount(
  rootTag: IRootTag,
  RootComponent: Component,
): SymbioteSurface {
  // A re-mount on a live rootTag starts clean; otherwise the stale root double-drives the surface.
  teardown(rootTag);

  const surface = createSurface(rootTag);
  surfaces.set(rootTag, surface);
  activeRootTag = rootTag;
  setActiveSurface(surface);

  // `createComponent` is what compiled JSX emits, written by hand: render.ts must stay JSX-free
  // `createRoot` + `insert` is `render()` spelled out, so `catchError` wraps the insert as well
  // The Provider hands the surface tag to `useContext(RootTagContext)` for the whole tree
  let unwinding: IUnwinding | undefined;

  const dispose = createRoot(disposeRootScope => {
    catchError(
      () => {
        insert(
          surface,
          createComponent(RootTagContext.Provider, {
            value: rootTag,
            get children() {
              return createComponent(RootComponent, {});
            },
          }),
        );
      },
      error => {
        if (unwinding?.error !== error) {
          unwinding = { error };
          reportUncaughtError(error, { origin: 'solid render' });
        }
        throw error;
      },
    );
    return disposeRootScope;
  });
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
