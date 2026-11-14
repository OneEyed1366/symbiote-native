// Mount an Angular app onto a Fabric surface. The native host hands us a rootTag; we
// create a surface and bootstrap a standalone Angular component WITHOUT platform-browser
// (no DOM) — createEnvironmentInjector + createComponent over @angular/core only, with our
// SymbioteRendererFactory provided so Angular drives the engine, which commits into
// nativeFabricUIManager; RN's own renderer never in the path. Angular twin of
// adapters/vue/src/render.ts.

import {
  createElement as createEngineElement,
  createSurface,
  disposeRoot,
  dlog,
  reportUncaughtError,
  toPublicInstance,
  type ISymbioteNode,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import {
  ApplicationRef,
  createComponent,
  createEnvironmentInjector,
  DOCUMENT,
  enableProdMode,
  ErrorHandler,
  RendererFactory2,
  ɵINJECTOR_SCOPE as INJECTOR_SCOPE,
  ɵprovideZonelessChangeDetectionInternal as provideZonelessChangeDetectionInternal,
  type ComponentRef,
  type EnvironmentInjector,
  type EnvironmentProviders,
  type Provider,
  type Type,
} from '@angular/core';
import { SymbioteRendererFactory } from '../renderer';
import { ROOT_TAG } from '../root-tag';
import { ColorSchemeService, WindowDimensionsService } from '../services';

// The two FFI-edge casts of this adapter, both confined here to bootstrap. Angular's core
// types model a browser: the injector parent is a non-null EnvironmentInjector, the host is
// a DOM Element. Our root has neither shape — a null parent IS a root injector, and the host
// is a SymbioteSurface (or, for a wrapped AppRegistry root, a plain engine node) the
// SymbioteRenderer (not the DOM) consumes. These are the sanctioned I/O-edge casts where our
// objects cross into Angular's web-typed API; revisit if Angular ever exposes a cast-free
// host. Nothing else in the adapter casts.
function rootInjectorParent(): EnvironmentInjector {
  return null as unknown as EnvironmentInjector;
}
function asAngularHost(hostNode: SymbioteSurface | ISymbioteNode): Element {
  // Angular's locateHostElement reads hostElement.tagName even when a concrete hostElement
  // is supplied. The host container is given Angular the tiny DOM-shaped field it probes
  // without changing the renderer target.
  Object.defineProperty(hostNode, 'tagName', {
    configurable: true,
    value: 'symbiote-root',
  });
  return hostNode as unknown as Element;
}

// A bare `view` node made through the engine, since Angular's `createElement` resolves only
// known primitives, never a component selector
// Host of the root when `wrapperComponentProvider` is set, projected into the wrapper
function createDetachedViewHost(): ISymbioteNode {
  // 'view', not 'View': the public name is not a Fabric view name, and until
  // makeDescriptorFor learned to reject one it fell through to a view literally named `View`.
  const descriptor = descriptorFor('view');
  return toPublicInstance(
    createEngineElement(descriptor.component, descriptor.isText),
  );
}

// Angular's whole unhandled-error funnel, routed to the engine for the native redbox
// No caught-vs-uncaught split, Angular has no error boundary and handled errors never arrive
// Never `super.handleError` (double report) and never throws (the scheduler calls it in a `catch`)
class SymbioteErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    reportUncaughtError(error, { origin: 'angular render' });
  }
}

type IMountedApp = {
  cmpRef: ComponentRef<unknown>;
  rootRef: ComponentRef<unknown> | undefined;
  injector: EnvironmentInjector;
  /**
   * Kept so teardown can release it, a `useValue` provider gives the injector nothing to destroy
   * See `SymbioteRendererFactory.dispose`
   */
  rendererFactory: SymbioteRendererFactory;
};

// `wrapperComponentProvider` support: the root renders detached and the wrapper, attached to the
// surface, receives its host as projected content through `<ng-content>`
export type IMountOptions = {
  initialProps?: object;
  wrapperComponent?: Type<unknown>;
};

