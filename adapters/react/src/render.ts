// Mount a React element tree onto a Fabric surface. The native host hands us a
// rootTag (via AppRegistry.registerRunnable); we create a surface for it and let
// the reconciler drive shared, which commits into nativeFabricUIManager.

import type { ReactNode } from 'react';
import {
  createSurface,
  disposeRoot,
  isSymbioteNode,
  registerPostCommit,
  setEventDispatcher,
  setNodeOwner,
  dlog,
  reportUncaughtError,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import reconciler, { flushExternalUpdate } from './host-config';
import { LegacyRoot } from './reconciler-constants';

const noop = (): void => {};

// createContainer's three error callbacks. They were all `noop`, which made a throw anywhere in
// render vanish: the reconciler abandons the commit, so nothing paints, and nothing is logged
// either - the app shows a blank screen with no clue in the console. React's own defaults hand
// the error to the host (ReactFiberErrorLogger.js: reportGlobalError / console.error) and RN
// wraps them again to reach the redbox (ReactFabric.js: nativeOnUncaughtError); ours route
// through the engine to the same native channel.
type IReactErrorInfo = {
  readonly componentStack?: string | null;
};

function errorReporter(
  origin: string,
): (error: unknown, info: IReactErrorInfo) => void {
  return (error, info) => {
    reportUncaughtError(error, { origin, componentStack: info.componentStack });
  };
}

const onUncaughtError = errorReporter('react render (no error boundary)');
// A boundary handled it, so it does NOT reach the native redbox — it goes to , off unless
// DEBUG is set.
//
// This deliberately DIVERGES from upstream, whose nativeOnCaughtError calls the same
// showErrorDialog as the uncaught path. The argument for upstream's choice is that the boundary
// decides what the USER sees, not whether the developer hears. The argument against, and the one
// this project takes: writing an ErrorBoundary IS the developer saying "I know this can throw and
// I am handling it here". Answering that with a full-screen redbox over the fallback the app just
// rendered contradicts the thing the app asked for, and it is the only adapter here that did it —
// Solid's ErrorBoundary is silent, and its canary reads as correct next to React's alarming one.
// An UNCAUGHT error still hits the redbox; the difference is exactly whether someone claimed it.
const onCaughtError = (error: unknown, info: IReactErrorInfo): void => {
  dlog(
    () =>
      `react render (caught by error boundary): ${String(error)}${
        info.componentStack ?? ''
      }`,
  );
};
// React recovered on its own (a concurrent render retried and succeeded), so this is not fatal -
// but it is still a real error the app swallowed a first render over. RN keeps React's
// defaultOnRecoverableError here, which reports it globally.
const onRecoverableError = errorReporter('react render (recovered)');

// A native event runs the listener (which may call setState) outside React's
// loop. Run it at discrete priority so the update takes the sync lane, then
// flush that work synchronously to paint the result.
//
// Diagnostic seam (gated, perf investigation): every native event forces its own
// synchronous flush here, with no continuous-vs-discrete split (unlike DOM React,
// which lets high-frequency continuous events like drag/scroll coalesce). This
// dlog counts how many forced flushes one gesture (e.g. a Slider drag) produces,
// to compare against Vue/Angular's microtask-coalesced requestCommit(). Kept
// behind DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
setEventDispatcher(run => {
  dlog('react event-dispatch: forced flushSyncWork');
  flushExternalUpdate(run);
});

// The reconciler container per surface, so a surface can be torn down (unmount)
// or cleanly re-mounted on the same rootTag. The bridgeless host stops and restarts a
// surface on Fast Refresh and on lifecycle/focus changes, reusing the rootTag.
type IOpaqueRoot = ReturnType<typeof reconciler.createContainer>;
const containers = new Map<IRootTag, IOpaqueRoot>();

// Devtools-only: tags every host node with the developer-authored React component that
// created it, for packages/devtools' panel (ISymbioteNodeOwner — see the
// symbiote-devtools-inspector skill for the per-adapter design). React's host config gets no
// such information at all (createInstance is only ever called with a resolved host type, after
// React has already walked past every composite component) — the Fiber tree itself is the only
// place this exists, so unlike Vue/Angular this is a separate tree walk, not a tag applied at
// node-creation time. Runs on every commit; not gated behind a subscription flag because it is
// cheap relative to the Fabric commit that just happened, mirroring the "simple, dev-only,
// acceptable cost" call already made for the rest of this feature (see the skill).
function resolveFiberComponentName(type: unknown): string | undefined {
  if (typeof type !== 'function') return undefined;
  const displayName = Reflect.get(type, 'displayName');
  if (typeof displayName === 'string' && displayName !== '') return displayName;
  const name = Reflect.get(type, 'name');
  return typeof name === 'string' && name !== '' ? name : undefined;
}

function tagFiberOwners(
  fiber: unknown,
  ambientOwner: string | undefined,
): void {
  if (typeof fiber !== 'object' || fiber === null) return;

  const ownName = resolveFiberComponentName(Reflect.get(fiber, 'type'));
  const effectiveOwner = ownName ?? ambientOwner;

  const stateNode = Reflect.get(fiber, 'stateNode');
  if (effectiveOwner !== undefined && isSymbioteNode(stateNode)) {
    // TODO(devtools-owner-chain): single-element chain — tags only the nearest composite
    // ancestor, same as before this field became a chain. A composing-only component (renders
    // exclusively through other components, never a host type directly) never becomes
    // `effectiveOwner` for any node and so never appears, mirroring the gap fixed for Svelte via
    // its `__svelte_meta.parent` call-stack — see the symbiote-devtools-inspector skill. Bringing
    // React to full parity means walking the FULL fiber ancestor chain here, not just this
    // nearest-composite value.
    setNodeOwner(stateNode, { chain: [{ component: effectiveOwner }] });
  }

  // `child`/`sibling` is the standard Fiber tree shape (react-reconciler, not our own type) — a
  // sibling shares ITS parent's ambient owner, not the owner just resolved for this fiber, so it
  // recurses with the ambient passed into this call, not `effectiveOwner`.
  tagFiberOwners(Reflect.get(fiber, 'child'), effectiveOwner);
  tagFiberOwners(Reflect.get(fiber, 'sibling'), ambientOwner);
}

registerPostCommit(() => {
  if (Reflect.get(globalThis, '__DEV__') !== true) return;
  for (const container of containers.values()) {
    tagFiberOwners(Reflect.get(container, 'current'), undefined);
  }
});

// Unmount a surface's React tree (render null → empty completeRoot, clearing the
// native views) and drop its shared root container so a later mount on the same
// rootTag rebuilds from scratch instead of cloning the stopped surface's dead handles.
function teardown(rootTag: IRootTag): void {
  const container = containers.get(rootTag);
  if (container === undefined) return;
  // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
  reconciler.updateContainerSync(null, container, null, noop);
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork();
  containers.delete(rootTag);
  disposeRoot(rootTag);
}

export function mount(rootTag: IRootTag, element: ReactNode): SymbioteSurface {
  // A re-mount on a live rootTag (host restarted the surface without stopping it
  // first) starts clean. Otherwise the stale container double-drives the surface.
  teardown(rootTag);

  const surface = createSurface(rootTag);

  const container = reconciler.createContainer(
    surface,
    LegacyRoot,
    null,
    false,
    null,
    'symbiote',
    onUncaughtError,
    onCaughtError,
    onRecoverableError,
    // onDefaultTransitionIndicator - the ONE that is genuinely a no-op. RN's own renderer says
    // so in as many words: "Native doesn't have a default indicator" (ReactFabric.js's
    // nativeOnDefaultTransitionIndicator).
    noop,
    null,
  );
  containers.set(rootTag, container);

  // react-reconciler 0.33 exposes updateContainerSync + flushSyncWork for an
  // immediate render/commit; @types 0.32 still lists the older updateContainer /
  // flushSync names, so these calls are type-suppressed until the types catch up.
  // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
  reconciler.updateContainerSync(element, container, null, noop);
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork();

  return surface;
}

// Tear down a surface by rootTag, the public pair of `mount`. This is also the JS half of
// the bridgeless `RN$stopSurface` contract (see installStopSurfaceGlobal): the native
// AppRegistryBinding calls our global to stop a surface; we unmount its tree and dispose its root.
export function unmount(rootTag: IRootTag): void {
  dlog(`unmount root=${rootTag}`);
  teardown(rootTag);
}

// `global.RN$stopSurface` is the JSI hook the C++ AppRegistryBinding::stopSurface calls
// to stop a Fabric surface. RN installs it from its own renderer (ReactFabric.js:
// `global.RN$stopSurface = ReactFabric.stopSurface`). Because symbiote REPLACES RN's
// renderer, that line never runs, so without this the binding throws "Global was not
// installed" on every surface stop. Fast Refresh and focus/lifecycle changes then fail
// to tear down, the host loops start/stop, and the screen goes blank. We install our own.
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
