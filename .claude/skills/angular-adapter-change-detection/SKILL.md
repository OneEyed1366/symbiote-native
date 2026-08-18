---
name: angular-adapter-change-detection
description: "Symbiote Angular adapter change detection — read BEFORE debugging why a component renders but does not REPAINT after a flat-bag onX/responder/PanResponder mutation, before touching SymbioteHostPropsDirective or render.ts's CD wiring, or before assuming ApplicationRef.tick() fixes a whole-tree rebuild on press. Covers: whenCommitted async-commit gotcha (from Vue); SignalView vs CheckAlways (Angular 20 @Component views are SignalView, so a flat-bag onX mutation dirties nothing — fix is markForCheck(), NOT detectChanges()); zoneless scheduling + ApplicationRef.tick() (unreachable pre-fix, missing INJECTOR_SCOPE:'root', Targeted vs Global mode); a hypothesis DISPROVED: Targeted mode does NOT stop a press re-running the root template (markViewDirty walks RefreshView|Dirty to root); protected (@Component) vs not (@if/@for); AND (§13/§14) why a `[style]`/`[class]` binding is the ONE binding name that writes the input without dirtying the child — Angular's styling instruction hands off to setDirectiveInputsWhichShadowsStyling and skips markDirtyIfOnPush — with the two fix shapes (SymbioteStyleInputDirective for a real `style` input; an anchorStyle signal polled in ngDoCheck for class= / for Button, which has no style input) and the ReactiveStyle canary screen. Trigger: 'renders but doesn't repaint', 'class toggled after mount does nothing', 'style frozen at creation', 'rebuild whole tree on press', markForCheck vs detectChanges, NG0201/ApplicationRef failures, template literals losing referential stability."
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

| what changed | reaches the component as | fix |
| --- | --- | --- |
| `[style]` where a `style` @Input exists | an input write with no dirty mark | `SymbioteStyleInputDirective` |
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
