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
  ErrorHandler,
  RendererFactory2,
  ɵINJECTOR_SCOPE as INJECTOR_SCOPE,
  ɵprovideZonelessChangeDetectionInternal as provideZonelessChangeDetectionInternal,
  type ComponentRef,
  type EnvironmentInjector,
  type Type,
} from '@angular/core';
import { SymbioteRendererFactory } from '../renderer';
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

// A bare `symbiote-view` node, created directly through the engine (bypassing Angular's own
// createElement, which only resolves KNOWN symbiote primitives, never an arbitrary component's
// selector — see SymbioteRenderer.createElement). Used as the AppRegistry root's host when a
// wrapperComponentProvider is set: Angular has no hostElement-less bootstrap for our renderer
// (it would try `renderer.createElement(rootComponent.selector)`, which throws for anything
// that isn't one of our primitives), so the root needs an explicit host too, one we then hand
// to the wrapper as projectable content.
function createDetachedViewHost(): ISymbioteNode {
  // 'symbiote-view', not 'View': the public name is not a Fabric view name, and until
  // makeDescriptorFor learned to reject one it fell through to a view literally named `View`.
  const descriptor = descriptorFor('symbiote-view');
  return toPublicInstance(
    createEngineElement(descriptor.component, descriptor.isText),
  );
}

// Angular's whole unhandled-error funnel: INTERNAL_APPLICATION_ERROR_HANDLER resolves this token
// and hands it everything the framework caught on the app's behalf — a scheduled (async) tick that
// threw, a template listener that threw, a rejected pending task. Routed to the engine so an
// Angular app reaches the same native redbox as a React one instead of a console line nobody sees
// off a dev machine.
//
// There is deliberately no caught-vs-uncaught split here, unlike the React adapter's
// onUncaughtError/onCaughtError pair. Angular has no error boundary, and every path where the app
// DID handle something keeps clear of this seam on its own: a `@defer` block with an `@error`
// branch renders that branch (defer/rendering.ts calls handleUncaughtError only when there is
// none), `resource()` parks the failure in its own error signal, and an app-level try/catch or
// `catchError` never reaches Angular at all. So anything arriving here is by construction
// unclaimed, and the redbox is the right answer for all of it.
//
// Two things this must not do. It must not also call `super.handleError` — reportUncaughtError
// picks exactly one channel (host reporter or console) precisely because RN routes console.error
// into LogBox too, so the pair would double-report every error. And it must not throw: the
// scheduler invokes this from inside its own `catch` (zoneless_scheduling_impl.ts's tick), where a
// second throw escapes to the host and kills the "report and keep running" behaviour the provider
// exists for.
class SymbioteErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    reportUncaughtError(error, { origin: 'angular render' });
  }
}

interface IMountedApp {
  cmpRef: ComponentRef<unknown>;
  rootRef: ComponentRef<unknown> | undefined;
  injector: EnvironmentInjector;
}

// AppRegistry's `wrapperComponentProvider` support: the root renders detached (Angular gives
// it its own host node via our renderer, not yet attached anywhere), and the wrapper — the
// component actually attached to the surface — receives that host node as a projected child.
// `<ng-content>` in the wrapper's template is the Angular idiom for "render my children", the
// direct twin of React's `createElement(Wrapper, null, rootElement)`.
export interface IMountOptions {
  initialProps?: object;
  wrapperComponent?: Type<unknown>;
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
  apps.delete(rootTag);
  disposeRoot(rootTag);
}