// App-level providers (`provideHttpClient()` and the like), set once at bootstrap
let rootProviders: (Provider | EnvironmentProviders)[] = [];

export function setRootProviders(
  providers: (Provider | EnvironmentProviders)[],
): void {
  rootProviders = providers;
}

function applyInputs(
  cmpRef: ComponentRef<unknown>,
  initialProps: object | undefined,
): void {
  if (initialProps === undefined) return;
  for (const [key, value] of Object.entries(initialProps)) {
    cmpRef.setInput(key, value);
  }
}

// One Angular app per surface, so a surface can be torn down (unmount) or cleanly
// re-mounted on the same rootTag: the bridgeless host stops and restarts a surface on Fast
// Refresh and on lifecycle/focus changes, reusing the rootTag.
const apps = new Map<IRootTag, IMountedApp>();

function teardown(rootTag: IRootTag): void {
  const app = apps.get(rootTag);
  if (app === undefined) return;
  app.rootRef?.destroy();
  app.cmpRef.destroy();
  app.injector.destroy();
  // AFTER Angular's own teardown, so anything those destroys wrote is published rather than
  // dropped — the renderer flushes what it holds on its way out.
  app.rendererFactory.dispose();
  apps.delete(rootTag);
  disposeRoot(rootTag);
}

// Metro's build switch, and esbuild's in this repo's headless runner
// Declared here, not in an ambient `globals.d.ts`: the AOT tests build their own ngtsc programs
// from an explicit file list that never reaches an ambient declaration
declare const __DEV__: boolean;

/**
 * Turn Angular's assertions off when — and only when — the bundler has said this is a release.
 *
 * `ngDevMode` is a THIRD dev switch, and neither of the two this project already handles reaches
 * it: `initNgDevMode()` turns itself ON whenever the global is undefined (`ng_dev_mode.ts:85`), and
 * `@react-native/babel-preset` inlines `__DEV__` while knowing nothing about Angular. So every
 * release build made with this adapter shipped dev-mode Angular — `inject()` of a special token
 * builds a `new NodeInjector` and emits two profiler events PER ELEMENT
 * (`di.ts:525`, `runInInjectorProfilerContext`). Measured on `angular-elements-suite.itest.ts`,
 * `build-release`, with the census byte-identical on both sides: a 1 000-row create went from
 * ~300 ms to ~223 ms, all of it in pass 1.
 *
 * AN EXPLICIT `false` IS THE ONLY RELEASE SIGNAL. A host that never defines `__DEV__` reads
 * `undefined`, and a `!__DEV__` test would silence every NG-code diagnostic there in exchange for a
 * speed-up nobody asked for. Metro writes a literal `true` or `false`, so the signal exists exactly
 * where it can be trusted.
 *
 * Per mount rather than once per process: `enableProdMode()` only ever writes `false`, so repeating
 * it costs a property write and a guard that has already been taken on every surface but the first.
 *
 * READ AS AN IDENTIFIER, NEVER AS `globalThis.__DEV__`, and that distinction is the whole
 * mechanism. Both Metro and esbuild deliver `__DEV__` by SUBSTITUTING the identifier for a literal,
 * so a property lookup finds nothing whatever the build says. The first spelling of this function
 * used `Reflect.get(globalThis, '__DEV__')`, never fired once in the bench bundle, and measured a
 * clean zero — which reads exactly like "this optimization does not work" and is not that. The
 * `typeof` guard is what makes the bare identifier safe where nothing declares it at all.
 */
function settleAngularDevMode(): void {
  if (typeof __DEV__ === 'undefined' || __DEV__ !== false) return;
  enableProdMode();
}

