## 2. DOM-less bootstrap — AS BUILT (corrected from the original plan)

`mount(rootTag, RootComponent)` in `adapters/angular/src/render.ts` — the Angular
twin of `adapters/vue/src/render.ts`. The real implementation does NOT use
`createApplication` + `provideZonelessChangeDetection()` as originally planned
below — `createEnvironmentInjector` with a **null parent** does not install
Angular's application-level CD scheduler providers, so `provideZonelessChangeDetection()`
has nothing to attach to in this bootstrap shape. The actual mechanism:

```
mount(rootTag, RootComponent):
  surface   = createSurface(rootTag)                       // same engine container as Vue
  scheduler = new SymbioteChangeDetectionScheduler()        // hand-rolled: queueMicrotask + reentrancy guard
  injector  = createEnvironmentInjector([
                { provide: RendererFactory2, useValue: new SymbioteRendererFactory(surface) },
                { provide: DOCUMENT, useValue: { head: surface, body: surface } },
                { provide: NgZone, useClass: NoopNgZone },          // ɵNoopNgZone — zoneless, no public helper
                { provide: ChangeDetectionScheduler, useValue: scheduler }, // ɵChangeDetectionScheduler token
                ColorSchemeService, WindowDimensionsService,
              ], null as unknown as EnvironmentInjector)    // sanctioned FFI-edge cast: rootInjectorParent()
  cmpRef    = createComponent(RootComponent, { environmentInjector: injector,
                                               hostElement: surface as unknown as Element }) // asAngularHost()
  scheduler.setDetectChanges(() => cmpRef.changeDetectorRef.detectChanges())
  cmpRef.changeDetectorRef.detectChanges()                  // first paint
  surface.requestCommit()
```

**Update — `angular-adapter-change-detection` §3 supersedes the hand-rolled
`SymbioteChangeDetectionScheduler` above** with a real `ApplicationRef.tick()`
wired via a one-line `INJECTOR_SCOPE:'root'` provider fix; read that skill for
the current CD driver. The bootstrap shape (createEnvironmentInjector with a
null parent, no platform-browser) itself is unchanged.

Two sanctioned FFI-edge `as` casts are confined to this file
(`rootInjectorParent()`, `asAngularHost()`) — Angular's core types model a
browser (non-null injector parent, DOM `Element` host); our root has neither
shape, and these are the two places that boundary is crossed. Nothing else in
the adapter casts. `asAngularHost` also defines a `tagName` property on the
surface because Angular's `locateHostElement` reads it even when a concrete
host is supplied.

One Angular app per surface (`apps: Map<IRootTag, IMountedApp>`) so Fast
Refresh / focus-lifecycle re-mounts tear down and rebuild cleanly. Also
installs `globalThis.RN$stopSurface` exactly like `adapters/vue/src/render.ts`
(the bridgeless stop-surface contract). wolf-tui proves the no-DOM bootstrap
works (`wolf-tui/packages/angular/src/bootstrap.ts`) — it predates stable
zoneless and hacks the same **private** `ɵChangeDetectionScheduler` token our
real bootstrap now uses deliberately (not as a hack — it's the only way to
supply a CD scheduler when there's no `platform-browser` to install one via
the public API).
