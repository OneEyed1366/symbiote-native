---
name: angular-adapter-change-detection
description: "Symbiote Angular adapter change detection — read BEFORE debugging why a component renders but does not REPAINT after a flat-bag onX/responder/PanResponder mutation, before touching SymbioteHostPropsDirective or render.ts's CD wiring, or before assuming ApplicationRef.tick() fixes a whole-tree rebuild on press. Covers: whenCommitted async-commit gotcha (from Vue); SignalView vs CheckAlways (Angular 20 @Component views are SignalView, so a flat-bag onX mutation dirties nothing — fix is markForCheck(), NOT detectChanges()); zoneless scheduling + ApplicationRef.tick() (unreachable pre-fix, missing INJECTOR_SCOPE:'root', Targeted vs Global mode); a hypothesis DISPROVED: Targeted mode does NOT stop a press re-running the root template (markViewDirty walks RefreshView|Dirty to root); protected (@Component) vs not (@if/@for); AND (§13/§14) why a `[style]`/`[class]` binding is the ONE binding name that writes the input without dirtying the child — Angular's styling instruction hands off to setDirectiveInputsWhichShadowsStyling and skips markDirtyIfOnPush — with the two fix shapes (SymbioteStyleInputDirective for a real `style` input; an anchorStyle signal polled in ngDoCheck for class= / for Button, which has no style input) and the ReactiveStyle canary screen. AND (§17) why a windowed list can go permanently DEAF to scroll — §15's per-frame scroll gate compared the last-rendered window against the one before it, a comparison that latches 'settled' forever once two recomputes agree, freezing VirtualizedList at the first viewport's window with blank space below (fix: predict the window from the LIVE offset via the shared computeWindow). Trigger: 'renders but doesn't repaint', 'list stops scrolling / blank below the last row', 'window frozen mid-scroll', 'class toggled after mount does nothing', 'style frozen at creation', 'rebuild whole tree on press', markForCheck vs detectChanges, NG0201/ApplicationRef failures, template literals losing referential stability."
---

# Symbiote Angular adapter — change detection mechanics

Three discoveries, made in this order, and each one narrows the picture left by the
last. Read them in order — the narrative is the point, not just the final answer.

1. **§1 below (async-commit timing)** — the basic, Vue-inherited gotcha: Angular's
   change detection is async/batched too, so a native call that needs a committed
   Fabric tag must go through `whenCommitted`, exactly like Vue.
2. **§2 below (SignalView vs CheckAlways)** — a component can render correctly on
   mount and still go permanently dead on every subsequent flat-bag `onX` mutation,
   because Angular 20 plain components are `SignalView`, not `CheckAlways`, and a
   SymbioteNative callback dirties nothing Angular knows about. Fixed with
   `markForCheck()` via a directive.