export function mount(
  rootTag: IRootTag,
  rootComponent: Type<unknown>,
  options?: IMountOptions,
): SymbioteSurface {
  // A re-mount on a live rootTag starts clean; otherwise the stale app double-drives the surface.
  teardown(rootTag);

  const surface = createSurface(rootTag);
  const injector = createEnvironmentInjector(
    [
      {
        provide: RendererFactory2,
        useValue: new SymbioteRendererFactory(surface),
      },
      // `getElementById` is not decoration: `resource()` resolves TransferState, whose root
      // factory runs `retrieveTransferredState(doc, appId)` ->
      // `doc.getElementById(appId + '-state')` (core/src/transfer_state.ts:156) to pick up
      // server-rendered state. A stub without it makes that a TypeError, and because the throw
      // happens while the component is being constructed, the ENTIRE screen renders nothing —
      // white body under a native header that navigation drew anyway, no error surfaced. The
      // `optional: true` on the injector lookup does not help: the token resolves, its factory
      // is what throws. Returning null is the honest client answer — there is no server here, so
      // `script?.tagName` short-circuits and the caller gets `{}`.
      {
        provide: DOCUMENT,
        useValue: {
          head: surface,
          body: surface,
          getElementById: (): null => null,
        },
      },
      // createEnvironmentInjector with a null parent scopes this injector to {'environment'}
      // only (see EnvironmentNgModuleRefAdapter), so providedIn:'root' tokens — ApplicationRef
      // included — never resolve (R3Injector.get walks up for a `scopes` containing 'root', and
      // a null parent always dead-ends in NullInjector). platform-browser solves this the same
      // way for real DOM apps via BROWSER_MODULE_PROVIDERS: hand { provide: INJECTOR_SCOPE,
      // useValue: 'root' } to the app-level providers, which R3Injector's constructor reads to
      // self-tag this.scopes with 'root'. Same trick here, no PlatformRef, no DOM.
      { provide: INJECTOR_SCOPE, useValue: 'root' },
      // Supplies the real ChangeDetectionSchedulerImpl (microtask-batched via
      // ApplicationRef.afterTick) + NoopNgZone + ZONELESS_ENABLED: true — the exact bundle
      // internalCreateApplication() uses. Replaces the old unconditional
      // `rootView.detectChanges(); cmpView.detectChanges()` (force-ran both root views on every
      // tick) with Angular's own tick(), which only enters a view something actually marked
      // dirty. This does NOT stop the root's own template from re-running on a plain press or
      // `markForCheck()` anywhere in the tree — `markViewDirty` unconditionally sets RefreshView
      // on every ancestor up to the root; that's fundamental Angular zoneless behavior, not
      // something this swap changes. A genuine child `@Component` boundary still protects a
      // sibling branch from an unrelated press.
      ...provideZonelessChangeDetectionInternal(),
      // Angular's INTERNAL_APPLICATION_ERROR_HANDLER reports a tick() exception via
      // `injector.get(ErrorHandler)`; a normal `bootstrapApplication` registers that token by
      // default, but our from-scratch environment injector never did, so the lookup itself threw
      // NG0201 and replaced the real error with "No provider found for ErrorHandler" — any async
      // tick() exception crashed hard, uncaught, instead of being reported. The token still has to
      // be provided for exactly that reason; what it resolves to is now SymbioteErrorHandler
      // (see above), which reports through the engine instead of Angular's `console.error('ERROR',
      // e)` and, like the default, returns rather than rethrows so the app keeps running.
      { provide: ErrorHandler, useClass: SymbioteErrorHandler },
      ColorSchemeService,
      WindowDimensionsService,
    ],
    rootInjectorParent(),
  );

  // hostElement = the surface: the component's template content commits straight into the
  // surface with no wrapper view, the engine wrapping surface.children in its synthetic flex
  // root — the Angular equivalent of Vue's `app.mount(surface)`.
  let cmpRef: ComponentRef<unknown>;
  let rootRef: ComponentRef<unknown> | undefined;
  if (options?.wrapperComponent === undefined) {
    cmpRef = createComponent<unknown>(rootComponent, {
      environmentInjector: injector,
      hostElement: asAngularHost(surface),
    });
    applyInputs(cmpRef, options?.initialProps);
  } else {
    // The root gets its own host node from the renderer (createComponent without a
    // hostElement) but is not attached to the surface directly; it is handed to the
    // wrapper as projectable content instead, so only the wrapper needs a real host.
    const rootHost = asAngularHost(createDetachedViewHost());
    rootRef = createComponent<unknown>(rootComponent, {
      environmentInjector: injector,
      hostElement: rootHost,
    });
    applyInputs(rootRef, options.initialProps);
    cmpRef = createComponent<unknown>(options.wrapperComponent, {
      environmentInjector: injector,
      hostElement: asAngularHost(surface),
      projectableNodes: [[rootHost]],
    });
  }

  // Attach both root views to ApplicationRef so its own tick() (via the real
  // ChangeDetectionSchedulerImpl provided above) drives them from here on — no manual
  // ChangeDetectorRef juggling needed. markForCheck anywhere in the tree now notifies
  // the real scheduler, which batches a microtask and calls appRef.tick() itself.
  const appRef = injector.get(ApplicationRef);
  appRef.attachView(cmpRef.hostView);
  if (rootRef !== undefined) {
    appRef.attachView(rootRef.hostView);
  }

  dlog(`angular mount root=${rootTag}`);
  appRef.tick(); // first paint
  surface.requestCommit();

  apps.set(rootTag, { cmpRef, rootRef, injector });
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