// Kept apart from `mount` so the provider list reads as one block
function createRootInjector(
  rootTag: IRootTag,
  surface: SymbioteSurface,
  rendererFactory: SymbioteRendererFactory,
): EnvironmentInjector {
  return createEnvironmentInjector(
    [
      ...rootProviders,
      { provide: RendererFactory2, useValue: rendererFactory },
      { provide: ROOT_TAG, useValue: rootTag },
      // `resource()` resolves TransferState, which calls `doc.getElementById`
      // a stub without it throws mid-construction and the whole screen renders nothing
      {
        provide: DOCUMENT,
        useValue: {
          head: surface,
          body: surface,
          getElementById: (): null => null,
        },
      },
      // A null-parent injector is not root-scoped, so `providedIn: 'root'` tokens never resolve
      { provide: INJECTOR_SCOPE, useValue: 'root' },
      // Real microtask-batched scheduler plus a noop zone, so `appRef.tick()` drives the views
      ...provideZonelessChangeDetectionInternal(),
      // Angular's `tick()` looks up `ErrorHandler`, and a from-scratch injector has none (NG0201)
      { provide: ErrorHandler, useClass: SymbioteErrorHandler },
      ColorSchemeService,
      WindowDimensionsService,
    ],
    rootInjectorParent(),
  );
}

type IRoots = {
  cmpRef: ComponentRef<unknown>;
  rootRef: ComponentRef<unknown> | undefined;
};

function createRoots(
  injector: EnvironmentInjector,
  surface: SymbioteSurface,
  rootComponent: Type<unknown>,
  options: IMountOptions | undefined,
): IRoots {
  const { wrapperComponent, initialProps } = options ?? {};
  // `hostElement` is the surface, content commits straight into it with no wrapper view
  if (wrapperComponent === undefined) {
    const cmpRef = createComponent<unknown>(rootComponent, {
      environmentInjector: injector,
      hostElement: asAngularHost(surface),
    });
    applyInputs(cmpRef, initialProps);
    return { cmpRef, rootRef: undefined };
  }
  // The root gets its own host and reaches the wrapper as projected content
  const rootHost = asAngularHost(createDetachedViewHost());
  const rootRef = createComponent<unknown>(rootComponent, {
    environmentInjector: injector,
    hostElement: rootHost,
  });
  applyInputs(rootRef, initialProps);
  const cmpRef = createComponent<unknown>(wrapperComponent, {
    environmentInjector: injector,
    hostElement: asAngularHost(surface),
    projectableNodes: [[rootHost]],
  });
  return { cmpRef, rootRef };
}

export function mount(
  rootTag: IRootTag,
  rootComponent: Type<unknown>,
  options?: IMountOptions,
): SymbioteSurface {
  settleAngularDevMode();
  // A re-mount on a live rootTag starts clean; otherwise the stale app double-drives the surface.
  teardown(rootTag);

  const surface = createSurface(rootTag);
  const rendererFactory = new SymbioteRendererFactory(surface);
  const injector = createRootInjector(rootTag, surface, rendererFactory);
  const { cmpRef, rootRef } = createRoots(
    injector,
    surface,
    rootComponent,
    options,
  );

  // `tick()` then drives both root views through the real scheduler
  const appRef = injector.get(ApplicationRef);
  appRef.attachView(cmpRef.hostView);
  if (rootRef !== undefined) {
    appRef.attachView(rootRef.hostView);
  }

  dlog(`angular mount root=${rootTag}`);
  appRef.tick(); // first paint
  surface.requestCommit();

  apps.set(rootTag, { cmpRef, rootRef, injector, rendererFactory });
  return surface;
}

// Tear down a surface by rootTag: the public pair of `mount`, and the JS half of the
// bridgeless `RN$stopSurface` contract (see installStopSurfaceGlobal).
export function unmount(rootTag: IRootTag): void {
  dlog(`angular unmount root=${rootTag}`);
  teardown(rootTag);
}

// `global.RN$stopSurface` is the JSI hook C++ AppRegistryBinding::stopSurface calls to stop a
// Fabric surface. RN installs it from its own renderer; symbiote REPLACES that renderer, so
// without this the binding throws "Global was not installed" on every surface stop (Fast
// Refresh, focus/lifecycle) and the screen goes blank. Same contract as the React/Vue
// adapters: an app uses one adapter, so exactly one installer runs.
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