3. **§3 below (real `ApplicationRef.tick()`)** — investigating "why does any press
   rebuild the whole tree" led to replacing a hand-rolled scheduler with Angular's
   own `ApplicationRef`, AND to a hypothesis ("Targeted mode stops the root
   re-render") that was written up, implemented, and then DISPROVED by a test
   before it shipped. Both the fix and the correction are durable — keep both.

## §1. Async-commit-timing gotcha applies identically (inherited from Vue)

Angular's change detection is async/batched (zoneless schedules CD on a microtask),
just like Vue's commit batching. So the **whenCommitted** gotcha from
`vue-adapter-reactivity` (Gotcha 2) repeats verbatim: any native/imperative call
wired at Angular lifecycle time (e.g. an `afterNextRender` / `effect` that reads a
Fabric tag — native-driver Animated, sticky-attach, TextInput autoFocus) must go
through `whenCommitted(node, action)` (`core/engine/src/post-commit.ts`,
`commit.ts`), not assume the tag exists. This was BUILT during Vue — Angular inherits
it for free. (React doesn't hit it: `react-reconciler` commits synchronously.)

## §2. A flat-bag `onX` callback that mutates plain state must `markForCheck` — Angular 20 components are SignalView, not CheckAlways (2026-07)

```
§2_signalview_dead_repaint := {
  bug: "device-confirmed iOS: ResponderDemo (examples/angular/components/ResponderDemo.ts) and
       ParityDemo (onLongPress/onPress) ran gesture logic (engine logged 'responder granted',
       callback mutated this.status) but never repainted ({{ status }} frozen, 'commit
       reconciled changed=false') — same demo worked on React/Vue",
  root_cause: "Angular 20 compiles a plain @Component as SignalView, not CheckAlways.
              getInitialLViewFlagsFromDef (.vendors/angular/.../view/construction.ts):
              signals -> SignalView; onPush -> Dirty; else -> CheckAlways. v20 @Component
              carries def.signals -> LView is SignalView. detectChangesInView refreshes a view
              only on (Global && CheckAlways) | (Global && Dirty) | RefreshView | dirty reactive
              consumer — a SignalView on a plain mutation is none of those, so root
              detectChanges() does not descend into it",
  why_react_vue_immune: "setState / Vue proxy .value= ARE the notification; a SymbioteNative
                        flat-bag onX callback is invoked directly by engine event dispatch
                        (callOwnListener/bubble, core/engine/src/events/index.ts), entirely
                        outside Angular, so it dirties nothing. (event)='...' bindings escape
                        the bug because Angular compiles them through its own ɵɵlistener
                        wrapper, which calls markForCheck; [symbioteHostProps]/flat-bag onX
                        props do not — so only components mutated via a flat-bag callback are
                        hit (responder/onLongPress), not Buttons' (press)",
  fix: "SymbioteHostPropsDirective wraps every onX function prop to call
       this.cdr.markForCheck() after the handler runs (adapters/angular/src/primitives/
       shared.ts). Declared IN the host component's template so its injected
       ChangeDetectorRef is that component's view detector. markForCheck -> markViewDirty sets
       RefreshView|Dirty on the view AND every ancestor to root, calls
       changeDetectionScheduler.notify(). RefreshView survives the Targeted descent a root tick
       uses for un-dirtied intermediate views, so the next root detectChanges() reaches the
       mutated component",
  landmines: [
    "detectChanges() in the directive does NOT work, markForCheck() does — createViewRef
     (.vendors/angular/.../change_detector_ref.ts): component-host tNode -> new
     ViewRef(componentView, componentView); plain ELEMENT tNode (what a directive sits on) ->
     new ViewRef(hostComponentView, lView). ViewRef.detectChanges() acts on _lView (wrong view
     for the element case); markForCheck() acts on _cdRefInjectingView (=host component)",
    "ApplicationRef.tick() unreachable pre-fix — injector.get(ApplicationRef, null) is null in
     the DOM-less createEnvironmentInjector(null-parent) bootstrap (main angular-adapter skill
     §0); would not have helped anyway, it also refreshes only dirty/CheckAlways views",
    "a root-level setEventDispatcher(run => { run(); scheduler.notify() }) wrap does NOT fix it
     (tried, reverted) — pings the scheduler but root detectChanges() still can't descend into a
     SignalView child, and fires detectChanges on every native event incl. every scroll frame
     (needless churn). markForCheck already notifies the scheduler itself",
    "wolf-tui's Angular adapter uses the SAME componentRef.changeDetectorRef.detectChanges()
     scheduler and avoids this only because its reactive state is SIGNAL-driven (setInterval ->
     signal), which dirties the SignalView's consumer — plain-property state is what exposes
     the gap",
  ],
  render_ts_note: "the root tick resolves each root's OWN-view detector via
                  cmpRef.injector.get(ChangeDetectorRef), NOT ComponentRef.changeDetectorRef
                  (the host/wrapper view, which paints once but never re-descends into the
                  component)",
  regression: "adapters/angular/src/__tests__/responder-change-detection.test.ts (flat root) and
              responder-nested-cd.test.ts (App->child nesting, device-faithful) — fire real
              touch primitives over the fake Fabric slot (fabric.fireEvent), assert {{ status }}
              walks idle->granted->moving->released in the COMMITTED tree (use findCommitted,
              not fabric.find: clone-on-write puts prop updates only in committed, never
              created). A composed child a test mounts must register its selector via
              registerComposedComponent(selector) (exported from renderer.ts) or createElement
              paints RN's 'Unimplemented component' fallback"
}
```

## §3. Change detection now runs on real `ApplicationRef.tick()`, not a hand-rolled scheduler — but that does NOT stop a press from re-running the root's own template (2026-07)

Trigger: after fixing 3 Android-only bugs in a row on the same new demo section
(content-wrapping crash → `nestedScrollEnabled` default → unstable `[animatedProps]`
literal causing native-handler churn on EVERY press anywhere), the owner asked "we
rebuild the whole tree on any sneeze, that's nonsense — investigate properly." Root
cause confirmed by reading vendored Angular source, not guessed.

```
§3a_root_cause := {
  old_behavior: "render.ts's old SymbioteChangeDetectionScheduler.notify() called
                rootView.detectChanges(); cmpView.detectChanges(); on EVERY tick,
                unconditionally",
  why_wrong: "ChangeDetectorRef.detectChanges() (view_ref.ts) calls
             detectChangesInternal(lView) with NO mode argument; its default
             (render3/instructions/change_detection.ts) is
             mode = ChangeDetectionMode.Global — refreshes CheckAlways content
             unconditionally, not just RefreshView content",
  contrast: "Angular's own ApplicationRef.tick() -> synchronize() -> synchronizeOnce()
            (application/application_ref.ts) computes
            useGlobalCheck = Boolean(dirtyFlags & ApplicationRefDirtyFlags.ViewTreeGlobal);
            for a ZONELESS app plain tick() never sets that flag
            (if (!this.zonelessEnabled) { dirtyFlags |= ViewTreeGlobal }), so real zoneless
            ApplicationRef.tick() runs ChangeDetectionMode.Targeted — only RefreshView-flagged
            views or a dirty signal consumer"
}

§3b_fix := {
  blocker: "render.ts bootstraps via createEnvironmentInjector(providers, null). EVERY
           createEnvironmentInjector call — incl. the one inside
           internalCreateApplication()/bootstrapApplication() itself — builds an R3Injector
           with scopes = new Set(['environment']) (render3/ng_module_ref.ts,
           EnvironmentNgModuleRefAdapter), never 'root'. Angular only resolves a
           providedIn:'root' token (ApplicationRef included) when this.scopes.has('root')
           (r3_injector.ts, injectableDefInScope) — a null parent, a real platformCore(), even
           a StaticInjector-based platform injector do NOT add 'root' to OUR injector's scope
           set, so injector.get(ApplicationRef) threw NG0201 regardless (platformCore() as
           parent empirically did NOT help)",
  mechanism_found: "platform-browser/src/browser.ts: BROWSER_MODULE_PROVIDERS includes
                   { provide: INJECTOR_SCOPE, useValue: 'root' } as one of ITS OWN app-level
                   providers — R3Injector's constructor reads INJECTOR_SCOPE off its own
                   provider list and self-tags this.scopes.add('root')",
  fix_code: "{ provide: ɵINJECTOR_SCOPE as INJECTOR_SCOPE, useValue: 'root' },
            ...ɵprovideZonelessChangeDetectionInternal(),  // real ChangeDetectionSchedulerImpl
                                                            // + NoopNgZone + ZONELESS_ENABLED:true
            // then: injector.get(ApplicationRef), appRef.attachView(cmpRef.hostView)
            // (+ rootRef.hostView for the wrapper-component path), appRef.tick() for first paint",
  replaces: "the whole hand-rolled SymbioteChangeDetectionScheduler class (queueMicrotask +
            reentrancy guards) — Angular's ChangeDetectionSchedulerImpl already does that,
            self-scheduling off ApplicationRef.afterTick",
  EffectScheduler_note: "ZoneAwareEffectScheduler is genuinely NOT exported anywhere (checked
                        the installed package's public .d.ts) — looks like it needs forking a
                        ~50-line private class, but does NOT: ɵprovideZonelessChangeDetectionInternal()
                        only needs ApplicationRef itself reachable (the scope fix above);
                        ApplicationRef's other providedIn:'root' deps (EffectScheduler,
                        AfterRenderManager, PendingTasksInternal,
                        INTERNAL_APPLICATION_ERROR_HANDLER) resolve fine via their own
                        providedIn:'root' factories once the injector is scope-tagged 'root'",
  verified: "all 676 tests green, ngc AOT build green, no other file needed to change"
}

§3c_disproved_claim := {
  hypothesis: "ApplicationRef.tick() in Targeted mode means the root's own template no longer
             re-runs on an unrelated press",
  test: "regression test: nested child press -> assert root's own template-level render counter
        does NOT increment — FAILED even against the new, fixed scheduler",
  why: "mark_view_dirty.ts markViewDirty: BOTH a native (event)='handler()' binding (via
       wrapListenerIn_markDirtyAndPreventDefault -> markViewDirty) AND
       ChangeDetectorRef.markForCheck() (body = markViewDirty(this._lView,
       NotificationSource.MarkForCheck), view_ref.ts) walk LViewFlags.RefreshView | Dirty
       UNCONDITIONALLY onto every ancestor up to root:
       `while (lView) { lView[FLAGS] |= dirtyBitsToUse; lView = getLViewParent(lView)!; }`
       until isRootView(lView) && !parent — universal, unavoidable zoneless behavior, true
       whether signals or not, ApplicationRef or hand-rolled scheduler",
  conclusion: "ApplicationRef.tick()'s Targeted mode changes NOTHING about this — it only
             changes which top-level ATTACHED view is entered at all (ApplicationRef._views,
             relevant across multiple attachView()'d roots) and whether refreshing a view
             force-checks CheckAlways content that isn't dirty. Once any view decides to
             refresh, refreshView() (change_detection.ts) hardcodes ChangeDetectionMode.Global
             for its OWN embedded views (@if/@for, always CheckAlways, never independently
             gated) and child components — so a press or markForCheck() ANYWHERE always
             re-runs the root's own template, regardless of scheduler"
}

§3d_what_is_protected := {
  claim: "a real @Component boundary IS protected: a plain non-OnPush child compiles as
        SignalView (Angular 20+, not CheckAlways), so detectChangesInView's shouldRefreshView
        gate (flags & CheckAlways in Global mode, or flags & RefreshView / dirty consumer
        regardless of mode) correctly skips an untouched SIBLING child component even when its
        parent's template re-executes around it",
  proof: "render.test.ts 'does not re-check a sibling child component...' — passes identically
        under the old hand-rolled scheduler and the new ApplicationRef-based one",
  NOT_protected: "an @if/@for block — embedded views are always CheckAlways, always re-execute
                when their containing view refreshes, no per-view gate at all",
  lever: "decomposing a monolithic template's demo/feature sections into genuine child
        @Component (AnimatedDemo/ResponderDemo precedent) is what limits blast radius for an
        unrelated press — @if-wrapping content in place does nothing, and neither does
        replacing the scheduler"
}

§3e_takeaway := [
  "a press anywhere ALWAYS re-runs the pressed component's own view + every ancestor's own
   template to root — unavoidable in Angular's zoneless model, do not re-attempt a fix",
  "so any inline object/array/function literal in ANY component's template (root or not) gets a
   fresh reference on every tick that refreshes THAT component — mirror AnimatedParityDemo's
   [animatedProps] bound to a stable class-field reference for every prop flowing through a
   change-detecting equality check, not just Animated ones",
  "a SIBLING @Component with no dirty descendant IS properly skipped — decomposing into real
   components (not @if/@for) is the actual lever for cheap unrelated presses, worked before this
   fix too",
  "the ApplicationRef swap is still worth keeping (less bespoke code, exposes real
   isStable/whenStable()/afterTick) but its benefit is narrower than hoped — properly-scoped
   ticking for dirtiness NOT originating from a native listener or markForCheck() (independently
   attached surfaces not cross-triggering, future genuine-signal code). Do not oversell it as
   'fixes the tree rebuild' — verify with a test first, as this one was caught before shipping"
]
```

## Scope boundary

This skill owns Angular's **change-detection mechanics** — SignalView vs CheckAlways,
`markForCheck` vs `detectChanges`, zoneless scheduling, `ApplicationRef.tick()`'s Targeted vs
Global mode, and why a flat-bag `onX` prop needs help that a native `(event)=` binding already
gets for free via Angular's own `ɵɵlistener` (that latter point is the boundary with
**`angular-adapter-events`**: an `@Output()`/`(event)=` binding is not this skill's concern
because it already routes through `markViewDirty` on its own — this skill exists for the cases
that DON'T).

For everything else about the Angular adapter — renderer/`Renderer2` seam, DOM-less bootstrap,
version floor, the two-stage AOT pipeline, `descriptorToAngular`/`DescriptorOutlet`, and overall
status — read the main **`angular-adapter`** skill (its §0 covers status/seam/bootstrap; this
skill's §1/§3 material was originally its §5 and §20).

The `whenCommitted` async-commit-timing gotcha (§1 above) originated in Vue and is inherited
here verbatim — see **`vue-adapter-reactivity`** (Gotcha 2, "Vue commits async — the tag may not
exist yet") for the full mechanism, the `whenCommitted(node, action)` primitive, and its Vue-side
regression tests; this skill does not re-derive it, only restates that Angular hits the identical
shape.

Some bugs in **`angular-adapter-lists`** (e.g. an infinite recompute loop in `VirtualizedList`)
are downstream symptoms of these same change-detection mechanics — worth a check against this
skill's §2/§3 before treating them as list-specific. The same skill also owns
`VirtualizedList`'s own windowing/projection bugs (blank cells, ng-content passthrough) that sit
adjacent to but distinct from the scroll-frame CD cost this skill's §15 fixes.

The 2026-08-18/19 sticky-header/frame-budget investigation (two O(N) projection fan-outs, three
FALSIFIED fix attempts, device fps numbers per adapter, the signals-migration proposal) lives in
the main **`angular-adapter`** skill's §21 — read it alongside this skill's §5/§13-§15a, which
cover the change-detection half of the SAME investigation (the CheckAlways mechanism behind the
fps drop, `markForCheck()` vs signal cost, the fixes that actually moved the number).

General on-device/headless performance-measurement method and instruments (the krausest-style
micro-bench, `readCommitProfile()`/`BenchmarkScreen`, dirty-marking in the engine) are
**`symbiote-perf-measurement`**'s concern; this skill's §5-§15a numbers are Angular-CD-specific
probes layered on top of that discipline, not a replacement for it.

A native `(event)=` binding already triggers CD correctly via Angular's own `ɵɵlistener` — see
**`angular-adapter-events`** for the event-surface conventions (every component event as
`@Output()`, the scroll-family exception); this skill explains specifically why a flat-bag `onX`
prop does NOT get the same treatment and what closes that gap.

## §4. `ngAfterViewInit` fires ONCE — a native wire-up gated on an `@Input` must also run from `ngOnChanges` (2026-08-16)

```
§4_stale_sticky_attach := {
  bug: "Angular sticky headers rendered in the right place/z-index but never moved. Native
      scroll-value attach (attachSticky(), components/scroll-view/shared.ts) ran only from
      ngAfterViewInit and returned early while stickyHeaderIndices was still empty — an
      ordinary @Input arriving after the first CD pass when derived from data (not a literal),
      and ngAfterViewInit never runs again, so the attach was never retried. Scroll offset
      never reached the AnimatedValue; every interpolation sat at its resting value",
  why_reads_as_broken_not_off: "the projection half self-heals — wrapper still created around
                               the right child with the right z-index, so the header LOOKS
                               enabled. Nothing logs, nothing throws",
  angular_only: "React/Vue/Svelte all re-run the same attach from a reactive effect keyed on the
               same condition ($effect in scroll-view/index.svelte, React useEffect deps, Vue
               watcher) — a late input self-heals. Angular's one-shot lifecycle hook has no
               equivalent. General shape: any native/imperative wire-up gated on an @Input needs
               ngOnChanges too",
  fix: "drive attach from ngOnChanges as well — made IDEMPOTENT: records the inputs the current
       attach was made for, returns when none changed, and records them even when the host node
       is not yet resolved so the next call (which will see a real node) still reads as a
       change",
  regression: "components/scroll-view/sticky-native-attach.test.ts — control case (indices
             present from start) + real case (indices arrive later). Observable is
             addAnimatedEventToView call count off a fake native module, NOT the committed
             tree — the tree looks correct in BOTH cases, which is the whole trap"
}
```

## §5. `markForCheck()` and a signal write cost DIFFERENT amounts — and at scroll frequency the difference is the whole screen (2026-08)

```
§5_markforcheck_vs_signal_cost := {
  symptom: "Angular canary JS thread fell to ~30fps scrolling, worst on the sticky SectionList
          section. Same screen: Svelte no drop, Vue ~1 frame, React ~2 frames — not the sticky
          implementation, not the engine",
  mechanism: "markForCheck() -> markViewDirty (instructions/mark_view_dirty.ts): RefreshView|
             Dirty on EVERY ancestor to root, no early exit -> each re-runs its OWN template.
             signal.set() -> markAncestorsForTraversal (util/view_utils.ts): only
             HasChildViewsToRefresh, BREAKS as soon as it hits an already-flagged ancestor ->
             ancestors are TRAVERSED not re-executed, only the view that READS the signal
             refreshes. Angular's own zoneless guide lists both as valid triggers without
             distinguishing cost",
  root_cause: "SymbioteHostPropsDirective.wrapCallback follows EVERY flat-bag onX prop with
             markForCheck() (the §2 fix, correct for a press) — but onScroll is an onX prop
             too, arrives up to 60Hz, so every scroll frame re-runs the whole ancestor screen
             template incl. @for blocks (always CheckAlways, no per-view gate — §3). Cost
             scales with SCREEN size not list size, explaining why the largest section felt
             worst",
  measured: "adapters/angular/src/__tests__/scroll-change-detection-cost.test.ts, 10 scroll
            events fired through the fake Fabric slot at a host inside a child component —
              handler in child, markForCheck path:  ancestor screen template 10, @for rows 50
              same burst, no listener bound (control): ancestor 0, @for rows 0
              child updates a signal instead: ancestor 0, @for rows 0, child's own template 10
            control row is causal proof (mounted tree doesn't tick on its own)",
  fix_direction: "scroll-derived state in own scroll consumers (VirtualizedList windowing, the
                ScrollView JS sticky fallback) becomes signals read in the template; the
                directive stops blanket-wrapping the high-frequency scroll family. Do NOT
                delete the wrap for the scroll family without giving those components their own
                notification — reopens the §2 'pan does nothing' class of bug, for lists",
  ruled_out: "NgZone.runOutsideAngular() — bootstrap is zoneless (NoopNgZone), no-op. The
            zoneless answer to a high-frequency event that must not repaint the world is
            signals, not zone escape"
}
```

## §6. The signals migration is blocked by the TEST pipeline, not by the components — measured pilot, 2026-08

```
§6_signals_pilot_blocked_by_JIT := {
  win_measured: "prop-bag-stability.test.ts: 10 scroll events at a ScrollView with unchanged
               inputs, counting symbioteHostProps SETTER runs —
                 getter (baseline): 20 re-pushes / 10 frames  (two host bindings rebuilt/frame)
                 computed (pilot):  10 re-pushes / 10 frames  (contentProps stopped rebuilding)
               caveat: measured while the converted inputs were silently unbound (Blocker 2
               below), so it proves memoisation works, not that a fully-wired signal
               ScrollView costs exactly 10",
  good_news: "unrelated press costs a ScrollView ZERO re-pushes — a real @Component boundary
            with unchanged inputs holds (§3). Only the component whose OWN view is dirtied (the
            scroll callback's) pays — a scroll-path problem, not whole-screen",
  blocker_1: "inputs: [...] and input() are mutually exclusive — listing a signal input in the
            array form makes Angular ASSIGN the bound value over the InputSignal field; next
            read throws TypeError: this.contentContainerStyle is not a function. Migrating a
            component must delete those names from its *_INPUTS array, not keep both",
  blocker_2: "the JIT compiler cannot see input() at all, and the unit suite is JIT — probed on
            compiled defs:
              vitest (JIT): ScrollViewBase.ɵdir.inputs = 0 entries, contentContainerStyle
                            absent; concrete ScrollView.ɵcmp.inputs = 79 (exactly the array,
                            nothing inherited)
              ngc (AOT):    base def declares contentContainerStyle; concrete component's
                            partial declaration carries usesInheritance: true
            input() fields are discovered by ngtsc reading field initializers; JIT only reads
            decorator metadata. SHIPPED build is fine; the TEST SUITE goes blind:
            [contentContainerStyle]='...' matches no input, CUSTOM_ELEMENTS_SCHEMA suppresses
            the would-be error, binding silently dropped — surfaced as two style tests reading
            padding: undefined. A migration done without noticing this ships untested props,
            not broken ones",
  outcome: "pilot REVERTED — components back on plain fields/getters, measured note left on
          ScrollView.contentProps. Both measurement files stay: prop-bag-stability.test.ts pins
          the baseline, __tests__/scroll-change-detection-cost.test.ts pins §5's numbers",
  see_also: "§7 — AOT was NOT required after all, read before paying for it"
}
```

## §7. You do not need AOT to get the signals win: `signal()`/`computed()` are runtime, only `input()` needs the compiler

```
§7_runtime_signals_no_AOT_needed := {
  asymmetry: "signal()/computed() are plain functions in core/src/render3/reactivity/, zero
            compiler involvement. Only signal-based DECLARATIONS — input(), output(),
            viewChild(), model() — need ngtsc, because the compiler registers them in the
            directive def and decorator inputs metadata has no field to express it
            ({name, alias, required, transform}, metadata/directives.ts:181)",
  approach: "keep @Input as a plain field, bridge into the reactive graph by hand, memoize:"
}
```

```ts
private readonly inputsRevision = signal(0);

ngOnChanges(): void {
  this.inputsRevision.update(revision => revision + 1);   // the single moment Angular has
}                                                          // finished writing every input

readonly contentProps = computed<Record<string, unknown>>(() => {
  this.inputsRevision();          // the only reactive read; the rest are plain fields
  ...
});
```

```
§7b_measured := {
  numbers: "same probe as §6, on ScrollView.contentProps —
             getter:                          20 re-pushes / 10 frames
             computed + real signal inputs:   10, but 2 unrelated style tests went red (JIT blindness)
             computed + ngOnChanges bridge:   10, all 162 adapter tests stay green",
  cost: "identical win, no new dependency, no lost coverage. @analogjs/vite-plugin-angular would
       also have pulled in @angular/build (an Angular CLI package this repo doesn't otherwise
       have) purely to run tests",
  hazard: "plain fields read inside the computed are UNTRACKED — correctness rests entirely on
         the revision bump covering every way a dependency can change. Holds for @Inputs
         (always routed through ngOnChanges), NOT for internal mutable state (viewportHeight,
         lastContentSize, any callback-assigned field). A bag reading such state needs that
         state as its own signal(), not inputsRevision. Widening the bump to 'bump on
         everything' would silently un-memoize the bag instead",
  remaining: "scrollProps is still a getter, still re-pushes once per scroll frame.
            prop-bag-stability.test.ts pins that number (reaches 0 when memoized) — it reads
            internal state, so needs the signal-per-state treatment, not another revision bump"
}
```

## §8. The callback wrapper must be memoized per handler, or nothing upstream can ever be memoized

```
§8_wrapCallback_must_memoize := {
  bug: "SymbioteHostPropsDirective.wrapCallback allocated a FRESH closure for every onX key on
      every push of the props bag",
  measured: "primitives/host-props-wrapper-stability.test.ts, five grant/release cycles on one
           component:
             fresh closure per push:  11 distinct wrappers for ONE unchanged handler
             memoized per handler:    1",
  why_it_matters: "the wrapper is what reaches the engine, so a fresh function on every push
                 makes the pushed bag permanently unequal to its predecessor by reference — no
                 upstream memoization (§7) can conclude 'nothing changed' about a bag containing
                 a callback prop while this holds. PREREQUISITE for the computed() work, not an
                 independent micro-opt",
  fix: "cache in a WeakMap keyed by the ORIGINAL handler, per directive instance. The handler
      alone is a complete key — the wrapper body closes over nothing else that varies (key is
      read only by the ON_PREFIX guard before wrapping; cdr is fixed per instance). Do not also
      key by key — same handler bound to two props would get two wrappers for no reason",
  test_trap: "the 'different handler gets its own wrapper' assertion passes with NO memoization
            at all if the run only contains two pushes — drive enough pushes that an
            un-memoized run visibly produces more wrappers, and verify red with the cache lookup
            removed. Driving pushes needs a full grant/release cycle per iteration: the
            responder stays granted after topTouchStart, so repeated touchStart alone re-enters
            onResponderGrant once and silently drives a single CD pass",
  incidental_fix: "wrapCallback also carried an `as` cast to give Function a call signature —
                 replaced with Reflect.apply(value, undefined, args), preserves the previous
                 unbound call, no cast needed"
}
```

## §9. The anchor-class style is a THIRD kind of dependency, and it defeats the §7 bridge

```
§9_anchor_class_third_dependency_kind := {
  gap: "§7 splits a bag's dependencies into '@Input (ngOnChanges revision bump)' and 'internal
      mutable state (own signal)'. anchorHostStyle(this.elementRef) is neither: a composed
      component is created as a non-painting ANCHOR host, so class='...' / [class.x] / [ngClass]
      at its USE SITE resolves through the renderer's addClass/removeClass onto that anchor —
      Angular offers no @Input interception for class the way it does for [style]. Value never
      appears in SimpleChanges (ngOnChanges never fires), isn't assigned by any component code
      (no write site to convert to a signal), and primitives/shared.ts documents it as 'must be
      re-read on every check'",
  symptom: "a getter satisfied this by re-reading every pass; a computed() keyed only on
          inputsRevision strands it — toggle a class at the use site and the memoized bag never
          notices. Silent staleness, arriving through a door §7 didn't name",
  fix: "a second bump site in ngDoCheck, running at the same cadence the getter used to be
      re-read. Bump ONLY on real identity change of the anchor style — an unconditional bump
      re-invalidates the computed every pass and throws away the win. Precedents:
      stableAnchorStyle's shallow-equal guard (primitives/shared.ts), lastRecompute
      (virtualized-list/index.ts)",
  result: "strictly better than the getter it replaced — a class toggled after mount now
         repaints on the spot instead of waiting for an unrelated refresh",
  reference_impl: "components/safe-area-view/index.ts + safe-area-view.test.ts case 'picks up a
                  class toggled after mount, with no @Input change' — verified to fail with the
                  ngDoCheck bump removed",
  classify_per_bag: "bags NOT reading the anchor style need none of this —
                    VirtualizedList.foldedAccessibility is 34 accessibility @Inputs + a pure
                    function, plain §7 bridge is sufficient",
  resist_memoization_stay_getters: [
    "keyboard-avoiding-view — inset/initialHeight assigned from Keyboard events + handleLayout;
     convertible only by making both signals first",
    "text-input — value assigned by writeValue(), editable by setDisabledState();
     @angular/forms bypasses ngOnChanges entirely, and the bag must change every keystroke
     anyway",
  ],
  ngDoCheck_verified_correct_hook: [
    "render3/hooks.ts callHooks runs pre-order hooks 'until that node index EXCLUSIVE' — flushes
     at the next ɵɵadvance past the node (or refreshView's post-template flush) — strictly
     AFTER the parent's ɵɵclassProp wrote the class, strictly BEFORE the component's own view
     refreshes",
    "callHooks calls setActiveConsumer(null), so a signal write inside ngDoCheck registers no
     dependency on the calling view — no NG0600",
    "engine's commitClassStyle allocates a fresh [classStyle, explicitStyle] array only when a
     class token actually moved, so signal.set's Object.is check turns an unchanged poll into a
     no-op — no CD loop",
  ],
  keep_both_hooks: "ngOnChanges revision bump AND ngDoCheck anchor poll cover DIFFERENT
                  dependencies (inputs vs anchor style), not the same one twice"
}
```

## §10. Pre-existing, unfixed: `TouchableHighlight`'s dynamic style never reaches Pressable

```
§10_touchable_stale_style := {
  found: "while memoizing the press family — predates that work",
  bug: "touchable/index.ts hands Pressable a STABLE arrow [style]='pressedStyle' reading
      TouchableHighlight's own anchor style/inputs live. A structural replica (OnPush child,
      stable arrow input, plain getter bag) shows the child never re-reads its getter when only
      the parent changes — on the UN-MEMOIZED baseline Pressable's view is not refreshed
      either, so TouchableHighlight's dynamic [style]/class was already stale before any of
      this. Memoization neither caused nor fixes it",
  fixed_2026_08: "TouchableHighlight, TouchableWithoutFeedback, AnimatedComponentBase —
                pressedStyle became a computed that RETURNS A NEW ARROW when its dependencies
                move, so the input binding reports an ordinary change; both Touchables and
                AnimatedComponentBase also got the §9 ngDoCheck anchor poll (nothing else dirties
                their view on anchor class change)",
  regression: "touchable.test.ts 'a Touchable class toggled after mount', and
             modules/animated/animated-anchor-class.test.ts, both verified to fail with the fix
             removed",
  rejected_alternative: "reading the anchor signal from INSIDE the stable arrow — 'works', by
                       registering TouchableHighlight's signal on Pressable's consumer, a
                       cross-component dependency nobody would expect to find. Returning a new
                       reference keeps the dependency an ordinary input change instead",
  STILL_BROKEN: "TouchableOpacity — chain is one hop longer: own anchor -> animatedStyle ->
               AnimatedView's style @Input -> AnimatedView's own anchor + reducedProps ->
               committed leaf. Probed, not inferred: TouchableOpacity's ngDoCheck runs, its
               anchor DOES receive the toggled class, animatedStyle DOES re-run and return it —
               yet the committed leaf keeps only {opacity: 1}. A second CD pass does not help
               (lost update, not a one-pass lag); with the class present from the START it lands
               correctly, so the merge itself is sound. Loss is between AnimatedView's style
               input and its committed leaf",
  repro: "kept as a skipped case in touchable.test.ts — start there"
}
```

## §11. A prop-bag getter with a SIDE EFFECT becomes a bug the moment you memoize it

```
§11_side_effect_getter_memoized := {
  found: "converting ScrollView.scrollProps (2026-08)",
  bug: "the getter did not only build a bag — it also called updateProjectionController()
      (sticky-header projection reconciled as a side effect of 'reading the props'), once per
      CD pass. Invisible as a getter (re-read every pass, side effect fires at a convenient
      cadence by accident); memoized, the side effect fires only when the memo MISSES — exactly
      the passes where it was least needed, never the ones where it was",
  rule: "when converting a getter to computed(), read the whole body for effects, not just
       dependencies. An effect does not move into the computed, and does not stay behind an
       ngDoCheck 'just in case' — give it precise triggers, one per real dependency",
  projection_controller_triggers: ["ngOnChanges (sticky inputs)",
                                    "handleInvertedStickyLayout (guarded on real viewportHeight
                                     change)",
                                    "ngAfterViewInit (post content-node bind)",
                                    "ngAfterContentChecked (guarded on hasProjectedRefreshControl
                                     flipping)"],
  deliberately_not: "an unguarded per-check hook — reconcileStickyRecords copies the record
                   array and walks node children, running it on every press would add cost to
                   the very path the memoization exists to protect",
  related: "viewportHeight/lastContentSize are read only by updateProjectionController and
          handleContentLayout, no computed reads them — stayed plain fields; converting would
          have been ceremony with no reader"
}
```

## §12. A projected child's inputs are NOT covered by the host's revision bump

```
§12_projected_child_inputs_uncovered := {
  case: "iosRefreshControlProps / androidRefreshControlProps on ScrollView — the one pair in
       that file that must STAY getters",
  why: "every field comes from the projected <RefreshControl>'s own @Inputs (refreshing,
      tintColor, colors, folded accessibility set), routed through THAT component's
      ngOnChanges — the host ScrollView's inputsRevision never moves when they change.
      Memoizing would freeze refreshing at its first value and strand the native spinner
      permanently",
  general_rule: "a §7 revision bridge covers the inputs of the component that OWNS the bump,
               nothing else. Reading a @ContentChild's/@ViewChild's inputs inside a memoized bag
               needs a revision signal on THAT child, exposed to the parent — a cross-component
               design step, not a local refactor"
}
```

## Measured outcome of the 2026-08 memoization sweep

```
ScrollView.contentProps + scrollProps   2 re-pushes/scroll frame -> 0
VirtualizedList.foldedAccessibility     20 rebuilds/refresh      -> 1 (cached)
host-props callback wrappers            11 wrappers/5 cycles     -> 1
```

Left as getters on purpose, each for a reason recorded above: the refresh-control pair (§12),
`keyboard-avoiding-view` and `text-input` (§9), and every single-read getter — a `computed` buys
nothing at one read per refresh and only adds a staleness surface.

## §13. THE BIG ONE: a `[style]` / `[class]` binding writes the input but never dirties the child (2026-08)

```
§13_style_class_binding_no_dirty := {
  found: "chasing TouchableOpacity's frozen style — not Touchable-specific, reproduces on a bare
        OnPush child with a single @Input",
  scope_correction: "ordinary inputs propagate fine EVERYWHERE — [testID], [title], [data],
                    [animating], [sections], [source], [value] each measured (mount, change one
                    binding, diff committed Fabric tree), each re-ran the child's template. The
                    frozen axis is exactly the binding NAMES style and class — where Symbiote's
                    whole styling surface sits, since every composed component declares a real
                    style @Input to keep RN StyleProp arrays away from Angular's CSS engine",
  traced: "probe per participant, one CD pass per line:
             pass 1  parent.template style={margin:1}  -> child.bag style={margin:1}
             pass 2  parent.template style={margin:2}  -> (child.bag NEVER runs)
           parent DOES refresh, input IS written, child's ngOnChanges/ngDoCheck DO fire and see
           the new value — child's TEMPLATE never re-executes. Anything derived in a getter/
           template expression is frozen at creation",
  angular_only: "verified against other adapters, not assumed —
               adapters/react/src/components/touchable/touchable-style-updates.test.tsx and
               adapters/vue/src/components/touchable-style-updates.test.ts (mount, change style,
               assert committed node) both PASS",
  mechanism: "setInputsForProperty ends in markDirtyIfOnPush, which sets ONLY LViewFlags.Dirty
            (instructions/shared.ts). detectChangesInView (instructions/change_detection.ts)
            honors Dirty ONLY in ChangeDetectionMode.Global; RefreshView and a dirty reactive
            consumer are honored in ANY mode. markForCheck() sets RefreshView, a signal write
            dirties the consumer — exactly why every §7-§12 fix works and plain input
            propagation does not. Ruled out: parent DOES call
            detectChangesInChildComponents(..., ChangeDetectionMode.Global) and the child IS in
            tView.components (proven by a control sibling bound to [other] instead of [style],
            same parent/pass/value, refreshing fine) — child enters Global mode carrying
            Dirty/RefreshView/CheckAlways all unset, because it was never marked at all:
              [foo]   -> ɵɵproperty -> setPropertyAndInputs ->
                         isComponentHost(tNode) && markDirtyIfOnPush(...)
              [style] -> the STYLING instruction -> sees a directive input of the same name ->
                         setDirectiveInputsWhichShadowsStyling (instructions/property.ts:58-67)
                         = write the input, stop. No markDirtyIfOnPush.
            Confirmed in the installed @angular/core 22.0.8 bundle, not just vendored source —
            genuine upstream Angular behaviour, no bootstrap/wiring-level fix exists; Global
            mode does not help a view that is neither dirty nor CheckAlways",
  blast_radius: "15 components frozen on at least one axis, several on only ONE of the two
               (VirtualizedList tracked [style] but not class; AnimatedView and
               TouchableWithoutFeedback the other way round) — a check binding both at once
               reads a frozen component as healthy. Immune: components already carrying the §7
               inputsRevision+computed bridge (Pressable, ScrollView, Switch, Image, Modal,
               RefreshControl, SafeAreaView, InputAccessoryView, TouchableHighlight,
               TouchableNativeFeedback) — a signal write dirties the template consumer,
               honoured in any mode",
  invisible_on_device: "no example app in any adapter bound a CHANGING class/style to an
                      affected component, and TouchableOpacity wasn't used at all —
                      examples/angular's ReactiveStyle screen (§14) exists so that stays true by
                      construction, not luck"
}
```

## §14. The fix for §13, its ONE exception, and the canary that keeps it honest (2026-08)

```
§14_fix_and_button_exception := {
  fix: "SymbioteStyleInputDirective (primitives/shared.ts) — entire body is
      ngOnChanges -> markForCheck(), attached via
      hostDirectives: [{ directive: SymbioteStyleInputDirective, inputs: ['style'] }] on every
      composed component with a style input. Precisely the markDirtyIfOnPush the styling
      instruction skipped — inside a refresh, markViewDirty needs only the Dirty bit. The 15
      primitive hosts deliberately excluded: push style straight through Renderer2 in
      ngOnChanges, need no template re-run",
  discrimination_check: "markForCheck() body removed: PASS 177 / FAIL 2
                       (render/input-propagation.test.ts and touchable's previously-skipped
                       toggle-opacity, un-skipped by the fix) and nothing else; restored: all
                       green",
  exception: "Button — RN's Button has no style prop, so ours declares no style @Input, so
            hostDirectives has nothing to hang off; class= on it still resolves onto its anchor
            and still went nowhere. Kept the OTHER shape: anchorStyle signal polled in
            ngDoCheck (AnimatedComponentBase precedent). Verified red before / green after in
            components/button.test.ts"
}
```

| what changed                                                             | reaches the component as                                      | fix                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------ |
| `[style]` where a `style` @Input exists                                  | an input write with no dirty mark                             | `SymbioteStyleInputDirective`              |
| `class=` / `[class.x]` / `[ngClass]`, or `[style]` with no `style` input | renderer addClass/removeClass onto the anchor, never an input | `anchorStyle` signal polled in `ngDoCheck` |

A NEW composed component needs whichever row applies to it; a plain getter over
`anchorStyleProp(...)` is the bug both rows exist to prevent.

**The canary: `examples/angular` → Menu → "Reactive style".** One toggle over a grid of 64px
tiles, one tile per component, `class=` and `[style]` as SEPARATE rows (a single tile carrying
both would flip on its live axis and read as healthy). Pass is the whole grid turning from red to
blue on one tap; fail is a checkerboard, and each stranded tile is captioned with the component to
fix. Pressable / TouchableHighlight / ScrollView are the controls — if they do not flip, the
screen itself is dead and nothing else it shows means anything. Ordinary inputs are deliberately
absent: they propagate correctly, so a tile driven by one would only dilute the signal.

### §14a. The `class` half, found by the canary rather than by a test (2026-08)

```
§14a_class_axis_found_by_canary := {
  found_by: "the ReactiveStyle screen's first run, not a test — [style] row flipped 15/15, class
           row left EIGHT tiles stranded: TextInput, ActivityIndicator, ImageBackground,
           KeyboardAvoidingView, FlatList, SectionList, VirtualizedList,
           VirtualizedSectionList — exactly the set §13's audit predicted, incl.
           VirtualizedList's one-axis asymmetry. Nothing headless caught it: §14's fix hangs off
           ngOnChanges, a class toggle produces none",
  fix_bulk: "ngDoCheck poll moved INTO SymbioteStyleInputDirective itself (compares the anchor's
           style, markForCheck() on change) — every component already carrying that directive
           got the class axis for free, no new registration. Dedup gate is load-bearing:
           unconditional marking re-dirties the view every tick, free-runs CD",
  fix_special_2: [
    "FlatList — resolvedStyle recomputed in ngOnChanges, which never runs for a bare class
     toggle; moved to ngDoCheck. Old comment shows the trap: author had already removed a
     changes['style'] guard 'so a bare class= is not skipped', not noticing the whole hook was
     skipped",
    "VirtualizedList — ngDoCheck dedup gate listed every input but not the anchor, so no entry
     ever moved on a class toggle and the recompute was skipped forever. Added
     anchorHostStyle(this.elementRef) to recomputeInputs",
  ],
  regression: "src/__tests__/anchor-class-tracking.test.ts, one case per consumption shape
             (inline anchorHostStyle, style-array fold, stableAnchorStyle+gate). Verified: poll
             body removed -> 5 fail, restored -> 184 pass",
  harness_traps: [
    "the class-derived style does not reliably land on the node carrying testID, nor reliably
     below it — ImageBackground and FlatList commit it onto the wrapper CONTAINING their testID
     node. A subtree-only search reads a working component as broken; search node, subtree, then
     ancestors nearest-first",
    "under JIT, mounting SectionList/VirtualizedSectionList alongside VirtualizedList throws
     'Can't construct a query for the property \"listHeaderDir\"' (module-init order leaves the
     queried directive undefined); KeyboardAvoidingView needs a native event hub the headless
     harness has not installed. Both are harness limits, not product bugs — cover those in their
     own files, which already work around it",
  ],
  open: "FlatList's own [testID] never reaches the committed tree (not forwarded to the inner
       VirtualizedList/ScrollView). Headless-observed only; examples/angular's
       angular-chips-list selector suggests device behaviour may differ. Not investigated"
}
```

## §15. The scroll-frame cost: two independent markForCheck sources, both per-frame (2026-08)

```
§15_two_scroll_markforcheck_sources := {
  symptom: "Angular canary scrolls at ~37fps, worst in the sticky section; React drops ~2 frames,
          Vue ~1, Svelte none. The 2026-08 memoization sweep did NOT move it — the sweep cut
          the cost PER pass (stable prop bags, no re-push, no re-commit) but left the NUMBER of
          passes untouched",
  why_sticky_worst: "sticky headers pin scrollEventThrottle to 1 (STICKY_NATIVE_SCROLL_THROTTLE,
                    core/components/src/view/render-scroll-view.ts, matching ScrollView.js) vs
                    16 elsewhere — JS receives ~16x more scroll events there. Throttle is RN's
                    own value, not the thing to change; each event cost a full ancestor-screen
                    template execution",
  source_1: "SymbioteHostPropsDirective.wrapCallback wraps EVERY onX prop with markForCheck(),
           scroll included — walks RefreshView|Dirty to root (§3) on every frame. Fixed by
           excluding the one per-frame callback: PER_FRAME_CALLBACK = 'onScroll'. Drag/momentum
           begin/end family stays wrapped (once per gesture, not hot; a handler mutating plain
           state there is ordinary code). Nothing lost its refresh — VirtualizedList marks
           itself (source 2), sticky rides the native driver, a caller's own handler is
           typically an Animated.event touching no Angular state (the canary's is exactly
           that)",
  source_2: "VirtualizedList.dispatch marked whenever the reducer reported changed, and the
           shared reducer returns changed:true for EVERY scroll offset — correctly, since the
           offset feeds end-reached distance, viewability, the batch-fill timer (all effects).
           But none of those are what the TEMPLATE reads (it reads the window). Now gated on a
           render signature (first|last|count|total) — a frame moving no cell marks nothing.
           Shared reducer deliberately NOT changed — its changed flag is right for what it
           means, editing it would reach React/Vue for an Angular-only problem",
  measured: "components/virtualized-list/scroll-cost.test.ts (10 frames, screen with 5 @for
           rows): screen template re-runs 10 -> 1, @for row re-runs 50 -> 5 (the remaining 1 is
           the first frame genuinely moving the window, correctly paid).
           __tests__/scroll-change-detection-cost.test.ts flipped from asserting the defect
           (10/50) to asserting 0/0 for a frame that changes nothing; its 'handler still called'
           assertion separates 'stopped wasting work' from 'stopped delivering the event'; the
           responder tests remain the discriminator proving non-scroll onX props still mark",
  device_result: "60fps, dipping to 59 — level with Vue (was ~37, sticky section, iPhone 17 sim).
                The two gates above were the WHOLE gap; the signal refactor below was NOT
                needed, should not be undertaken speculatively — re-measure before reaching for
                it",
  not_fixed_next_lever: "a frame that DOES move the window still re-runs the whole ancestor
                        chain — markForCheck has no 'dirty only me' mode, only a signal write
                        does (markAncestorsForTraversal, §5). Moving VirtualizedList's
                        template-bound state (windowCells + friends) onto computed()s driven by
                        a renderVersion signal is that step — NOT a small edit: those fields are
                        assembled in recomputeView() from ngDoCheck, and ngDoCheck only runs
                        when an ancestor refreshes, so the derivation must move INTO the
                        computeds for the targeted path to work at all"
}
```

### §15a. Measured: the anchor poll is free, do NOT replace it with a push (2026-08)

```
§15a_anchor_poll_is_free_measured := {
  question: "§14a put an ngDoCheck anchor poll on ~24 composed components — is it worth replacing
           with a push from the renderer (commitClassStyle writing a signal, no polling)?
           Architecturally nicer. Measured first — answer is no",
  measured: "scratch counter in the directive's ngDoCheck, screen with 5 directive-bearing
           components (Pressable, SafeAreaView, TextInput, ImageBackground, VirtualizedList)
           plus a real VirtualizedList:
             mount:                   7 polls
             10-frame scroll burst:   6 polls  (0.6/frame)
             one full screen refresh: 5 polls  (one per directive-bearing component)",
  why: "the poll rides on template execution — ngDoCheck only runs when an ancestor actually
      refreshes. §15 cut scroll frames from 'refresh the whole screen' to 'refresh nothing
      unless the window moved', so the poll count collapsed with it — the 6 polls across ten
      frames are the ONE frame that genuinely moved the window (cross-checks §15's 10->1 as
      real). Each poll = one property read + Object.is",
  conclusion: "no push refactor, no signal migration for this. If a future screen ever refreshes
             on every frame again, re-measure then rather than assuming"
}
```

## §16. The flat bag was pushed key-by-key with no diff — and OnPush is NOT the benchmark story (2026-08-20)

```
§16_host_props_bag_written_whole := {
  question_asked: "Angular is ~3x every other adapter on the js-framework-benchmark rows that
                 BUILD the list (create 2383ms / replace 2515 / append 2544 / clear 126 vs Solid
                 765/804/910/16) while its POINT ops are normal (select 77.3, swap 80.6, remove
                 83.9 — the field is 62-116). Hypothesis under test: BenchmarkScreen's four
                 @Components lack OnPush",
  ONPUSH_REFUTED: "measured headless, examples/angular's BenchmarkRow verbatim, 1000 rows, Default
                 vs ChangeDetectionStrategy.OnPush — every counter BYTE-IDENTICAL (createNode
                 9000, completeRoot 1, nodesVisited 9003, engineNodes 12005, rendererWrites
                 106000, rowTemplateReads 1000). Two reasons: a create is a first BUILD, not a
                 re-check, and zoneless Angular 20+ already runs a signal write in TARGETED mode
                 (§5) — a meter signal ticking 10x beside 1000 mounted rows cost 10 viewsChecked
                 and 0 row-template runs under Default. Do NOT sprinkle OnPush on app screens for
                 this; examples/angular has 44 @Components, 2 with OnPush, and that is fine",
  ENGINE_EXONERATED: "same 1000-row create, Angular vs Solid: createNode 9000 = 9000,
                    completeRoot 1 = 1, nodesVisited 9003 = 9002, engine walkMs 10.5 = 11.2.
                    Identical Fabric output. Whatever the device 3x is, it is not the engine",
  THE_ONE_REAL_GAP: "engine setProp() calls for that create — Angular 104 000 vs Solid 12 000
                   (8.7x), of which 90 000 carried `undefined`",
  root_cause: "SymbioteHostPropsDirective's setter wrote EVERY key of the bag on every push, and a
             composed component's bag is a FIXED-SHAPE literal — Pressable's hostProps() computed
             lists ~48 keys (nextFocus*, the whole accessibility + aria set, android_ripple pair),
             nearly all `undefined` on any instance. Two Pressables per benchmark row x 1000 rows
             = 96 000 writes that each did `delete node.props[key]` on a fresh object plus a
             markDirty walk, and produced nothing. Per row: 106 writes to deposit ~17 keys",
  fix: "per-key diff in the directive (adapters/angular/src/primitives/shared.ts): skip when
      Object.is(previouslyPushed[key], value), plus a second pass clearing keys that VANISHED
      from the bag (resolveAccessibilityProps genuinely returns two different key sets — see
      .claude/rules/solid-descriptor-bridge.md trap 1 for the same hazard elsewhere). Previous
      values are COPIED, not aliased: a component may hand back the same object mutated",
  measured_after: "create 1000: setProp 104 000 -> 14 000 (Solid 12 000), rendererWrites 106 000
                 -> 16 000, undefinedWrites 90 000 -> 0, committed tree byte-identical.
                 UPDATE path is the bigger win: 5 press cycles on ONE Pressable, 460 renderer
                 writes -> 10 (92/press -> 2/press)",
  HONEST_LIMIT: "on desktop V8 this buys NOTHING measurable — framework half of the create was
               108.0ms before and 113.3ms after, inside a 108-135ms run-to-run band. V8's JIT
               makes 90 000 monomorphic delete+regex+Set-lookup calls near-free. Hermes is a
               bytecode interpreter with no JIT and no widenable semi-space, which is where a
               7.4x call-count cut should pay — but that is a PREDICTION. Do not quote a
               millisecond figure for this until the device says one",
  the_3x_IS_NOT_REPRODUCED_HEADLESS: "same host, same operation: Angular framework time 113ms vs
                                     Solid 92ms — 1.23x, not 3.1x. So either Hermes amplifies
                                     exactly this call-count gap, or something in the real screen
                                     is absent from a minimal probe. Next suspects, in order:
                                     (1) 3 002 extra engine nodes per 1000 rows — an anchor host
                                         per composed component (<Pressable> x2 + the row
                                         component itself), 12 engine nodes/row vs Solid's 9,
                                         each an allocation and each forcing renderableChildren
                                         to rebuild its parent's child array on EVERY reconcile;
                                     (2) Angular's own LView+LContainer instantiation for 1000
                                         component instances, which OnPush provably cannot touch;
                                     (3) §21d's per-frame idle commit running THROUGHOUT each
                                         timed operation, Angular-only",
  guarded_by: "adapters/angular/src/primitives/host-props-diff.test.ts, 3 cases, each broken once:
             removing the skip -> `expected [ 'nativeID', 'accessibilityHint' ] to deeply equal
             []`; skipping undefined unconditionally -> the change-to-undefined case reads `[]`
             instead of one write; dropping the vanished-key pass -> same shape on `role`",
  side_effect: "host-props-wrapper-stability.test.ts asserted `pushed.length > 1` as a
              PRECONDITION for its wrapper-identity check. A stable handler is now pushed exactly
              once, so that line became toBe(1) — the guarded property (one wrapper per unchanged
              handler) is unchanged and now holds more strongly",
  repack_required: "the fix is in adapters/angular, so examples/angular needs the documented pack
                  loop before any device re-measurement"
}
```

## §17. §15's scroll gate had a latch: a "settled" verdict it could never leave (2026-08-20)

```
§17_render_signature_latch := {
  bug: "examples/angular Benchmark sticky PATH B (SectionList 16x32, getItemLayout, 320px box)
      painted up to flat index 120 - section 4 row 18 - and blank to the bottom of the box,
      forever. 120 is EXACTLY the window a 320px viewport asks for at offset 0, so the list was
      not mid-fill: it had stopped reacting to scroll altogether",
  root_cause: "§15 source_2 gated dispatch's markForCheck on `renderSignature() !==
             lastRenderSignature`, where renderSignature() reads the LIVE metrics - which are only
             recomputed inside a CD pass, i.e. only after a mark. The comparison therefore lags the
             state by one pass and works only while every recompute MOVES the window. The moment
             two consecutive recomputes agree (a sub-row scroll delta; at 60Hz, most frames),
             lastRenderSignature equals the live metrics and the gate LATCHES: no mark -> no CD ->
             no ngDoCheck -> no refresh-metrics -> metrics frozen -> signature frozen. Permanent,
             and it swallows arbitrarily large offsets after it",
  why_no_revival: "nothing else can restart it. The batch-fill pump needs a commit, which lives in
                 ngAfterViewChecked, which needs a CD pass. An unrelated ancestor refresh does not
                 reach the list either - a plain @Component child is SignalView and is skipped when
                 not dirty (§3d). ngDoCheck's lastRecompute gate is NOT the culprit: renderVersion
                 does bump",
  hypothesis_refuted: "the ngAfterViewChecked / listEffectSignature guard was the suspect and is
                     INNOCENT - it never even runs, because its view is never checked. Counters at
                     the moment of the frozen scroll: scrollTicks=1 listMarks=0 listChecks=0
                     listRecomputes=0 cdPasses=0. The event arrived; dispatch returned before the
                     mark",
  fix: "isWindowSettled(action) (components/virtualized-list/index.ts) replaces the signature
      field. It asks the question the gate always meant to ask - `would a render leave the window
      where it is` - of the state as it is NOW: re-run the SHARED computeWindow over the CACHED
      offsets/lengths at the live scrollOffset/viewportLength and compare with metrics.target.
      Two scans, no allocation; buildOffsets (the O(count) allocating half) still runs once per
      render. Returns false unconditionally for a `measure` action (it rewrites the very table the
      prediction reads) and while committedWindow is short of target (only a render advances the
      throttle - skipping there is what stalled the fill)",
  no_drift: "it calls the same function the render will call, so the prediction cannot disagree
           with the window it predicts. Do NOT hand-inline computeWindow's boundary test here",
  cannot_free_run_CD: "markForCheck is reachable ONLY from dispatch, and dispatch only from a
                     native callback or an adapter timer - never from a CD hook. ngDoCheck's
                     lastRecompute gate (the guard that actually prevents the windowCells ->
                     VListOutletDirective -> markForCheck loop) is untouched and still keyed on
                     renderVersion, which only moves in dispatch. The predicate terminates: it
                     returns false only while the window is short of target or the target moved,
                     both resolved by one render",
  guarded_by: "components/virtualized-list/refill-pump-deadlock.test.ts, 3 cases on the real PATH B
             config, each broken once:
               schedule-refill effect disabled -> `the fill pump stopped short of its target:
                 window [0, 19] of target [0, 120] over 544 entries at offset 0` (case 1) and
                 `... window [0, 69] of target [0, 223] ... at offset 3000` (case 2)
               prediction fed a stale offset -> `the list never recomputed its window for the
                 offset it was scrolled to: expected +0 to be 6000` (case 3, and ONLY case 3)
             Observable is subscribeListDiagnostics, not the committed tree: a frozen list reports
             a target that agrees with itself, so the fill predicate alone reads healthy - the
             frame's scrollOffset is what catches it",
  side_effect: "scroll-cost.test.ts (§15's own regression) went 1 screen re-run / 5 row re-runs ->
              0 / 0. That list never gets a viewport, so no offset can move its window and it owed
              nothing; the 1 was the stale lagging pass being paid for. Property held more
              strongly, not weakened",
  scope: "ANGULAR ONLY - checked, not assumed. React (forceRender via useReducer tick+1), Vue
        (version.value += 1), Svelte ($state version += 1), Solid (setVersion(tick+1)) all notify
        UNCONDITIONALLY on `changed`; none has a window-comparison gate on the notification. Their
        shared listEffectSignature dedup is on the COMMIT, recomputed from current state each
        pass, and throttleWindow provably moves an edge whenever a refill is pending - so it
        cannot latch. PATH A (plain ScrollView + stickyHeaderIndices, every child mounted) has no
        window and no pump at all; its sticky rides an Animated interpolation off the native
        scroll value. Unaffected",
  latent_all_five: "maxToRenderPerBatch is defaulted with ?? and never clamped in all five
                  adapters, so an explicit 0 makes throttleWindow return the previous window while
                  commitList still reports below-target - the pump dies after one tick,
                  framework-independently. Not hit in practice, and the clamp belongs in the
                  reducer, not in five adapters",
  repack_required: "the fix is in adapters/angular, so examples/angular needs the documented pnpm
                  pack + rm node_modules/@symbiote-native/angular + rm package-lock + npm install
                  loop before the device shows it"
}
```

### §pack_ships_stale_aot — `pnpm pack` on adapters/angular shipped an OLD build, silently (2026-08-20)

Cost: two fixes reported "installed and verified", neither in the bundle; a wrong device
conclusion built on top of that (see honest_limit above); one wasted measurement.

```
"prepare":   node -e "existsSync('build/angular/index.js') || process.exit(1)"  ||  pnpm run ng:build
"ng:build":  pnpm run clean && ngc -p tsconfig.angular.json
"typecheck": tsc --build
```

`prepare` rebuilds ONLY IF `build/angular/index.js` is missing — right for install-time (a
workspace consumer should not pay for an AOT build on every `pnpm install`), and exactly wrong for
packing: the folder exists after the first build, so every later `pnpm pack` packed stale output.

Compounding it, `tsc --build` does NOT write that tree. It emits `build/render/`,
`build/components/`, … while `exports` sends Metro's `react-native` condition to
`./build/angular/index.js`. "I built it, I packed it, I grepped the file" was true three times and
still shipped nothing:

```
build/render/index.js                     getElementById: 3   <- tsc --build wrote this; unloaded
build/angular/render/index.js             getElementById: 0   <- Metro loads THIS
build/angular/components/virtualized-list contextFor:     0
```

**Fixed 2026-08-20** by adding `"prepack": "pnpm run ng:build"` — pack/publish only, so the
published artifact is always freshly compiled, while `prepare` keeps its cheap install-time guard.
`adapters/svelte` already had this shape; Angular was the outlier. package.json cannot carry a
comment, which is why the rationale lives here. Verified by packing without touching `build/` and
watching `build/angular/index.js`'s mtime change.

Two rules that outlive this bug:

1. **`tsc --build` is a typecheck for this adapter, not a build.** Only `ng:build` produces what
   ships.
2. **Verify the artifact at the path `exports` resolves, never a sibling.** Every grep in the
   pack -> reinstall loop must name `build/angular/**` (and, installed,
   `examples/angular/node_modules/@symbiote-native/angular/build/angular/**`). A hit in another
   tree proves nothing, and reads exactly like proof.

## §18. The fling frame, measured: 228 of 233 cells re-stamped for nothing (2026-08-20)

```
§18_fling_frame_cost := {
  symptom: "with §17's latch fixed, examples/angular PATH B scrolls but the JS thread drops to
          ~7fps on a fast fling and cells fill in behind the finger. The other four adapters hold
          frame rate on the same screen, same shared reducer, same RN defaults",
  instrument: "components/virtualized-list/scroll-cost.test.ts gains a PATH B fling block (544
             entries, getItemLayout, 320px viewport, RN defaults) parked past the overscan so the
             window SLIDES rather than grows; control =
             adapters/solid/src/components/virtualized-list/fling-cost.control.test.tsx, same
             geometry, same reducer. Both report OPERATION COUNTS, and both write their report to
             $SYMBIOTE_FLING_REPORT / $SYMBIOTE_FLING_REPORT_SOLID (vitest stdout is swallowed)",
  steady_state_gotcha: "windowSize 21 x a 320px viewport = (21-1)/2*320 = 3200px overscan per side,
                      so below offset 3200 the window's first index never leaves 0 and a scroll only
                      GROWS it. A fling measured from offset 0 prices a first paint. Park at 6000",
  measured_per_frame: "                     Angular before   Angular after   Solid (control)
                     cell views built             4.2            4.2            4.2
                     cell views destroyed         4.2            4.2            -
                     CELLS RE-STAMPED           228.3            0.0            0
                     window width               232.6          232.6          232.6
                     deriveMetrics                1.0            1.0            1.0
                     engine commits               1.0            1.0            1.0
                     engine nodesVisited        251.2          251.2          250.2
                     propWrites                  19.8           19.8            6.2
                     childScans                  43.2           43.2           26.0
                     primitive views checked    236.6          236.6            -",
  ISWINDOWSETTLED_CLEARED: "§17's gate is 372 array-index steps/frame (computeWindow's loops walk
                          exactly `last + 2` entries, readable off its own result) and 0.02-0.03%
                          of the frame timed in isolation on desktop V8. It is not the regression.
                          Note it is CHEAPER than the deriveMetrics pass beside it, which walks all
                          544 through buildOffsets and allocates 544 getItemLayout objects + 2
                          arrays per frame",
  root_cause: "recomputeView minted a FRESH context object per cell every pass. VListOutletDirective
             refreshes a stamped view whenever `[vListOutletContext]` changes IDENTITY, so a
             four-cell slide re-stamped all 233: copyContextFields + markForCheck (walks to root)
             + a full embedded-view refresh, each producing byte-identical output (rendererWrites
             flat at 11.4, engine profile identical before/after)",
  fix: "cellContexts: Map<key, context> in components/virtualized-list/index.ts. contextFor() hands
      back the SAME object while item identity and index hold; a cellContextEpoch over
      [data, extraData, getItem, keyExtractor] clears the map so RN's extraData contract survives.
      Swap-not-prune: nextCellContexts becomes cellContexts at the end of each recompute",
  precedent: "Solid already does this by construction - its <For> is keyed on the cell KEY strings
            'so the plan's freshly-built cell objects' cannot rebuild every row
            (adapters/solid/.../virtualized-list/shared.tsx, cellKeys memo). Re-keying that <For>
            per pass in the control probe reproduces the identical defect: 232.55 cell bodies/frame",
  honest_limit: "on desktop V8 the fling loop went 2.921 -> 1.956 ms/frame, inside a noisy band; the
               claim is a WORK-COUNT claim (228.3 -> 0). **Device-measured 2026-08-20, this time
               with the fix verified present in build/angular (the tree Metro loads): fast-fling
               PATH B went 17-22fps -> 22-30fps.** Real, and modest - which is the honest shape of
               it, because the fix removes ONE of three per-frame terms. An earlier version of this
               line claimed confirmation BEFORE that was true.** What happened:
               the device did improve that afternoon (blanking gone, 7fps -> 20/49/60), the win was
               credited to this fix, and it belonged to §17's deadlock fix, which had shipped in an
               earlier pack. THIS fix was still sitting in a build tree nothing loads - see
               §pack_ships_stale_aot. So the 17-22fps fast-fling figure was measured WITHOUT the
               cell-context cache. Re-measure before claiming anything. The trap, stated once: when
               two fixes are in flight and neither was verified IN THE ARTIFACT THAT ACTUALLY RUNS,
               a real improvement from one is trivially handed to the other. For the record the
               whole arc reads: 1-7fps (deadlock, list did no work and looked smooth) -> 7fps
               (deadlock fixed, real cost exposed) -> 17-22 (unrelated, fix not actually shipped)
               -> 22-30 (fix shipped). Same rule as §16",
  what_remains_and_is_INTRINSIC: "236.6 primitive host views checked per frame - every symbiote-* in
             the list's own @for is CheckAlways, so the window width IS the per-frame tree walk, and
             Solid pays zero there. Plus 232.6 shared plan-cell objects and 544 buildOffsets steps,
             which BOTH adapters pay. Every one of these is O(window), and the window is 233 cells
             because RN's default windowSize 21 overscans a 320px BOX by 6720px",
  app_level_lever: "windowSize on the PATH B box. 21 -> 5 makes the window 320*5 = 1600px ~ 55 cells,
                  a 4.2x cut in EVERY per-frame O(window) term for all five adapters. This is an app
                  knob, not an adapter fix - and BenchmarkScreen is a shared cross-adapter
                  instrument, so retuning it changes what it measures in all five flavors at once.
                  Propose, do not unilaterally retune",
  guarded_by: "scroll-cost.test.ts, both cases broken once:
             reuse removed -> `a sliding window must re-stamp only the cells that entered it:
               expected 4567 to be +0`
             epoch invalidation removed -> `an extraData change must reach every cell already in the
               window: expected +0 to be 121`
             control's own claim broken by re-keying its <For> -> `a keyed window must run a cell
               body only for the cells that entered it: expected 232.55 to be less than 23.25`",
  harness_note: "the fill-to-target settle must be CONDITION-driven, not a fixed count of 55ms ticks
               - a fixed 80-step settle added ~9s of wall clock to the angular project and tipped
               flat-list-array-style.test.ts's waitForQuiet into reading a slow neighbour as a
               free-running change detector (it says so in its own comment)",
  repack_required: "the fix is in adapters/angular, so examples/angular needs the documented
                  pnpm pack + rm node_modules/@symbiote-native/angular + rm package-lock +
                  npm install + pod install loop before the device shows it"
}
```

## §19. The flat row's own 9 primitives are still real `@Component`s — a fourth suspect, headless-confirmed (2026-08-30)

```
§19_primitive_LView_cost := {
  found_by: "cross-session collaboration chasing the flat-row Create gap (418.2ms Angular flat vs
           stock 186.8 / Solid-lowered 159.8, device Release, 2026-08-23 — root CLAUDE.md), AFTER
           anchors (§16/anchor census) and CheckAlways/the meter (§21j, corrected above) were both
           ruled out for CREATE specifically",
  the_fact: "primitives/index.ts declares View/Text with a DUAL selector —
           `selector: 'symbiote-view, View'` / `'symbiote-text, Text'` — so BenchmarkScreen's flat
           row (9 nodes/row, 0 anchors, byte-identical committed tree to composed —
           benchmark-row-shape.test.ts) still instantiates 9 000 real Angular @Component instances
           for a 1 000-row Create. The screen's own comment ('no component boundary anywhere')
           is true only of the ROW component; the primitives underneath are components too, 9 per
           row, 9 000 per run — the exact disease Vue/Svelte/Solid already found and fixed by
           lowering to intrinsic tags, just not yet named for Angular",
  the_mechanism_that_makes_lowering_possible: "verified against .vendors/angular source, not
           inferred: dom_element_schema_registry.ts hasElement()/hasProperty() consult
           CUSTOM_ELEMENTS_SCHEMA only when `normalizedTag.includes('-')` (:400, :422). `View`/
           `Text` have no hyphen and can NEVER fall through the schema; `symbiote-view`/
           `symbiote-text` can, but ONLY when nothing in the template's `imports` matches that
           selector — the moment ViewHost/TextHost is imported, the hyphenated spelling resolves
           to the component exactly like the capitalized one, dual-selector as designed. So
           'lowering' an Angular primitive means: the template must spell the INTRINSIC tag, not
           the capitalized alias, AND the enclosing component's `imports` must omit View/Text, AND
           carry `schemas: [CUSTOM_ELEMENTS_SCHEMA]`. renderer/index.ts's `createElement(name)`
           resolves the engine node from the raw tag STRING either way (alias-normalizes, checks
           `isAnchorHostComponent`, calls `descriptorFor`) — so a bare `<symbiote-view>` and a
           component-backed `<View>` reach the IDENTICAL engine call; only the component path pays
           Angular's LView/TView/DI/`<ng-content>` machinery on top",
  headless_measurement: "direct within-Angular A/B (not cross-adapter): same flat-row markup,
           9 nodes/row, 0 anchors either way, structurally verified byte-identical committed tree
           and view-name list at small N. Create-1000, vitest/Node/V8, fake-fabric, min of 5 runs
           (the project's own convention for a create-shaped row, noisy — spreads were
           33.5->19.8ms component-backed and 26.5->13.3ms lowered, so quote the min, not a single
           run):
             component-backed (@Component)   min 19.85ms
             lowered (bare custom element)   min 13.26ms
             cut                             33.2%",
  prediction_was_fixed_before_running: "≥30% cut = hypothesis alive, <10% = dead on V8 (population-
           before-hypothesis, cross-session ask). 33.2% clears it",
  why_this_is_STRONGER_evidence_than_§16: "§16's setProp-count fix (104k -> 14k calls) cut 0% on
           V8 and only helped Hermes — a pure JIT-erases-monomorphic-calls story. THIS cut is
           already visible on V8, meaning the LView/TView/DI/ng-content cost is genuine structural
           work an optimizing compiler cannot erase, not merely an interpreter tax. Expect Hermes
           to show at least as much, likely more (no JIT at all) — but see the next line before
           quoting a number",
  DO_NOT_carry_the_headless_MAGNITUDE_to_device: "cross-session correction, worth keeping as a
           standing rule for this file: this project's headless bench has mis-sized a real device
           delta FIVE TIMES IN A ROW, in both directions — Vue's lowering under-predicted by ~2x
           (12-14% headless vs 25-29% device), the prototype-graft move over-predicted ~2.5x, the
           fabricProps rewrite under-predicted ~4.6x, an allocation pass over-predicted ~5.7x. The
           bench ranks DIRECTION and MECHANISM reliably; it has never once reported the right SIZE.
           Go to device with 'a cut exists, size unknown', never with '33%'",
  third_row_shape_SHIPPED_2026_08_30: "BenchmarkScreen's ROW_SHAPE gained `Lowered` — 'Rows ·
           lowered' button, a PROBE-table LOWERED column, all three shapes snapshot in ONE binary.
           `benchmark-row-shape.test.ts` verified to survive it (69 files / 233 adapter tests green,
           tsc clean) — the drift-fence stayed green because the fix below made it possible.
           Handed to the user: device run is the remaining step, no simulator on either session
           that found this",
  lowering_ANGULAR_is_not_emit_the_tag: "a trap independently found by BOTH sessions doing this
           work, worth stating as the general form: writing `<symbiote-view>` in a template whose
           `imports` still lists `View` does NOTHING — `View`'s selector is
           `'symbiote-view, View'` (primitives/index.ts:27) and Angular's directive matching scopes
           to the WHOLE TEMPLATE, not to one branch of it, so every spelling of a dual selector
           resolves to the component the moment it is importable ANYWHERE in that template. This
           fails SILENTLY — no compile error, no runtime error — and the only visible symptom would
           have been 'the lowering measured 0% cut', which reads as a REFUTED hypothesis rather
           than a broken harness (the mistaken-negative-result family, verify-the-deciding-side.md).
           So lowering an Angular primitive is really 'take the component out of this template's
           scope', three ways to do that: (a) a SEPARATE component whose own `imports` omits
           View/Text, plus `schemas: [CUSTOM_ELEMENTS_SCHEMA]` — what `LoweredBenchmarkRows` does,
           right-sized for one diagnostic screen; (b) split the dual selector so the intrinsic
           spelling never matches the component at all — a design change to every composed
           component that currently relies on the alias, not attempted; (c) a build-time transform
           that rewrites BOTH the tag and the enclosing component's `imports`/`schemas` together,
           i.e. the Vue/Svelte/Solid shape (`core/components/host-primitives.cjs` +
           `REFUSAL_CATEGORIES`) ported to Angular — a whole adapter-wide feature, deliberately NOT
           built for this pass (asked and declined mid-session, root CLAUDE.md's
           `<adapters_stay_thin>` / explicit-over-implicit precedent)",
  anchor_count_is_NOT_comparable_composed_vs_lowered: "`LoweredBenchmarkRows` wraps the WHOLE
           1 000-row list in one composed-component boundary (one host anchor for the list), while
           `composed`'s BenchmarkRow + 2 Pressables costs 3 anchors PER ROW (3 000 for the run).
           A device number comparing `composed` against `lowered` therefore differs by BOTH the
           LView/DI cost this section is about AND an anchor-count difference that is not what is
           under test — state the anchor split next to any such comparison, or a reader will
           attribute anchor savings to a mechanism that was already closed as a suspect (the anchor
           census, above in this file). `flat` vs `lowered` is the clean pair: both 0 anchors, same
           committed tree, differ ONLY in whether the 9 per-row primitives are components.",
}
```

## §20. §19 confirmed on device — the flat row's remaining gap closes to near-stock, and Partial regresses hard (2026-08-30)

**RESOLVED (was flagged provisional, now explained) — two number sets for the same lowered row are
two SEPARATE RUNS on one binary, not two readings of one run.** The numbers below are transcribed
directly from five screenshots (files `2.png`/`3.png`/`4.png`/`5.png`/`7.png`, timestamped
14:40-14:41), re-read a second time against the actual image bytes to rule out a misread. A parallel
session reported a different lowered row minutes later (Create 198.7 / Replace 240.6 / Append 212.9
/ Partial 46.5 / Select 15.6 / Swap 24.9 / Remove 27.6 / Clear 32.6, ~14:43) and a THIRD sample
landed at ~14:48 matching that second one almost exactly (confirmed: same VISITED/WRITES/FABRIC
counts as the first sample, byte-identical committed tree across all three runs — only the wall-clock
ms column moves). User confirmed: ran the suite 3-5 times, these are two of those runs. **Verdict
scope, not a percentage**: Create and Append fall inside the resulting within-arm noise band on both
samples and carry a verdict (lowered wins big); Replace, Partial, Select, Swap, Remove, Clear do
NOT — see `VERDICT_SCOPE_2026_08_30` below.

**This section measures a CEILING, not a shipped capability — read this before quoting any number
here as "what an Angular app gets".** `LoweredBenchmarkRows` (examples/angular's own diagnostic
component) is hand-written for this one screen. Checked 2026-08-30: `adapters/vue` and
`adapters/solid` each carry a real `babel-lower-host-primitives.cjs` build-time transform (Vue also
has `metro-vue-transformer.cjs` for the SFC path) that lowers `<View>`/`<Text>`/`<Pressable>`
automatically, app-wide, for any component that qualifies (per `core/components/host-primitives.cjs`
+ `REFUSAL_CATEGORIES`). `adapters/angular` has NO such file — grep for `HOST_PRIMITIVES` under
`adapters/angular/src` returns nothing outside `build/`. So today an Angular app CANNOT get this win
by writing ordinary `<View>`/`<Text>` markup; it would have to hand-write a `CUSTOM_ELEMENTS_SCHEMA`
component per screen the way this diagnostic does (angular-adapter-change-detection §19's
`lowering_ANGULAR_is_not_emit_the_tag` — the three ways to scope a component out, of which a real
transform, (c), is what would make this a shipped feature and was explicitly declined for this pass).
The numbers below are the upper bound of what a future transform could deliver, not a capability that
exists yet.

The user built and ran the three-shape toggle from §19 on iPhone 17 / iOS 26.5 simulator, Release
implied (numbers land in the documented flat/composed bands, so this is the same build flavor as
every other entry in this file and root CLAUDE.md). All-mounted, one sitting, one binary:

```
§20_device_measured := {
  create_shaped_rows: "
              composed    flat     lowered
    Create      925.0    412.2      202.3    flat->lowered -50.9%   composed->lowered -78.1%
    Replace    1019.0    494.1      210.9    flat->lowered -57.3%
    Append      948.9    472.4      201.7    flat->lowered -57.3%",
  headless_predicted_ge_30_percent_cut__got_50_to_57: "the fixed-before-running threshold (§19)
           was cleared by a wide margin, and in the OPPOSITE direction from what the standing
           'headless never gets the size right' warning would have guessed — Vue's own lowering
           under-predicted by ~2x (12-14% headless vs 25-29% device) and this one under-predicted
           too (33.2% headless vs 51-57% device). Read as a second confirmation of that warning's
           actual content: not 'headless overstates', but 'headless's SIZE is not trustworthy in
           either direction' — the direction and rough existence of the win is all it ever gave",
  read_against_the_master_table: "root CLAUDE.md's stable stock band is 186.8/195.5/196.8 (Create)
           and react's own Create reads 217.8 in the same big table. Lowered's 202.3 sits BETWEEN
           those two — Angular Create goes from 2.2x stock / worst-of-five to effectively TIED with
           React and near-stock, on the exact mechanism (removed per-node component instantiation)
           that already took Vue/Svelte/Solid past stock. It does NOT reach Vue/Svelte/Solid's
           post-lowering numbers (180.0/154.1/159.8) — those adapters have no LView-equivalent cost
           to begin with, so removing Angular's makes it competitive with React's fiber model, not
           with a vdom/compiled-DOM adapter that never paid this tax",
  DO_NOT_read_this_into_the_master_TABLE_COLUMN: "root CLAUDE.md's angular column (418.2 flat) is
           what SHIPS — BenchmarkScreen still defaults to `flat`, and `LoweredBenchmarkRows` is a
           throwaway diagnostic component, not a production primitive. Updating the master
           cross-adapter table to 202.3 would misrepresent what an app actually gets today",
  virtualized_not_run_for_lowered: "the screenshots show composed/flat's VIRTUALIZED column filled
           (flat: Create 75.3, Replace 79.3, Append 23.2) and lowered's blank ('—' on every row) —
           the user ran all-mounted only. Nothing here says whether the cut holds under windowing;
           don't extrapolate it",
  PARTIAL_UPDATE_REGRESSED_HARD__UNEXPLAINED: "the one row that did NOT follow the pattern, and it
           is not noise-floor-small (the project's documented ~15-20ms noise band is for
           CREATE-shaped rows; a swing this size on a 26-71ms row is not obviously that) —
              composed 26.0ms (fastest of the three) · flat 32.3ms · lowered 71.0ms (worst of the
              three, 2.2x flat, 2.7x composed).
           This is the OPPOSITE ranking from every create-shaped row, where lowered wins by 2x and
           composed is worst. The suite's Partial step relabels every 10th of 1000 rows via
           `.map()`, producing a NEW rows array where all 1 000 `row.id`s are unchanged (`@for
           track row.id` should recognize every item as same-identity) and only 100 objects are
           actually new. NO MECHANISM IS CONFIRMED for why removing the per-row @Component boundary
           costs MORE here than keeping it, or why lowered costs more than flat despite both having
           no per-row component. UPDATE (second lowered sample, same binary, 3-5 runs later): a
           THIRD reading of lowered's own Partial read 46.5ms and later screenshots (architect's
           run) read 46.5ms too, against this entry's own 71.0ms — a 24.5ms spread WITHIN the
           lowered arm alone, self-measured, no code change between them. Given the ENGINE window
           for Partial is only 2.7-3.6ms across all three readings (stable, WRITES pinned at
           exactly 100/0 = the true changed-row count every time — no write-count tax, confirmed),
           essentially the WHOLE wall time is Angular's own pass-1 change-detection cost, and that
           cost inherits ITS OWN noise floor, not a function of row count. CONCLUSION (revised):
           a cross-arm verdict on Partial needs `flat` sampled at least twice on the same binary
           before it means anything — right now there is a within-arm 24.5ms spread and only a
           single flat sample (32.3ms) to compare it against, which settles nothing. Do not repeat
           a causal story for the regression without tracing pass 1 directly (a candidate —
           embedded-view refresh semantics for `@for` lacking a per-item skip that a real
           CheckAlways component view also lacks — was drafted and discarded here for not actually
           explaining a flat-vs-lowered gap, since both lack per-row components)",
  select_swap_remove_clear_read_as_noise: "composed/flat/lowered spread 8-12ms on Select (11.3/
           27.1/20.9), Swap (20.9/24.8/25.8), Remove (19.8/29.1/26.5), Clear (70.1/39.9/34.8) — no
           consistent direction, consistent with this file's own small-ms-row non-reproducibility
           caution (root CLAUDE.md, stock Clear 46.7->7.7 with zero code change). Do not read a
           ranking into these without a repeat run",
  VERDICT_SCOPE_2026_08_30: "two lowered samples (14:40 and ~14:48, same binary, no rebuild) give
           the row's own noise band directly: Create (202.3/198.7) and Append (201.7/212.9) both
           sit inside it and both carry a verdict — lowered wins big on create-shaped rows.
           Replace (210.9/240.6) does NOT — the spread is too wide to call. Partial, Select, Swap,
           Remove, Clear: no verdict either way without a second `flat`/`composed` sample to
           compare against",
}
```

## §21. The 26 001 vs 32 001 prop-key gap is NOT a parity bug — it's two different Pressable shapes (2026-08-30)

```
§21_prop_key_gap_resolved := {
  question: "root CLAUDE.md and every Vue/Svelte/Solid lowering entry quote Fabric prop keys as
           '9000/8000/9 @ 32 001' for a 1 000-row Create on the SAME 9-node-per-row tree. Angular's
           flat/lowered row reports 26 001 for the identical node/commit counts (9000/8000/9,
           byte-identical Fabric calls) — 6 000 fewer keys, exactly 6/row. Raised cross-session:
           is Angular silently dropping props another adapter emits (a real parity gap), or is the
           32 001 figure not measuring what it looks like it measures?",
  checked_at_source: "examples/vue-sfc/components/BenchmarkRow.vue and examples/react/screens/
           BenchmarkScreen.tsx's BenchmarkRow, both read directly: BOTH use a REAL `<Pressable>`
           for the two touch targets (`<Pressable class=\"flex1\" @press=...>` / `<Pressable
           className=\"flex1\" onPress={...}>`) — the SAME shape as Angular's own `composed` row
           (BenchmarkRow + 2 real Pressables), never Angular's `flat`/`lowered` row",
  the_actual_mismatch: "Angular's flat/lowered row is a DELIBERATELY reduced diagnostic shape —
           its own comment says so verbatim: 'gives up Pressable's press machine, responder
           negotiation and accessibility fold' in favor of a bare `View` + a `(press)` listener.
           React/Vue/Svelte/Solid's canaries never build that reduced row at all; their Pressable
           got LOWERED (to a `symbiote-pressable` host behavior, core/components/src/behaviors/
           pressable.ts) but kept Pressable's FULL prop/feature surface throughout. So '32 001'
           prices a real Pressable's props (hitSlop-derived responder wiring, accessibility fold,
           disabled/android_ripple, etc. — the exact list flat/lowered's own comment names as given
           up) and '26 001' prices a bare View+press with none of that — not a bug, a different
           question. `setEventListener('press', …)` itself writes ZERO prop keys either way
           (`press` is not in GATED_EVENT_PROPS, node.ts:547/566/578) — a bare press listener is
           pure JS-side registration, so the 6/row gap is Pressable's OWN prop surface, not
           anything about lowering or LView removal",
  what_WOULD_be_comparable: "Angular's `composed` row (real Pressable, same as every other
           adapter's only row) against those adapters' 32 001 — not measured this session (no
           FABRIC table captured for `composed`), but that is the correct pair. `flat`/`lowered`
           vs any other adapter's number is comparing a stripped-down row against a full one and
           was never meant to answer a cross-adapter parity question — only the anchor/LView one",
  no_action_needed: "closes the question raised cross-session 2026-08-30 — no code change, no
           parity gap. Do not re-open it by comparing flat/lowered's key count against another
           adapter's column again without noting this",
}
```

## §22. `composed` vs `composed-lowered` — the actually-comparable pair, built (2026-08-31)

**SUPERSEDED IN PART BY §23 BELOW**: this section's `<symbiote-pressable>` bare-tag mechanism was
SILENTLY BROKEN (a non-painting anchor, not a real view) — read §23 for the two real bugs found and
fixed, and for `DIAGNOSTIC_LOWERED_PRESSABLE_TAG`, the constant `BenchmarkRowPressableLowered`
actually uses. The node-count accounting and the reasoning for why this pair matters below are
still correct; only the "bare `<symbiote-pressable>`" mechanism description is wrong.

§21 above named the fix: `composed` (real Pressable) is Angular's only row shape that carries the
same Pressable feature surface every other adapter's canary does, so it is the only one a
cross-adapter/stock ratio may ever be read off. But `composed` alone cannot isolate the
Pressable-@Component-instance cost from the `flat`/`lowered` investigation — it needed a fourth
shape: same View/Text and row-wrapper as `composed`, Pressable's TAG lowered.

`host-primitive-tier.md`'s "Angular cannot be lowered by rewriting tags" section is about
View/Text specifically (a dual-selector component scoped per-template). Pressable does not need
that trick at all: `core/components/src/behaviors/pressable.ts` already implements the press
machine as an ENGINE-NODE BEHAVIOR keyed on the tag `symbiote-pressable`
(`registerHostBehavior`/`registerPressableBehavior`) — the exact mechanism Vue/Svelte/Solid's
Pressable-lowering transform relies on. Angular had never called `registerPressableBehavior()`;
nothing about the mechanism itself is React/Vue/Svelte/Solid-specific.

`BenchmarkRowPressableLowered` (`examples/angular/src/screens/BenchmarkScreen.ts`, new `ROW_SHAPE.
ComposedLowered`) is a literal copy of `BenchmarkRow` with exactly one change: its two `<Pressable>`
become bare `<symbiote-pressable>` tags, `schemas: [CUSTOM_ELEMENTS_SCHEMA]`, `Pressable` absent
from `imports` (same reasoning as `LoweredBenchmarkRows`'s own header — importing `Pressable`
anywhere in THIS template would make `symbiote-pressable` resolve back to the component via its
dual selector `'Pressable, symbiote-pressable'`). `registerPressableBehavior()` is called once at
`BenchmarkScreen.ts` module scope, as a direct function call rather than a bare side-effect
import — safe under Metro's production `inlineRequires` because the binding is used as a value,
not merely imported (unlike the barrel-re-export hazard that file's own header warns about).

Engine-node count: `composed` 12/row (row anchor + 2 Pressable anchors + 9 native views),
`composed-lowered` 10/row (row anchor + 9 native views, no Pressable anchors), `flat`/`lowered`
9/row. So composed-lowered isolates EXACTLY the two Pressable anchors — a controlled pair against
`composed`, holding the row-wrapper-component and View/Text component cost constant, which
`flat`/`lowered` could not do (each also removes the row wrapper, and `lowered` removes View/Text
too — three conflated variables, not one).

Verified this session, nothing device-measured yet:
- `ngc -p tsconfig.angular.json` (real AOT, run directly, not through the `rtk` wrapper) — exit 0,
  clean, `BenchmarkRowPressableLowered` present in the compiled `build/angular/src/screens/
  BenchmarkScreen.js`.
- `adapters/angular/src/__tests__/benchmark-row-shape.test.ts` — still 3/3 green (untouched:
  the new shape isn't part of its drift fence, which only pins `composed`/`flat`).
- `examples/angular` overlaid fresh (`node scripts/overlay-local-packages.mjs examples/angular`)
  after confirming the installed `@symbiote-native/components` build was stale
  (`registerPressableBehavior` absent — `^0.5.0` registry pin, function added to core long after).

Why this pair matters at all, not just as a diagnostic nicety: krausest's own web numbers
(`angular-cf-signals` 1.60x vanilla, `angular-cf` 1.64x, both ~1.4x Vue there) put Angular's
inherent framework overhead in the same league as Vue/Svelte/Solid — nothing like the 2.2-2.6x this
project's `flat` row showed against stock. So "Angular is just a slow framework" does not explain
the native gap; `composed` vs `composed-lowered` is what actually isolates how much of it is
Pressable-instantiation-shaped, as opposed to something still unaccounted for.

```
§22_composed_lowered_built := {
  what_it_is: "ROW_SHAPE.ComposedLowered, BenchmarkRowPressableLowered — composed's row/View/Text
           unchanged, only <Pressable> -> <symbiote-pressable> + registerPressableBehavior()",
  node_count: "composed 12/row, composed-lowered 10/row, flat/lowered 9/row — isolates exactly the
           2 Pressable anchors, unlike flat/lowered which also drop the row wrapper (and, for
           lowered, View/Text)",
  mechanism: "core/components/src/behaviors/pressable.ts's registerPressableBehavior — an
           ENGINE-NODE behavior keyed on tag 'symbiote-pressable', already used by Vue/Svelte/
           Solid's lowering transforms. Angular never called it; nothing in it is
           framework-specific. Not a new mechanism — a missing registration",
  verified: "ngc clean (exit 0, real AOT build, run directly not via rtk), component present in
           build/, benchmark-row-shape.test.ts still 3/3 (drift fence untouched)",
  not_yet_done: "no device sample. Next step per architect: composed and composed-lowered each
           sampled TWICE on one binary/one sitting (duration + ENGINE PER STEP + FABRIC CALLS),
           same discipline as VERDICT_SCOPE_2026_08_30 above",
  do_not_confuse_with_lowered: "composed-lowered is still a hand-written ceiling probe, same
           caveat as `lowered` in §20 — no shipped Angular babel-lowering transform exists. Read
           the composed-vs-composed-lowered DELTA; do not read composed-lowered against stock or
           another adapter's column",
}
```

## §23. §22's first cut was SILENTLY BROKEN — two real Angular-renderer bugs, found by a headless probe before any device time was spent (2026-08-31)

§22 shipped `<symbiote-pressable>` as a bare tag, on the assumption it was the same trick as
View/Text's dual-selector workaround. `ngc` built it clean and the existing drift-fence test stayed
green — and it was non-functional. Found by writing a throwaway headless probe (mount, serialize the
committed Fabric tree, print it) BEFORE spending any device time, per `systematic-debugging` — never
trust a device number off code nobody has watched commit a real tree.

**Bug 1 — `symbiote-pressable` is unconditionally in `ANCHOR_HOST_COMPONENTS`.** It is one spelling
of the real composed Pressable's own dual selector (`'Pressable, symbiote-pressable'`), and
`isAnchorHostComponent` checks the bare TAG STRING with zero awareness of which template's `imports`
actually matched it — unlike Angular's own directive resolution (which IS template-scoped), this
check lives in the ADAPTER and is global. So writing `<symbiote-pressable>` — imports or not — always
resolves to a non-painting anchor: `createAnchor()` bypasses `attachHostBehavior` entirely, so there
is no Fabric view AND no press machine. The probe showed it directly: the label `Text` that should
sit inside a Pressable's wrapping `RCTView` was a DIRECT CHILD of the row instead — the wrapper had
silently vanished.

**Bug 2 — Angular's renderer never passed the intrinsic tag to the engine.** `core/engine/src/
node.ts`'s `createElement(component, isText, tag = component)` needs the ORIGINAL tag as its third
argument so `attachHostBehavior` can look it up (the registry is keyed by tag, the node only ever
carries the resolved Fabric name). `adapters/angular/src/renderer/index.ts` called
`createElement(descriptor.component, descriptor.isText)` — two arguments, so `tag` defaulted to
`'RCTView'`, never `'symbiote-pressable'`. Vue's renderer already passes this correctly
(`createElement(descriptor.component, descriptor.isText, type)`). This means
`registerPressableBehavior()` could NEVER have attached through Angular's renderer, for ANY tag —
independent of bug 1, and exactly the risk `test-harness-false-greens.md` §11 already named
("registry keyed by intrinsic tag, node is not") without confirming it as a live bug in shipped code.

**Both fixed.** `adapters/angular/src/renderer/index.ts` now passes `engineName` as the third
argument generically (benefits any future Angular host-behavior use, not just this one), and exports
a small diagnostic-only constant `DIAGNOSTIC_LOWERED_PRESSABLE_TAG` (`'symbiote-pressable-lowered-
diagnostic'`) that resolves through the SAME `'symbiote-pressable'` descriptor/behavior tag while
never matching `ANCHOR_HOST_COMPONENTS`. `BenchmarkRowPressableLowered` now writes that tag, not the
real intrinsic one — checked against the adapter's own export at module load in BenchmarkScreen.ts
(`if (DIAGNOSTIC_LOWERED_PRESSABLE_TAG !== ADAPTER_DIAGNOSTIC_LOWERED_PRESSABLE_TAG) throw`) so the
two literals can never silently drift (ngc needs a static string in a template, so it cannot be the
imported binding directly).

Re-probed after the fix: the wrapping `RCTView` is back, byte-identical prop-key count to a bare
`(press)` view (10 total keys for a 1-row/1-Pressable tree, vs composed's 15) — **the press machine
itself adds ZERO prop keys**, confirming `press`/`pressIn`/`pressOut`/etc. are pure JS-side listener
registration (not in `GATED_EVENT_PROPS`), same fact `fabric-boolean-event-gates.md` already
established for the base case. The entire composed-vs-lowered delta in this minimal probe (15 vs
10 = 5, or 15 vs 11 = 4 depending which arm) turned out to be `EAGERLY_FORWARDED_GATES` — the four
accessibility events (`onAccessibilityAction/Tap/MagicTap/Escape`) Angular's composed `Pressable`
component template binds UNCONDITIONALLY (already documented Angular-only debt, `fabric-boolean-
event-gates.md`) — NOT anything about hitSlop/disabled/responder-negotiation/etc. This means
architect's proposed acceptance bar ("prop keys must read 32001, not 26001") is not testing what it
was assumed to test: none of hitSlop/disabled/android_ripple/etc. are actually SET anywhere in this
benchmark row (composed's own usage is `class="flex1" (press)="..."`, nothing else), on ANY adapter,
so the 32001-vs-26001 gap was never about "full Pressable feature set present or absent" — it was
already resolved as such in §21, and this session's probe additionally pins the MECHANISM (the eager
accessibility forwarding) rather than leaving it a named-but-unverified hypothesis.

```
§23_composed_lowered_bugs_found_and_fixed := {
  bug_1: "symbiote-pressable unconditionally in ANCHOR_HOST_COMPONENTS (adapters/angular/src/
         anchor-host-registry.ts) — a bare <symbiote-pressable> ALWAYS becomes a non-painting
         anchor regardless of a template's `imports`, unlike View/Text's template-scoped dual
         selector. createAnchor() bypasses attachHostBehavior entirely, so no Fabric view AND no
         press machine. ngc clean, every existing test green — found only by a headless probe
         printing the committed tree and noticing the wrapper was missing",
  bug_2: "Angular's SymbioteRenderer.createElement never passed the intrinsic tag to the engine's
         createElement(component, isText, tag) — only 2 args, so attachHostBehavior always
         resolved the WRONG key (the Fabric name, e.g. 'RCTView', never the registered tag).
         Vue's renderer already does this correctly. Independent of bug 1: this means
         registerPressableBehavior() could never attach through Angular's renderer at all,
         for any tag, until fixed",
  fix: "renderer/index.ts passes `engineName` generically now (general fix, not scoped to
         Pressable); DIAGNOSTIC_LOWERED_PRESSABLE_TAG exported from the adapter barrel, resolves
         to the same descriptor+behavior without matching ANCHOR_HOST_COMPONENTS.
         BenchmarkRowPressableLowered uses that constant, not the real intrinsic tag, with a
         module-load equality check against the adapter's own export guarding drift",
  verified: "ngc clean (exit 0), 227/227 adapters/angular/src tests green including the drift
         fence, re-probed headlessly: wrapping RCTView is back, prop keys match a bare (press)
         view exactly (behavior adds zero prop keys, same fact as GATED_EVENT_PROPS elsewhere)",
  prop_key_gap_mechanism_now_pinned: "composed's extra keys vs bare/lowered are EXACTLY the 4
         EAGERLY_FORWARDED_GATES accessibility flags (fabric-boolean-event-gates.md) — Angular's
         composed Pressable component's own template binds them unconditionally. Nothing about
         hitSlop/disabled/android_ripple/etc, since none of those are set anywhere in this
         benchmark row on any adapter. §21's '32001 vs 26001 = Pressable's prop surface' framing
         was a correct verdict on a not-fully-enumerated mechanism; this pins the mechanism",
  method_note: "found by writing a THROWAWAY headless probe (mount + serialize committed tree)
         BEFORE any device time was spent verifying the shipped composed-lowered row — per
         systematic-debugging, never trust a device number off a mechanism nobody has watched
         commit a real tree. Deleted after reading, per this project's own throwaway-probe
         convention (angular-adapter-change-detection's own §19 lview-lowering-probe did the same)",
  still_not_yet_done: "no device sample — still pending composed x2 / composed-lowered x2 per
         architect's stated priority, NOW against a row that actually works",
}
```

## §24. The gate arithmetic was wrong by exactly 2/row — it's 8, not 6, and `composed` is ALSO not comparable (2026-08-31)

Architect caught it before any device time was spent: `4 gates x 2 Pressables/row = 8`, not the
`6/row` §21/§23 quoted from the original 26001-vs-32001 observation. Six against eight means the
mechanism was either incomplete or the gates don't fire on both Pressables identically — worth
resolving exactly, not waving off, because until the number closes there is no way to know what
else might differ.

Measured directly (few/many differencing, `benchmark-row-shape.test.ts`'s own method, real
2-Pressable-per-row `BenchmarkRow`, registering ALL SEVEN of that file's own CSS rules — an
incomplete rule set undercounts every arm identically but does not move the delta, checked by
running the comparison twice with two different rule sets and getting the same +8 both times):

```
flat              9 nodes/row   18 keys/row
composed-lowered  10 nodes/row  18 keys/row   (anchor adds a node, zero keys — confirms §23)
composed          12 nodes/row  26 keys/row   = 18 + 8, not 18 + 6
key-name diff     composed has EXACTLY 4 keys flat/composed-lowered lack: onAccessibilityAction,
                  onAccessibilityEscape, onAccessibilityTap, onMagicTap. composed-lowered has ZERO
                  keys composed lacks — a clean subset, not a partial overlap.
```

So the mechanism WAS complete — §21/§23's "6/row" was simply a rough estimate off the original
26001-vs-32001 total (a division, never a per-key enumeration), and this session's per-key name
diff is the first time it was actually verified rather than estimated. 8 is correct; 6 was wrong.

**The consequence is the one architect named, and it is more serious than the arithmetic itself.**
The verified per-row delta (+8, mechanism-only, independent of how much CSS a rule carries) lets the
1000-row total be predicted from the already-established `flat`/`lowered` baseline of 26001:
`composed = 26001 + 8*1000 = 34001` — not 32001. This is a PREDICTION from a verified per-row rate,
not yet a literal 1000-row headless/device count (this project's own convention is few/many
differencing rather than a literal 1000-row JIT mount, per `benchmark-row-shape.test.ts`), but it is
backed by two independent measurements of the same +8, so it should be trusted over the untested
32001 assumption unless a real 1000-row count contradicts it.

**If 34001 holds, Angular's `composed` reaches its total by a DIFFERENT MECHANISM than Vue/Svelte/
Solid/React's 32001** — theirs from whatever their real Pressable's own legitimate prop surface
contributes (still not enumerated by name for another adapter — a real open question, since none of
hitSlop/disabled/android_ripple/etc. are SET anywhere in this benchmark row on ANY adapter, so
32001 is not "the full feature set" either), Angular's from four eager accessibility-gate keys that
are pure debt with no equivalent bug on the other four adapters. Two different totals arriving from
two unrelated causes is not comparability — it would be a coincidence, and 34001 ≠ 32001 says it
isn't even that.

**So as of this session: NONE of Angular's four row shapes may be read against another adapter's
column.** `flat`/`lowered` are short their own baseline (26001, missing whatever legitimate props
give the other adapters their 32001 — unidentified). `composed`/`composed-lowered` are `flat`'s
26001 plus either +8000 (composed, eager-gate debt) or +0 (composed-lowered, clean) — neither lands
on 32001 either. The `EAGERLY_FORWARDED_GATES` fix (making composed's Pressable template bind those
four events conditionally, matching every other adapter's Pressable) is a real, separate piece of
work this leaves on the table, not something this session did.

```
§24_gate_arithmetic_corrected := {
  was: "6/row (§21/§23), an estimate from dividing the original 26001-vs-32001 total, never a
         per-key enumeration",
  is: "8/row, verified by key-NAME diff (not just count) on the real 2-Pressable BenchmarkRow,
         reproduced with two different CSS rule sets registered in the test — the delta held both
         times, only the absolute per-row rate moved (14->18 with more CSS keys), confirming the
         delta is independent of how much style data is registered",
  key_names: "onAccessibilityAction, onAccessibilityEscape, onAccessibilityTap, onMagicTap — EXACTLY
         the 4 EAGERLY_FORWARDED_GATES, and composed-lowered has ZERO keys composed lacks (a clean
         subset, not a partial/approximate match)",
  consequence: "composed's real 1000-row total predicts to 26001 + 8000 = 34001, not 32001 — so
         composed is NOT comparable to another adapter's column either, for a DIFFERENT reason than
         flat/lowered (debt-driven excess vs missing-baseline-props), not by coincidence landing on
         the same number",
  still_open: "what actually makes up the other four adapters' 32001, since none of them set
         hitSlop/disabled/android_ripple/etc either — not resolved this session, flagged as a real
         gap rather than assumed to be 'the full Pressable feature set'",
  fix_not_done: "EAGERLY_FORWARDED_GATES itself (conditional accessibility-event binding on
         Pressable's own template) is real, separate, pre-existing Angular debt this session did
         not touch — only measured and named precisely",
}
```

## §25. Text defaults + `id`→`nativeID` alias fixed; the device prediction for `lowered`, locked BEFORE the run (2026-08-31)

Two real, pre-existing Angular-adapter bugs, found via Vue's real `BenchmarkRow.vue` key-name
enumeration (23 style + 6 defaults + 3 text = 32 keys/row) diffed against Angular's own numbers:

**Bug: RN's `Text` defaults were never applied to a bare `symbiote-text`.** `Text.js` applies
`ellipsizeMode ?? 'tail'` and `allowFontScaling !== false` unconditionally; the composed `TextHost`
(`adapters/angular/src/primitives/index.ts`) already folds these via its own `@Input()`s — but that
fold lives IN THE COMPONENT, so it never ran for a bare `<symbiote-text>` (`ROW_SHAPE.Lowered` /
`LoweredBenchmarkRows`). A `numberOfLines`-clamped lowered Text silently clips with no ellipsis.
Fixed in `adapters/angular/src/renderer/index.ts`, mirroring Vue's own `seedTextDefaults` /
`textDefaultFor`: `createElement` seeds both keys via `setProp` whenever `descriptor.isText`, and
`setAttribute`/`setProperty` re-seed the default when a later write clears a key back to
`undefined` (RN treats missing and explicit-undefined identically).

**Bug: `id` → `nativeID` was never aliased, on ANY path, composed or lowered.** `View.js`/`Text.js`
copy `id` into `nativeID` unconditionally (`core/components/host-primitives.cjs`'s `ID_ALIAS`);
Angular had this nowhere, so `<View id="x">` reached Fabric with an unknown `id` key and no
`nativeID` on every app, silently, device-only — OLDER than lowering and not introduced by it.
Fixed the same way, mirroring Vue's `PROP_ALIASES`: a small `aliasedPropName()` applied in
`setAttribute`/`setProperty` (removeAttribute reseeds through the same alias too). Both fixes live
in the RENDERER, not the wrapper — the wrapper only covers ONE path and looks complete for exactly
that reason (every existing test went through it).

**Verified with a break-test** (architect's ask, done before trusting the fix): commented out only
the `seedTextDefaults` call, ran `adapters/angular/src/__tests__/text-defaults.test.ts` — the third
arm (`LoweredHost`, bare `<symbiote-text>`, `TextHost` absent from `imports`) failed cleanly
(`expected undefined to be 'tail'`), the first two (real `<Text>`, independent of this fix via
`TextHost`'s own `@Input`s) stayed green. That pairing — one arm red, the other two unmoved — is
what proves the third arm actually exercises the bare path rather than silently resolving back to
the component through the dual selector. Restored, re-ran: 3/3, full suite 227/227.

**Headless per-row recount, post-fix:** `flat` = `composed-lowered` = `lowered` = 18 keys/row (all
three now agree — `flat`/`composed-lowered` were never missing the defaults, since both keep the
real `Text` component; only true `lowered`, bare `symbiote-text`, moved: 12 → 18). `composed` stays
26/row (18 + 8, the `EAGERLY_FORWARDED_GATES` debt, untouched by this fix). The earlier "24/row"
guess conflated headless units with device ones — corrected, not it.

**The device prediction, decomposed by LAYER rather than by total, locked in before any device run:**

```
                          style   defaults   text   total
device, lowered (before)    23        0        3    26001   (matches the standing 26001 figure)
device, lowered (after)     23        6        3    32001   <- PREDICTED, not yet run
Vue / Svelte / Solid        23        6        3    32001   (Vue's own real-BenchmarkRow.vue count)
```

The headless 18/row cannot be compared to this table directly — `ROW_RULES` in the test harnesses
is a simplified stand-in (2 declarations for `bench-row`, not the real stylesheet's ~10), so
headless and device are pricing DIFFERENT CSS and their totals do not line up. What DOES carry over
is the STYLE-LAYER-INDEPENDENT delta: +6/row for defaults (verified headlessly, by key name, twice),
and that is the one number this prediction rests on.

**Acceptance criterion for the device run**: 32001, achieved by the SAME per-layer decomposition Vue
reads (23 style + 6 defaults + 3 text), not merely by the total matching. If the device number lands
elsewhere, the mismatch is either a CSS difference between the two apps' compiled stylesheets or
another wrapper-only fold `lowered` still lacks — chase the layer breakdown, not just the total,
per this file's own "diff by key name, not by count" lesson from §24.

**`composed` is unaffected and still not a valid column.** Its device number should land at
26001 + 8000 = 34001 (§24), independent of this fix — the gate debt is a separate defect from the
missing Text defaults, and fixing one does not touch the other.

```
§25_text_defaults_and_id_alias_fixed := {
  bugs_fixed: [
    "Text.defaults (ellipsizeMode:'tail', allowFontScaling:true) never applied to a bare
     symbiote-text — TextHost's own @Input fold never runs off the composed path",
    "id -> nativeID alias missing on EVERY Angular path, composed or lowered — older than
     lowering, not a lowering-specific gap",
  ],
  fix_location: "adapters/angular/src/renderer/index.ts — createElement seeds Text defaults via
     setProp when descriptor.isText; setAttribute/setProperty alias 'id' and re-seed a cleared
     default via textDefaultFor. Mirrors Vue's seedTextDefaults/textDefaultFor/PROP_ALIASES
     exactly. Renderer-level, not wrapper-level, on purpose — the wrapper only ever covered one
     path and every existing test went through that one path, which is why it looked complete",
  break_test: "seedTextDefaults call commented out -> text-defaults.test.ts's third arm
     (LoweredHost) failed cleanly, first two (real Text, via TextHost's own @Input, independent
     of this fix) stayed green. Restored -> 3/3, full suite 227/227. That pairing is what proves
     the third arm exercises the bare path rather than the dual selector silently resolving back
     to the component",
  headless_recount: "flat = composed-lowered = lowered = 18/row now (flat/composed-lowered never
     moved — both keep the real Text component, which always had these defaults independently).
     Only true lowered moved, 12 -> 18. composed stays 26/row (18+8, gate debt, untouched)",
  device_prediction_LOCKED_BEFORE_RUN: "lowered: 26001 -> 32001, decomposed as 23 style + 6
     defaults(NEW) + 3 text/row, matching Vue's own real-BenchmarkRow.vue decomposition
     layer-for-layer, not merely by total. composed: 26001 + 8000 = 34001 (§24), unaffected by
     this fix and still not a valid column",
  headless_vs_device_units: "the two are NOT directly comparable — headless ROW_RULES is a
     simplified CSS stand-in (2 declarations vs the real stylesheet's ~10), so headless prices a
     different, smaller style layer. The +6/row defaults delta is the one number proven
     style-layer-independent (measured twice, two different headless rule sets, same delta both
     times) and is what the device prediction is built on",
}

## §26. A real lowering transform now exists — `babel-lower-host-primitives.cjs`, View/Text only (2026-08-31)

The `Lowered` row shape (§19) was a hand-written proof, not a shipped capability: an author had to
spell the intrinsic tag AND keep View/Text out of that template's OWN `imports`. This section
automates it — `adapters/angular/babel-lower-host-primitives.cjs`, the fifth transform alongside
Solid/Vue(x2)/Svelte, reading the same shared spec (`core/components/host-primitives.cjs`).

```
§26_transform_built := {
  seam: "SAME Babel pass as babel-register-composed.cjs, BEFORE babel-linker.cjs — Stage A
     (ngc --compilationMode partial) has already emitted ɵɵngDeclareComponent({template, deps}),
     template is a plain string and dependencies a plain array at this point",
  mechanism: "two edits on ONE metadata object: (1) template text <View> -> <symbiote-view> via
     @angular/compiler's real parseTemplate() + startSourceSpan/endSourceSpan-offset text splicing
     (never regex — a self-closing tag has start===end, no separate close span to touch);
     (2) the dependencies[] entry whose selector string contains 'View'/'Text' as a comma-separated
     token is REMOVED. (2) is not cleanup, it IS the mechanism — leaving it means 'symbiote-view'
     still resolves to the real component regardless of the text rewrite",
  schemas_finding: "VERIFIED by direct probe: CUSTOM_ELEMENTS_SCHEMA never reaches
     ɵɵngDeclareComponent's declared metadata at all — a component that DOES declare it in source
     emits NO schemas field. It is consulted only by Stage A's ngtsc type-checker against the
     ORIGINAL (unlowered) template, never by the linker. So an ORDINARY app component needs ZERO
     schemas/CUSTOM_ELEMENTS_SCHEMA change to become lowerable — unlike LoweredBenchmarkRows, which
     types <symbiote-view> directly in SOURCE and needs it for ngtsc's sake only",
  refusal: "ONE category applies to View/Text (observesState unset, so no style/child-shape
     categories reach them at all): #ref (instance-bound-directive). #ref on the WRAPPED component
     yields the ViewHost/TextHost INSTANCE (nativeElement getter, style @Input); on a lowered bare
     tag (no directive match) Angular's default hands back the raw engine node DIRECTLY instead —
     a DIFFERENT surface, so this refuses UNIVERSALLY (Vue's width, not Solid's narrower one, for
     an Angular-specific reason: unlike Solid's View/Text, ours does not forward the identical node
     either way). ALL-OR-NOTHING per tag name per template: one #ref'd <View> keeps EVERY <View> in
     that template as the component, since dependencies' selector string covers the whole template
     at once",
  angular_grammar_finding: "VERIFIED: Angular template expressions have NO arrow-function syntax —
     parseTemplate throws a real parser error on `[style]=\"({pressed}) => ({...})\"`. Two of the
     shared fixture table's 14 rows (specialisable-state-style, nested-function-state-style) are
     therefore not merely unsupported here, they are UNWRITABLE in Angular at all — marked
     it.skip with the parser error attached, not silently omitted",
  scope_deferred: "Pressable and TextInput are NOT in LOWERABLE_NAMES — real, named blockers, not
     silently-thinner coverage. Pressable's anchor-registry collision (this paragraph's original
     text) is RESOLVED — see §27; the transform-support blockers below (observesState-family
     refusals) are still open. TextInput: needs intrinsicWhen
     (multiline selects symbiote-text-input vs -multiline, two DIFFERENT native views) wired
     through the same rewrite path, refusing on a non-literal selector prop
     (REFUSAL_CATEGORIES.dynamicIntrinsicChoice) — not implemented",
  verification: "no device run (none available this session). Strongest proof short of one: a real
     ngc-compiled snippet (verified against an actual throwaway compile before writing tests by
     hand) run through this plugin then through the REAL babel-linker.cjs produces genuine
     ɵɵdomElementStart('symbiote-view', ...) with NO dependencies field at all, against
     ɵɵelementStart('View', ...) + dependencies:[View,Text] for the un-lowered control — pinned in
     babel-lower-host-primitives.test.ts, break-tested (disabling the dependencies-removal step
     flips both the linker assertion and the runner's control test red). Whole-app dry run over
     examples/angular's real compiled output (32 components, no example-specific tuning): 494 View
     + 948 Text instances lowered, ZERO crashes",
  domElementStart_nuance: "whether a lowered tag reaches ɵɵdomElementStart (truly bare, zero
     directive overhead) or still compiles to ɵɵelementStart depends on whether ANY OTHER directive
     (not View/Text) still matches the same element — e.g. [symbioteHostProps] on a PRIMITIVE's own
     internal template keeps ɵɵelementStart correctly, since that directive genuinely still needs a
     slot. This is orthogonal to and unaffected by this transform (it only ever touches View/Text's
     OWN dependency entry). Verified directly: a plain app-shaped <View [class]=\"expr\"> (no other
     directive) DOES reach ɵɵdomElementStart + ɵɵclassMap, matching BenchmarkRow's own pattern
     exactly — the perf case this transform exists for",
  fixture_runner: "lowering-parity.test.ts answers the shared table using Pressable as the default
     component (matching every other adapter's convention) — so on THIS adapter almost every
     'lower' row correctly reads 'refuse' (Pressable unsupported), which is the EXPECTED shape per
     adapter-parity-audit.md ('a red row is a question about which side is wrong, never a verdict
     on the transform'). A separate control describe block lowers View/Text on the identical
     harness to prove the refuse readings are not an inert/broken instrument
     (lowering-fixtures.cjs's own 'a refuse row is unproven until a control goes the other way')",
  not_yet_wired: "NOT added to examples/angular/babel.config.js — a production build-pipeline
     change with no device confirmation available this session. Package subpath
     '@symbiote-native/angular/babel-lower-host-primitives' exported and in files[], ready to wire",
}
```
```

## §27. Pressable's anchor-registry collision resolved — dropped the vestigial dual selector, not a `-managed` split (2026-08-31)

```
§27_pressable_anchor_fix := {
  what_was_wrong: "composed Pressable's own @Component selector was 'Pressable, symbiote-pressable'
     (components/pressable/index.ts). The alternate spelling forced bare 'symbiote-pressable' into
     ANCHOR_HOST_COMPONENTS unconditionally (anchor-host-registry.ts), colliding with that SAME
     string's other, load-bearing meaning: the host-behavior registry's tag
     (PRESSABLE_TAG, core/components/src/behaviors/pressable.ts). A bare <symbiote-pressable> tag
     therefore always resolved to a non-painting anchor, never the real engine node — the exact
     bug DIAGNOSTIC_LOWERED_PRESSABLE_TAG (§22-23) worked around rather than fixed",
  what_changed_instead: "NOT the TextInput '-managed' technique (that was the ORIGINAL plan, §26's
     scope_deferred, and it was wrong for this case — see next field). Fix: dropped the dual
     selector entirely. Pressable's selector is now just 'Pressable' (single string, matching
     TextInput's own 'TextInput' — text-input.ts:169). 'symbiote-pressable' removed from
     ANCHOR_HOST_COMPONENTS. DIAGNOSTIC_LOWERED_PRESSABLE_TAG deleted: the const, its renderer
     createElement branch, and its barrel export (adapters/angular/src/index.ts).
     BenchmarkRowPressableLowered now writes the real <symbiote-pressable> tag directly",
  why_not_managed: "TextInput's wrapper genuinely RENDERED the bare tag internally in its own
     template (its @if/@else branches emitted <symbiote-text-input>/-multiline literally), so
     freeing the bare name for the engine's registerTextInputBehavior required giving the WRAPPER
     a new spelling to render instead (-managed) — the bare tag had a real, in-use claimant.
     Pressable's wrapper NEVER rendered symbiote-pressable anywhere in its own template (it renders
     symbiote-view) — the alternate selector spelling was PURELY a selector-matching convenience,
     unused by the component itself and (verified by a repo-wide grep before touching anything)
     unused by any app/example code either. A vestige with a real claimant needs a rename
     (TextInput); a vestige with NO claimant just needs deleting (Pressable). Read `verify-the-
     deciding-side.md`'s 'before following a precedent, read what MAKES it one' — the precedent
     (TextInput's -managed split) was made by the wrapper's OWN usage, a fact that does not
     transfer just because both primitives are dual-selector tier-2 components",
  verification: "real `ngc -p tsconfig.angular.json` build (rm -rf build first): compiled
     ɵɵngDeclareComponent reads `selector: \"Pressable\"` — single string, no comma, confirming the
     dual spelling is gone from what the linker actually resolves against, not just from source
     text. adapters/angular full suite: 259/259 green + 1 pre-existing unrelated flake
     (flat-list-array-style.test.ts, passes in isolation — see verify-the-deciding-side.md on not
     conflating a shared-tree flake with a regression from an unrelated change)",
  scope: "removes the anchor-registry collision only — does NOT add Pressable to LOWERABLE_NAMES.
     A real babel-transform Pressable lowering still needs the observesState-family refusals
     (REFUSAL_CATEGORIES.stateInTemplate / renderPropChild / instanceBoundDirective) implemented
     and a lowering-parity.test.ts runner update before it can lower Pressable for real — this
     session only cleared the prerequisite §26 named, it did not do that follow-on work",
  not_yet_synced: "examples/angular's INSTALLED @symbiote-native/angular copy still carries the OLD
     anchor-registry + dual selector (this is a source-only change in adapters/angular/src, not
     re-packed/reinstalled into the example — deliberately: the user was mid-device-measurement
     across all six examples when this landed, per example-shared-package-staleness.md's own
     'before running any packaging step, check whether a peer is measuring that example'). Until
     re-packed, BenchmarkRowPressableLowered's edited template (now writing bare
     <symbiote-pressable> directly) will hit the OLD anchor behavior in that example — re-pack +
     reinstall (no pod install needed, no native surface touched) before trusting that row on
     device",
}
```
```
