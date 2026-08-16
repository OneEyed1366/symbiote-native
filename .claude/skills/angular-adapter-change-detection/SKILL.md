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

The bug (device-confirmed on iOS): the responder/PanResponder demo (`examples/angular/components/
ResponderDemo.ts`) and `ParityDemo` (`onLongPress`/`onPress`) rendered but were dead — "pan does
nothing", the `{{ status }}` text never changed — while the SAME demo repainted fine on React and
Vue. The gesture logic ran (the engine logged `responder granted`, the callback mutated
`this.status`); only the template never repainted (`setValue` for `{{ status }}` never fired,
`commit reconciled changed=false`).

**Root cause — Angular 20 compiles a component as a `SignalView`, NOT `CheckAlways`.**
`getInitialLViewFlagsFromDef` (`.vendors/angular/.../view/construction.ts`): `signals → SignalView;
onPush → Dirty; else → CheckAlways`. In v20 plain `@Component`s carry `def.signals`, so their LView
is `SignalView`. In `detectChangesInView` a view is refreshed only when
`(Global && CheckAlways) || (Global && Dirty) || RefreshView || (its reactive consumer is dirty)`.
A SignalView is none of those on a plain-property mutation, so a root `detectChanges()` **does not
descend into it**. React/Vue never hit this: React's `setState` and Vue's proxy `.value =` are the
notification; a SymbioteNative flat-bag `onX` callback is invoked DIRECTLY by the engine's event dispatch
(`callOwnListener`/`bubble` in `core/engine/src/events/index.ts`), entirely outside Angular, so it
dirties nothing. `(event)="…"` template bindings escape the bug because Angular compiles them through
its own `ɵɵlistener` wrapper which calls `markForCheck`; `[symbioteHostProps]`/flat-bag `onX` props do
not. Only components whose state is mutated via a flat-bag callback are affected — hence responder /
`onLongPress`, not the Buttons' `(press)`.

**The fix — `SymbioteHostPropsDirective` wraps every `onX` function prop to call `this.cdr.markForCheck()`
after the handler runs** (`adapters/angular/src/primitives/shared.ts`). The directive is declared IN its
host component's template, so its injected `ChangeDetectorRef` is that component's view detector.
`markForCheck` → `markViewDirty` which (when NOT already inside a CD pass) sets `RefreshView | Dirty` on
the view **and every ancestor up to the root**, and calls `changeDetectionScheduler.notify()` — our own
scheduler. `RefreshView` is the one flag that survives the Targeted descent a root tick uses for
un-dirtied intermediate views, so the next root `detectChanges()` reaches and repaints the mutated
component. This is the exact Angular twin of what React/Vue get for free.

### Landmines proven the hard way (don't repeat them)

- **`detectChanges()` in the directive does NOT work; `markForCheck()` does.** `createViewRef`
  (`.vendors/angular/.../change_detector_ref.ts`): a component-host tNode → `new ViewRef(componentView,
  componentView)`; a plain ELEMENT tNode (what a directive sits on) → `new ViewRef(hostComponentView,
  lView)`. `ViewRef.detectChanges()` acts on `_lView` (wrong view for the element case), but
  `markForCheck()` acts on `_cdRefInjectingView` (= the host component). So a directive must use
  `markForCheck`, not `detectChanges`.
- **`ApplicationRef.tick()` is unavailable** — `injector.get(ApplicationRef, null)` is `null` in this
  DOM-less `createEnvironmentInjector(null-parent)` bootstrap (§2 of the main `angular-adapter` skill),
  by design. And it would not help: it also refreshes only dirty/CheckAlways views.
- **A root-level `setEventDispatcher(run => { run(); scheduler.notify() })` wrap does NOT fix it** (an
  earlier attempt). It pings the scheduler, but the scheduler's root `detectChanges()` still can't
  descend into a SignalView child — and it fires `detectChanges` on every native event incl. every
  scroll frame (needless churn). Removed. `markForCheck` already notifies the scheduler itself.
- wolf-tui's Angular adapter uses the SAME `componentRef.changeDetectorRef.detectChanges()` scheduler
  and does not hit this only because its reactive state is SIGNAL-driven (setInterval → signal), which
  dirties the SignalView's consumer. Plain-property state is what exposes the gap.

Also in `render.ts`: the root tick resolves each root's OWN-view detector via
`cmpRef.injector.get(ChangeDetectorRef)` (not `ComponentRef.changeDetectorRef`, the host/wrapper view,
which paints once but never re-descends into the component). Regressions:
`adapters/angular/src/__tests__/responder-change-detection.test.ts` (flat root) and
`responder-nested-cd.test.ts` (App→child nesting, the device-faithful shape) — fire real touch
primitives over the fake Fabric slot (`fabric.fireEvent`) and assert `{{ status }}` walks
idle→granted→moving→released in the COMMITTED tree (use `findCommitted`, not `fabric.find`:
clone-on-write puts prop updates only in `committed`, never in `created`). A composed child a test
mounts must register its selector via `registerComposedComponent(selector)` (exported from
`renderer.ts`) or createElement paints RN's "Unimplemented component" fallback.

## §3. Change detection now runs on real `ApplicationRef.tick()`, not a hand-rolled scheduler — but that does NOT stop a press from re-running the root's own template (2026-07)

**Trigger for this investigation**: after fixing 3 Android-only bugs in a row on the same new
demo section (content-wrapping crash → `nestedScrollEnabled` default → unstable
`[animatedProps]` literal causing native-handler churn on EVERY press anywhere), the user asked
"we rebuild the whole tree on any sneeze, that's nonsense — investigate properly." This section
is that investigation's conclusion, including a claim that looked right, got implemented, and
was then DISPROVED by a test before it shipped — keep both the fix and the correction, they are
both durable lessons.

### Root cause, confirmed by reading vendored Angular source, not guessed

`render.ts`'s old `SymbioteChangeDetectionScheduler.notify()` called `rootView.detectChanges();
cmpView.detectChanges();` on EVERY tick, unconditionally, regardless of what triggered it.
`ChangeDetectorRef.detectChanges()` (`view_ref.ts`) calls `detectChangesInternal(lView)` with
**no mode argument**, and `detectChangesInternal`'s default parameter
(`render3/instructions/change_detection.ts`) is `mode = ChangeDetectionMode.Global` — which
refreshes `CheckAlways`-flagged content unconditionally, not just `RefreshView`-flagged content.
By contrast Angular's own `ApplicationRef.tick()` → `synchronize()` → `synchronizeOnce()`
(`application/application_ref.ts`) computes `useGlobalCheck = Boolean(dirtyFlags &
ApplicationRefDirtyFlags.ViewTreeGlobal)` — and for a **zoneless** app, plain `tick()` never sets
that flag (`if (!this.zonelessEnabled) { dirtyFlags |= ViewTreeGlobal }`), so real zoneless
`ApplicationRef.tick()` runs `ChangeDetectionMode.Targeted` — "only refresh views with the
`RefreshView` flag or a dirty signal consumer."

### Why `ApplicationRef` wasn't reachable before, and the actual one-line fix

`render.ts` bootstraps via `createEnvironmentInjector(providers, null)`. Every `createEnvironmentInjector`
call — including the one inside `internalCreateApplication()`/`bootstrapApplication()` itself —
builds an `R3Injector` with `scopes = new Set(['environment'])`
(`render3/ng_module_ref.ts`, `EnvironmentNgModuleRefAdapter`), **never** `'root'`. Angular's DI
only resolves a `providedIn:'root'` token (`ApplicationRef` included) in an injector whose
`this.scopes.has('root')` is true (`r3_injector.ts`, `injectableDefInScope`) — a null parent, a
real `platformCore()`, even a full `StaticInjector`-based platform injector: NONE of these add
`'root'` to OUR injector's own scope set, so `injector.get(ApplicationRef)` threw `NG0201` no
matter what parent was tried (confirmed empirically — `platformCore()` as parent did NOT help).
The actual mechanism, found by reading `platform-browser/src/browser.ts`:
`BROWSER_MODULE_PROVIDERS` includes `{ provide: INJECTOR_SCOPE, useValue: 'root' }` **as one of
its own app-level providers** — `R3Injector`'s constructor reads `INJECTOR_SCOPE` off its own
provider list and self-tags `this.scopes.add('root')`. So the fix is one provider line, no
`PlatformRef` needed, no DOM needed:

```ts
{ provide: ɵINJECTOR_SCOPE as INJECTOR_SCOPE, useValue: 'root' },
...ɵprovideZonelessChangeDetectionInternal(),  // the real ChangeDetectionSchedulerImpl + NoopNgZone + ZONELESS_ENABLED:true
```

then `injector.get(ApplicationRef)`, `appRef.attachView(cmpRef.hostView)` (+`rootRef.hostView`
for the wrapper-component path), and `appRef.tick()` for first paint. This **replaced** the
whole hand-rolled `SymbioteChangeDetectionScheduler` class (queueMicrotask + reentrancy guards)
— Angular's own `ChangeDetectionSchedulerImpl` already does exactly that, self-scheduling off
`ApplicationRef.afterTick`. All 676 tests green, `ngc` AOT build green, no other file needed to
change. `EffectScheduler`'s concrete impl (`ZoneAwareEffectScheduler`) is genuinely NOT exported
anywhere (checked the installed package's public `.d.ts`), so a naive attempt at this fix looks
like it requires forking that ~50-line private class — it does NOT, because
`ɵprovideZonelessChangeDetectionInternal()` only needs `ApplicationRef` itself to be reachable
(via the scope fix above) and provides `NgZone`/`ZONELESS_ENABLED`/the scheduler token itself;
`ApplicationRef`'s OTHER `providedIn:'root'` dependencies (`EffectScheduler`,
`AfterRenderManager`, `PendingTasksInternal`, `INTERNAL_APPLICATION_ERROR_HANDLER`) resolve fine
via their OWN `providedIn:'root'` factories the moment the injector is scope-tagged 'root' too —
no manual wiring needed for any of them.

### The claim that got disproved before shipping — read this before assuming Targeted mode fixes "press re-renders everything"

The first hypothesis was "`ApplicationRef.tick()` in Targeted mode means the root's own template
no longer re-runs on an unrelated press." A regression test was written to prove it (nested child
press → assert the root's own template-level render counter does NOT increment) — it FAILED even
against the new, fixed scheduler. Tracing why (all in `render3/instructions/mark_view_dirty.ts`
and the directive's own already-correct comment in `primitives/shared.ts`): **both** a native
`(event)="handler()"` binding (via `wrapListenerIn_markDirtyAndPreventDefault` → `markViewDirty`)
**and** `ChangeDetectorRef.markForCheck()` (its entire body is `markViewDirty(this._lView,
NotificationSource.MarkForCheck)` — see `view_ref.ts`) walk `LViewFlags.RefreshView | Dirty`
**unconditionally onto every ancestor up to the root**:

```ts
// mark_view_dirty.ts — markViewDirty
while (lView) {
  lView[FLAGS] |= dirtyBitsToUse;   // RefreshView | Dirty, not the weaker HasChildViewsToRefresh
  lView = getLViewParent(lView)!;
  // ... until isRootView(lView) && !parent
}
```

This is universal, unavoidable Angular zoneless behavior — true in every Angular app, signals or
not, `ApplicationRef` or hand-rolled scheduler, and it is exactly why `SymbioteHostPropsDirective`
already has its own correct comment about `markForCheck()` reaching "THIS component's view AND
all its ancestors." **`ApplicationRef.tick()`'s Targeted mode changes NOTHING about this** — it
only changes the OUTER decision of "which top-level *attached* view do we even enter"
(`ApplicationRef._views`, relevant across multiple independently-`attachView()`'d roots) and
whether refreshing a view also force-checks `CheckAlways` content that ISN'T actually dirty.
**Once any view decides to refresh at all, `refreshView()` (`change_detection.ts`) hardcodes
`ChangeDetectionMode.Global` for its OWN embedded views (`@if`/`@for`, always `CheckAlways`,
never independently gated) and child components** — so a press or `markForCheck()` ANYWHERE
always re-runs the ROOT's own template, full stop, regardless of scheduler.

### What genuinely IS protected, with or without this fix

A real `@Component` boundary. A plain (non-`OnPush`) child compiles as `SignalView` in Angular
20+ (not `CheckAlways`), so `detectChangesInView`'s `shouldRefreshView` gate (`flags &
CheckAlways` in Global mode, or `flags & RefreshView`/dirty-consumer regardless of mode)
correctly skips an untouched **sibling child component** even when its parent's template
re-executes around it — proven by `render.test.ts`'s `'does not re-check a sibling child
component...'` test, which passes identically whether the scheduler is the old hand-rolled one
or the new `ApplicationRef`-based one. **An `@if`/`@for` block does NOT get this protection** —
embedded views are always `CheckAlways`, always re-execute when their containing view refreshes,
with no per-view gate at all. So: decomposing a monolithic template's demo/feature sections into
genuine child `@Component`s (matching the existing `AnimatedDemo`/`ResponderDemo` precedent) is
what actually limits blast radius for unrelated presses — `@if`-wrapping content in place does
nothing for this, and neither does replacing the scheduler.

### The concrete, durable takeaway — put together, not sequentially

1. A press anywhere ALWAYS re-runs the pressed component's OWN view and every ancestor's own
   template, all the way to root. This cannot be avoided in Angular's zoneless model; do not
   attempt to "fix" it again.
2. Therefore: an inline object/array/function literal written directly in ANY component's
   template (root or not) is re-evaluated (and gets a fresh reference) on every tick that
   refreshes THAT component — mirror the `AnimatedParityDemo` precedent (`[animatedProps]`
   bound to a stable class-field reference) for every prop that flows through a change-detecting
   equality check, not just Animated ones.
3. A SIBLING `@Component` with no dirty descendant of its own IS properly skipped — this is why
   decomposing a monolithic template into real components (not `@if`/`@for` blocks) is the
   actual lever for keeping an unrelated press cheap, and it already worked before this fix.
4. The `ApplicationRef` swap is still worth keeping — it deletes a hand-rolled CD driver in
   favor of Angular's own (less bespoke code, matches how the whole ecosystem works, and now
   exposes real `ApplicationRef` capabilities — `isStable`/`whenStable()`/`afterTick` — that
   were previously just unavailable). Its concrete benefit is narrower than originally hoped:
   properly-scoped ticking for dirtiness that does NOT originate from a native event listener or
   `markForCheck()` (e.g. multiple independently-`attachView()`'d surfaces not cross-triggering
   each other, or future code that adopts genuine Angular signals). Do not oversell it as "fixes
   the tree rebuild" in any future write-up — verify with a test first, the way this one was
   caught before shipping.

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
skill's §2/§3 before treating them as list-specific.

A native `(event)=` binding already triggers CD correctly via Angular's own `ɵɵlistener` — see
**`angular-adapter-events`** for the event-surface conventions (every component event as
`@Output()`, the scroll-family exception); this skill explains specifically why a flat-bag `onX`
prop does NOT get the same treatment and what closes that gap.

## §4. `ngAfterViewInit` fires ONCE — a native wire-up gated on an `@Input` must also run from `ngOnChanges` (2026-08-16)

Device-reported: Angular sticky headers rendered in exactly the right place, with the right
z-index, and never moved. The native scroll-value attach (`attachSticky()`,
`components/scroll-view/shared.ts`) ran only from `ngAfterViewInit` and returns early while
`stickyHeaderIndices` is still empty. That input is an ordinary `@Input`, so it arrives after the
first CD pass in any app deriving it from data instead of writing a literal in the template —
and `ngAfterViewInit` never runs again, so the attach was never retried. The scroll offset never
reached the AnimatedValue; every interpolation sat at its resting value.

**Why it reads as "broken feature" rather than "feature off":** the projection half self-heals.
The wrapper is still created around the right child with the right z-index, so the header LOOKS
enabled. Nothing logs, nothing throws.

**Why only Angular.** React, Vue and Svelte all re-run the same attach from a reactive effect keyed
on the same condition (Svelte's `$effect` in `scroll-view/index.svelte`, React's `useEffect` deps,
Vue's watcher), so a late input self-heals. Angular's one-shot lifecycle hook has no equivalent.
This is the general shape, not a sticky-header quirk: **any native/imperative wire-up whose
precondition is an `@Input` needs `ngOnChanges` too.**

**Then make it idempotent.** Driving it from `ngOnChanges` means it runs on EVERY input change, so
an unguarded version detaches and rebinds the native event constantly. Record the inputs the
current attach was made for and return when none changed — and record them even when the host node
is not resolved yet, so the next call (which will see a real node) still reads as a change.

Regression: `components/scroll-view/sticky-native-attach.test.ts` — a control case with indices
present from the start, and the real one where they arrive later. The observable is
`addAnimatedEventToView` call count off a fake native module, not the committed tree: the tree
looks correct in BOTH cases, which is the whole trap.

## §5. `markForCheck()` and a signal write cost DIFFERENT amounts — and at scroll frequency the difference is the whole screen (2026-08)

Device symptom: the Angular canary's JS thread fell to ~30fps while scrolling, worst on the
sticky SectionList section. Same screen on the other adapters: Svelte no drop at all, Vue ~1
frame, React ~2 frames. So it is not the sticky implementation and not the engine — it is how
Angular is told that something changed.

**The two notification paths are not equivalent, and the difference is in the FLAGS they set on
ancestors** (both in `.vendors/angular/packages/core/src/render3`):

```
markForCheck()  -> markViewDirty (instructions/mark_view_dirty.ts)
                   RefreshView | Dirty on EVERY ancestor, walking to the root, no early exit
                   -> each of those views re-runs its OWN template

signal.set()    -> markAncestorsForTraversal (util/view_utils.ts)
                   only HasChildViewsToRefresh, and it BREAKS as soon as it hits an ancestor
                   that already has the flag
                   -> ancestors are TRAVERSED, not re-executed; only the view that READS the
                      signal refreshes
```

Angular's own zoneless guide lists both as valid triggers without distinguishing their cost
(`markForCheck`, `ComponentRef.setInput`, template-read signal updates, bound listeners), which
is why this is easy to get wrong: the docs frame them as interchangeable notifications.

**Why our adapter hits it.** `SymbioteHostPropsDirective.wrapCallback` follows EVERY flat-bag
`onX` prop with `markForCheck()` — the §2 fix, and correct for a press. But `onScroll` is an
`onX` prop too and arrives at up to 60Hz, so every scroll frame re-runs the whole ancestor screen
template, `@for` blocks included (embedded views are always CheckAlways, no per-view gate — §3).
The cost therefore scales with SCREEN size, not list size, which is exactly why the largest
section felt worst.

Measured, not inferred — `adapters/angular/src/__tests__/scroll-change-detection-cost.test.ts`,
10 scroll events fired through the fake Fabric slot at a host inside a child component:

```
handler in child, markForCheck path   ancestor screen template  10   @for rows  50
same burst, no listener bound         ancestor screen template   0   @for rows   0   <- control
child updates a signal instead        ancestor screen template   0   @for rows   0
                                      child's own template      10
```

The control row is what makes this causal rather than correlational: a mounted tree does not tick
on its own, so the 10 re-runs are the callback wrap and nothing else. Keep it — without it the
other numbers prove nothing.

**The fix direction this points at:** scroll-derived state in our own scroll consumers
(`VirtualizedList` windowing, the ScrollView JS sticky fallback) becomes signals read in the
template, and the directive stops blanket-wrapping the high-frequency scroll family. Do NOT
simply delete the wrap for the scroll family without giving those components a notification of
their own — that re-opens the §2 "pan does nothing" class of bug, just for lists.

Do not reach for `NgZone.runOutsideAngular()` here: this bootstrap is zoneless (`NoopNgZone`), so
it is a no-op. The zoneless answer to "high-frequency event that must not repaint the world" is
signals, not zone escape.

## §6. The signals migration is blocked by the TEST pipeline, not by the components — measured pilot, 2026-08

`computed()` is the right answer to §5's per-pass cost, and a pilot on `ScrollView` confirmed the
size of the win before anything shipped. It also hit a wall that is invisible until you try it, so
read this before starting the conversion again.

**The win is real.** `prop-bag-stability.test.ts` fires 10 scroll events at a ScrollView whose
inputs never change and counts runs of the `symbioteHostProps` SETTER — Angular runs it exactly
when its binding check decided the bound value changed, and each run pushes every key through
`renderer.setProperty` -> the engine's prop routing -> a Fabric clone check.

```
getter    (baseline)   20 re-pushes / 10 frames   <- two host bindings per frame, both rebuilt
computed  (pilot)      10 re-pushes / 10 frames   <- contentProps stopped rebuilding entirely
```

Caveat on that 10, stated because it would otherwise be overclaiming: it was measured in a run
where the converted inputs were silently unbound (see below), so it proves the MEMOISATION works,
not that a fully-wired signal ScrollView costs exactly 10.

The same file also records good news that narrows where optimising pays at all: an unrelated
press costs a ScrollView **zero** re-pushes. A real `@Component` boundary with unchanged inputs
holds (§3). Only the component whose OWN view gets dirtied — the one the scroll callback lives in
— pays. So this is a scroll-path problem, not a whole-screen one.

**Blocker 1 — `inputs: [...]` and `input()` are mutually exclusive.** Listing a signal input in
the array form makes Angular treat it as a plain property and ASSIGN the bound value over the
`InputSignal` field. The next read throws `TypeError: this.contentContainerStyle is not a
function`. A component migrating to signal inputs must DELETE those names from its
`*_INPUTS` array, not keep both.

**Blocker 2 — the JIT compiler cannot see `input()` at all, and our unit suite is JIT.** Probed
directly on the compiled defs:

```
vitest (JIT)   ScrollViewBase.ɵdir.inputs = 0 entries; contentContainerStyle absent
               concrete ScrollView.ɵcmp.inputs = 79  (exactly the array, nothing inherited)
ngc  (AOT)     base def declares contentContainerStyle; the partial declaration of the
               concrete component carries usesInheritance: true
```

`input()` fields are discovered by ngtsc reading the field initializers; JIT only reads decorator
metadata, so it records nothing. The SHIPPED build is therefore fine — and the test suite goes
BLIND: `[contentContainerStyle]="…"` matches no input, `CUSTOM_ELEMENTS_SCHEMA` suppresses the
would-be error, and the binding is silently dropped. It surfaced as two unrelated style tests
reading `padding: undefined`. A migration done without noticing this would ship components whose
props are untested rather than broken, which is worse.

**But the AOT pipeline turned out NOT to be required — read §7 before paying for it.**

The pilot was reverted — the components are back on plain fields and getters, with a measured note
left on `ScrollView.contentProps`. The two measurement files stay: `prop-bag-stability.test.ts`
pins the baseline so the win is re-measurable, and `__tests__/scroll-change-detection-cost.test.ts`
pins §5's numbers.


## §7. You do not need AOT to get the signals win: `signal()`/`computed()` are runtime, only `input()` needs the compiler

The asymmetry §6 missed, confirmed in the vendored source: `signal()` and `computed()` are plain
functions in `core/src/render3/reactivity/` with zero compiler involvement. Only the signal-based
DECLARATIONS - `input()`, `output()`, `viewChild()`, `model()` - need ngtsc, because the compiler
has to register them in the directive def, and the decorator `inputs` metadata has no field to
express it (`{name, alias, required, transform}` and nothing else, `metadata/directives.ts:181`).

So keep `@Input` as a plain field, bridge it into the reactive graph by hand, and memoize:

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

Measured on `ScrollView.contentProps` with the same probe as §6:

```
getter                              20 re-pushes / 10 frames
computed + real signal inputs       10   but 2 unrelated style tests went red (JIT blindness)
computed + ngOnChanges bridge       10   and all 162 adapter tests stay green
```

Identical win, no new dependency, no lost coverage. `@analogjs/vite-plugin-angular` would also
have pulled in `@angular/build` (an Angular CLI package this repo does not otherwise have) purely
to run tests.

**The one hazard, and it is sharp.** Plain fields read inside the computed are UNTRACKED, so
correctness rests entirely on the revision bump covering every way a dependency can change. That
holds for @Inputs (Angular always routes them through `ngOnChanges`) and NOT for internal mutable
state - `viewportHeight`, `lastContentSize`, anything a callback assigns. A bag that reads such
state must have that state be its own `signal()`, not lean on `inputsRevision`. Widening the
revision bump to "bump on everything" would silently un-memoize the bag instead.

Remaining work on ScrollView: `scrollProps` is still a getter and still re-pushes once per scroll
frame. `prop-bag-stability.test.ts` pins that number, so it reaches 0 when that bag is memoized
too - and it reads internal state, so it needs the signal-per-state treatment above, not another
revision bump.

## §8. The callback wrapper must be memoized per handler, or nothing upstream can ever be memoized

`SymbioteHostPropsDirective.wrapCallback` used to allocate a FRESH closure for every `onX` key on
every push of the props bag. Measured with a renderer-level probe
(`primitives/host-props-wrapper-stability.test.ts`), five grant/release cycles on one component:

```
fresh closure per push   11 distinct wrappers for ONE unchanged handler
memoized per handler      1
```

The allocation is the small half. The load-bearing half is reference stability: the wrapper is
what actually reaches the engine, so a fresh function on every push makes the pushed bag
permanently unequal to its predecessor by reference. No upstream memoization (§7) can conclude
"nothing changed" about a bag that contains a callback prop while this is true - which makes this
a PREREQUISITE for the computed() work, not an independent micro-optimisation.

Cache in a `WeakMap` keyed by the ORIGINAL handler, per directive instance. The handler alone is a
complete key: the wrapper body closes over nothing else that varies (`key` is read only by the
`ON_PREFIX` guard before wrapping, and `cdr` is fixed per instance). Do not key by `key` as well -
the same handler bound to two props would then get two wrappers for no reason.

Both halves need a test, and the second one is easy to write vacuously: a "different handler gets
its own wrapper" assertion passes with NO memoization at all if the run only contains two pushes.
Drive enough pushes that an un-memoized run produces visibly more wrappers than pushes-with-swap,
and verify the test actually goes red with the cache lookup removed.

Driving those pushes needs a full grant/release cycle per iteration: the responder stays granted
after a `topTouchStart`, so repeated touchStart alone re-enters `onResponderGrant` exactly once
and the loop silently drives a single change-detection pass.

While here: `wrapCallback` also carried an `as` cast to give `Function` a call signature. Use
`Reflect.apply(value, undefined, args)` instead - it preserves the previous unbound call and needs
no cast.

## §9. The anchor-class style is a THIRD kind of dependency, and it defeats the §7 bridge

§7 splits a memoized bag's dependencies into "@Input (covered by an `ngOnChanges` revision bump)"
and "internal mutable state (needs its own signal)". That split is incomplete, and the missing
third kind bit three components at once during the 2026-08 memoization sweep.

**`anchorHostStyle(this.elementRef)` is neither.** A composed component is created as a
non-painting ANCHOR host, so `class="..."` / `[class.x]` / `[ngClass]` written at its USE SITE
resolves through the renderer's `addClass`/`removeClass` onto that anchor - Angular offers no
`@Input` interception for `class` the way it does for `[style]`. The value therefore:

- never appears in `SimpleChanges`, so `ngOnChanges` never fires for it,
- is not assigned by any code in the component, so there is no write site to convert to a signal,
- and is documented in `primitives/shared.ts` as "must be re-read on every check".

A getter satisfied that requirement by construction: it WAS re-read every pass. A `computed()`
keyed only on `inputsRevision` strands it - toggle a class at the use site and the memoized bag
never notices. Silent staleness, exactly the failure mode §7 warns about, arriving through a door
§7 did not name.

**Remedy: a second bump site in `ngDoCheck`,** which runs at precisely the cadence the getter used
to be re-read. Bump only on a real identity change of the anchor style, never unconditionally -
an unconditional bump re-invalidates the computed every pass and throws away the entire win.
Existing precedents for that dedup shape: `stableAnchorStyle`'s shallow-equal guard in
`primitives/shared.ts`, and `lastRecompute` in `virtualized-list/index.ts`.

The result is strictly better than the getter it replaces: a class toggled after mount now
repaints on the spot instead of waiting for some unrelated refresh of that view.

Reference implementation and regression: `components/safe-area-view/index.ts` and its
`safe-area-view.test.ts` case "picks up a class toggled after mount, with no @Input change" -
verified to fail with the `ngDoCheck` bump removed. Verify that way rather than assuming; a
memoization test that never toggles a class passes whether or not this hazard is handled.

**Bags that do NOT read the anchor style need none of this.** `VirtualizedList.foldedAccessibility`
is 34 accessibility @Inputs and a pure function, so the plain §7 bridge is sufficient there.
Classify per bag; do not apply the ngDoCheck bump by reflex.

### Bags that resist memoization entirely, and should stay getters

- `keyboard-avoiding-view` - `inset` and `initialHeight` are assigned from Keyboard events and
  `handleLayout`. Convertible, but only by making both their own signals first.
- `text-input` - `value` is assigned by `writeValue()` and `editable` by `setDisabledState()`;
  `@angular/forms` bypasses `ngOnChanges` entirely. Memoizing is also pointless here: the bag must
  change on every keystroke.

### Why `ngDoCheck` is the correct hook for the anchor poll (verified in Angular's source)

Not a guess - three properties line up, and all three are load-bearing:

- `render3/hooks.ts` `callHooks` runs pre-order hooks "until that node index EXCLUSIVE", so a
  node's hooks flush at the next `ɵɵadvance` past it (or in `refreshView`'s post-template flush).
  That is strictly AFTER the parent's `ɵɵclassProp` wrote the class onto the element, and strictly
  BEFORE the component's own view refreshes - exactly the window the poll needs.
- `callHooks` calls `setActiveConsumer(null)`, so a signal write inside `ngDoCheck` registers no
  dependency on the calling view and cannot throw NG0600 ("writing to signals is not allowed in a
  computed").
- The engine's `commitClassStyle` allocates a fresh `[classStyle, explicitStyle]` array only on
  passes where a class token actually moved, so `signal.set`'s own `Object.is` check turns an
  unchanged poll into a no-op that dirties nothing. No change-detection loop.

Keep the `ngOnChanges` revision bump as well - the two hooks cover DIFFERENT dependencies (inputs
vs the anchor style), not the same one twice.

## §10. Pre-existing, unfixed: `TouchableHighlight`'s dynamic style never reaches Pressable

Found while memoizing the press family, and it predates that work - recording it so it is not
rediscovered as a memoization regression.

`touchable/index.ts` hands Pressable a STABLE arrow `[style]="pressedStyle"` that reads
TouchableHighlight's own anchor style and inputs live. A structural replica (OnPush child, stable
arrow input, plain getter bag) shows the child never re-reads its getter when only the parent
changes - so on the UN-MEMOIZED baseline Pressable's view is not refreshed either, and
TouchableHighlight's dynamic `[style]` / `class` was already stale before any of this.

Memoization neither caused it nor fixes it.

FIXED 2026-08 for TouchableHighlight and TouchableWithoutFeedback, plus AnimatedComponentBase.
`pressedStyle` became a `computed` that RETURNS A NEW ARROW when its dependencies move, so the
input binding reports an ordinary change; both Touchables and `AnimatedComponentBase` also got the
§9 `ngDoCheck` anchor poll, since nothing dirties their view when the anchor's class changes.
Regressions: `touchable.test.ts` "a Touchable class toggled after mount" and
`modules/animated/animated-anchor-class.test.ts`, both verified to fail with the fix removed.

Note the alternative that would have "worked" and was rejected: reading the anchor signal from
INSIDE the stable arrow. It happens to function, by registering TouchableHighlight's signal on
Pressable's consumer - a cross-component dependency nobody would expect to find. Returning a new
reference keeps the dependency in an ordinary input change.

STILL BROKEN: TouchableOpacity. Its chain is one hop longer - own anchor -> `animatedStyle` ->
AnimatedView's `style` @Input -> AnimatedView's own anchor and `reducedProps` -> committed leaf.
Established by probe, not inference: TouchableOpacity's `ngDoCheck` runs, its anchor DOES receive
the toggled class, and `animatedStyle` DOES re-run and return it - yet the committed leaf keeps
only `{opacity: 1}`. A second change-detection pass does not help (a lost update, not a one-pass
lag), and with the class present from the START it lands correctly, so the merge itself is sound.
The loss is between AnimatedView's `style` input and its committed leaf. The reproduction is kept
as a skipped case in `touchable.test.ts`; start there.

## §11. A prop-bag getter with a SIDE EFFECT becomes a bug the moment you memoize it

Found while converting `ScrollView.scrollProps` (2026-08). The getter did not only build a bag - it
also called `updateProjectionController()`, i.e. the sticky-header projection was reconciled as a
side effect of "reading the props", once per change-detection pass.

That is already questionable, but it is INVISIBLE while the thing is a getter, because a getter is
re-read every pass and the side effect therefore fires at a convenient cadence by accident. Memoize
the same code and the side effect fires only when the memo misses - which is exactly the passes
where it was least needed, and never on the ones where it was.

So when converting a getter to `computed()`, read the whole body for effects, not just for
dependencies. If one is there, it does not move into the computed and it does not stay behind an
`ngDoCheck` "just in case" either: give it precise triggers, one per dependency that can change.
For the projection controller those turned out to be `ngOnChanges` (sticky inputs),
`handleInvertedStickyLayout` (guarded on a real `viewportHeight` change), `ngAfterViewInit`
(post content-node bind), and `ngAfterContentChecked` (guarded on `hasProjectedRefreshControl`
flipping). Deliberately NOT an unguarded per-check hook: `reconcileStickyRecords` copies the record
array and walks node children, so running it on every press would add cost to the very path the
memoization exists to protect.

Related: state read ONLY by such an effect does not need to become a signal. `viewportHeight` and
`lastContentSize` are read by `updateProjectionController` and `handleContentLayout` and by no
computed, so they stayed plain fields - converting them would have been ceremony with no reader.

## §12. A projected child's inputs are NOT covered by the host's revision bump

`iosRefreshControlProps` / `androidRefreshControlProps` on ScrollView look like ordinary bags, and
they are the one pair in that file that must STAY getters.

Every field in them comes from the projected `<RefreshControl>`'s own `@Input`s (`refreshing`,
`tintColor`, `colors`, the folded accessibility set). Those route through THAT component's
`ngOnChanges` - the host ScrollView's `inputsRevision` never moves when they change. Memoizing
would freeze `refreshing` at its first value and strand the native spinner permanently.

The general rule: a §7 revision bridge covers the inputs of the component that OWNS the bump, and
nothing else. Reading a `@ContentChild`'s or `@ViewChild`'s inputs inside a memoized bag needs a
revision signal on THAT child, exposed to the parent - which is a cross-component design step, not
a local refactor.

## Measured outcome of the 2026-08 memoization sweep

```
ScrollView.contentProps + scrollProps   2 re-pushes/scroll frame -> 0
VirtualizedList.foldedAccessibility     20 rebuilds/refresh      -> 1 (cached)
host-props callback wrappers            11 wrappers/5 cycles     -> 1
```

Left as getters on purpose, each for a reason recorded above: the refresh-control pair (§12),
`keyboard-avoiding-view` and `text-input` (§9), and every single-read getter - a `computed` buys
nothing at one read per refresh and only adds a staleness surface.

## §13. THE BIG ONE: a `[style]` / `[class]` binding writes the input but never dirties the child (2026-08)

Found while chasing TouchableOpacity's frozen style. It is not a TouchableOpacity bug and not a
Touchable bug - it reproduces on a bare OnPush child with a single `@Input`.

**First framing was too broad, and the correction matters.** Ordinary inputs propagate fine
everywhere - `[testID]`, `[title]`, `[data]`, `[animating]`, `[sections]`, `[source]`, `[value]`
were each measured (mount, change one binding, diff the committed Fabric tree) and each re-ran the
child's template. The frozen axis is exactly the binding NAMES `style` and `class` - which is where
Symbiote's whole styling surface sits, because every composed component declares a real `style`
@Input to keep RN StyleProp arrays away from Angular's CSS style engine.

Traced with a probe in each participant, one change-detection pass per line:

```
pass 1   parent.template style={margin:1}   ->  child.bag style={margin:1}
pass 2   parent.template style={margin:2}   ->  (child.bag NEVER runs)
```

So the parent DOES refresh, the input IS written, the child's `ngOnChanges` / `ngDoCheck` DO fire
and see the new value - and the child's TEMPLATE never re-executes. Anything the child derives in
a getter or a template expression is therefore frozen at creation.

This is Angular-adapter-specific, verified against the other adapters rather than assumed:
`adapters/react/src/components/touchable/touchable-style-updates.test.tsx` and
`adapters/vue/src/components/touchable-style-updates.test.ts` do the same thing (mount, change the
style, assert the committed node) and both pass.

**Why it is consistent with everything else that works.** `setInputsForProperty` ends in
`markDirtyIfOnPush`, which sets ONLY `LViewFlags.Dirty` (`instructions/shared.ts`). Per
`detectChangesInView` (`instructions/change_detection.ts`), `Dirty` is honored ONLY in
`ChangeDetectionMode.Global`, whereas `RefreshView` and a dirty reactive consumer are honored in
any mode. `markForCheck()` sets `RefreshView`, and a signal write dirties the consumer - which is
exactly why every fix in §7-§12 works and plain input propagation does not.

**The mechanism, once found.** Neither candidate was right: the parent DOES call
`detectChangesInChildComponents(..., ChangeDetectionMode.Global)`, and the child IS in
`tView.components` - proven by a control sibling bound to `[other]` instead of `[style]`, same
parent, same pass, same value, refreshing fine. The child is entered in `Global` mode carrying
`Dirty`, `RefreshView` and `CheckAlways` all unset, because it was never marked at all:

```
[foo]    -> ɵɵproperty -> setPropertyAndInputs -> isComponentHost(tNode) && markDirtyIfOnPush(...)
[style]  -> the STYLING instruction -> sees a directive input of the same name
         -> setDirectiveInputsWhichShadowsStyling   (instructions/property.ts:58-67)
            = write the input, and stop.  No markDirtyIfOnPush.
```

Confirmed in the installed `@angular/core` 22.0.8 bundle, not just the vendored source. This is
genuine upstream Angular behaviour, so there is no bootstrap-level or wiring-level fix - `Global`
mode does not help when the view is neither dirty nor `CheckAlways`.

**Blast radius, measured per component.** 15 components were frozen on at least one axis, several
on only ONE of the two (`VirtualizedList` tracked `[style]` but not `class`; `AnimatedView` and
`TouchableWithoutFeedback` the other way round) - so any check that binds both at once will read a
frozen component as healthy. Immune were the ones already carrying the §7 `inputsRevision` +
`computed` bridge (Pressable, ScrollView, Switch, Image, Modal, RefreshControl, SafeAreaView,
InputAccessoryView, TouchableHighlight, TouchableNativeFeedback) - a signal write dirties the
template consumer, which is honoured in any mode.

It was invisible on device: no example app in any adapter binds a CHANGING class or style to an
affected component, and `TouchableOpacity` was not used at all. `examples/angular`'s ReactiveStyle
screen (§14) exists so that stays true by construction rather than by luck.

## §14. The fix for §13, its ONE exception, and the canary that keeps it honest (2026-08)

**The fix.** `SymbioteStyleInputDirective` (`primitives/shared.ts`): one directive whose entire
body is `ngOnChanges -> markForCheck()`, attached through
`hostDirectives: [{ directive: SymbioteStyleInputDirective, inputs: ['style'] }]` on every composed
component that declares a `style` input. It is precisely the `markDirtyIfOnPush` the styling
instruction skipped - inside a refresh, `markViewDirty` needs only the `Dirty` bit. The 15 primitive
hosts are deliberately excluded: they push style straight through `Renderer2` in `ngOnChanges` and
need no template re-run.

Discrimination check, run both ways: with the `markForCheck()` body removed, `PASS 177 / FAIL 2`
(`render/input-propagation.test.ts` and touchable's previously-skipped `toggle-opacity`, which the
fix un-skipped) and nothing else; restored, all green.

**The one component the fix cannot reach: `Button`.** RN's Button has no `style` prop, so ours
declares no `style` @Input - and a `hostDirectives` entry has nothing to hang off. Its `class=`
still resolves onto its anchor and still went nowhere. Button therefore keeps the OTHER shape: an
`anchorStyle` signal polled in `ngDoCheck` (the `AnimatedComponentBase` precedent). Verified red
before / green after in `components/button.test.ts`.

So the two shapes are not alternatives, they are for different causes:

| what changed | reaches the component as | fix |
| --- | --- | --- |
| `[style]` where a `style` @Input exists | an input write with no dirty mark | `SymbioteStyleInputDirective` |
| `class=` / `[class.x]` / `[ngClass]`, or `[style]` with no `style` input | renderer addClass/removeClass onto the anchor, never an input | `anchorStyle` signal polled in `ngDoCheck` |

A NEW composed component needs whichever row applies to it, and a plain getter over
`anchorStyleProp(...)` is the bug both rows exist to prevent.

**The canary: `examples/angular` -> Menu -> "Reactive style".** One toggle over a grid of 64px
tiles, one tile per component, `class=` and `[style]` as SEPARATE rows (a single tile carrying both
would flip on its live axis and read as healthy). Pass is the whole grid turning from red to blue on
one tap; fail is a checkerboard, and each stranded tile is captioned with the component to fix.
Pressable / TouchableHighlight / ScrollView are the controls - if they do not flip, the screen
itself is dead and nothing else it shows means anything. Ordinary inputs are deliberately absent:
they propagate correctly, so a tile driven by one would only dilute the signal.

### §14a. The `class` half, found by the canary rather than by a test (2026-08)

The ReactiveStyle screen paid for itself on its first run: the `[style]` row flipped 15/15, and the
`class` row left EIGHT tiles stranded — TextInput, ActivityIndicator, ImageBackground,
KeyboardAvoidingView, FlatList, SectionList, VirtualizedList, VirtualizedSectionList. Exactly the
set §13's audit predicted, including VirtualizedList's one-axis asymmetry. Nothing headless had
caught it, because §14's fix hangs off `ngOnChanges` and a class toggle produces none.

**Fix, one file for most of them:** the `ngDoCheck` poll now lives in `SymbioteStyleInputDirective`
itself (compare the anchor's style, `markForCheck()` on change), so every component already
carrying that directive got the class axis for free — no new registration anywhere. The dedup gate
is load-bearing: marking unconditionally re-dirties the view every tick and free-runs CD.

**Two needed more than a refresh**, because they do not READ the anchor inside a getter:

- `FlatList` recomputed `resolvedStyle` in `ngOnChanges` — which never runs for a bare class
  toggle. Moved to `ngDoCheck`. Its old comment shows the trap well: the author had already removed
  a `changes['style']` guard "so a bare class= is not skipped", not noticing the whole hook was
  skipped.
- `VirtualizedList`'s `ngDoCheck` dedup gate listed every input but not the anchor, so no entry
  ever moved on a class toggle and the recompute was skipped forever. Added
  `anchorHostStyle(this.elementRef)` to `recomputeInputs`.

Regression: `src/__tests__/anchor-class-tracking.test.ts`, one case per consumption shape
(inline `anchorHostStyle`, style-array fold, `stableAnchorStyle` + gate). Verified: poll body
removed -> 5 fail, restored -> 184 pass.

**Two harness traps this test hit, worth knowing before writing the next one:**

- The class-derived style does not reliably land on the node carrying `testID`, and NOT reliably
  below it either — ImageBackground and FlatList commit it onto the wrapper CONTAINING their testID
  node. A subtree-only search reads a working component as broken. Search outward: node, subtree,
  then ancestors nearest-first.
- Under JIT, mounting `SectionList` or `VirtualizedSectionList` alongside `VirtualizedList` throws
  `Can't construct a query for the property "listHeaderDir"` (module-init order leaves the queried
  directive undefined); `KeyboardAvoidingView` needs a native event hub the headless harness has
  not installed. Both are harness limits, not product bugs — cover those components in their own
  files, which already work around it.

**Open, found in passing:** `FlatList`'s own `[testID]` never reaches the committed tree (not
forwarded to the inner VirtualizedList/ScrollView). Headless-observed only; `examples/angular`'s
`angular-chips-list` selector suggests device behaviour may differ. Not yet investigated.

## §15. The scroll-frame cost: two independent markForCheck sources, both per-frame (2026-08)

Device symptom: the Angular canary scrolls at ~37fps, worst in the sticky section, while React
drops ~2 frames, Vue ~1 and Svelte none. The 2026-08 memoization sweep did NOT move it, and the
reason is worth keeping: the sweep cut the cost of each change-detection pass (stable prop bags, no
re-push to the renderer, no re-commit to Fabric) and left the NUMBER of passes untouched.

Why sticky is worst is not a mystery once you look: with sticky headers RN pins
`scrollEventThrottle` to 1 (`STICKY_NATIVE_SCROLL_THROTTLE` in `core/components/src/view/
render-scroll-view.ts`, matching ScrollView.js), versus 16 elsewhere - so JS receives ~16x more
scroll events there. The throttle is RN's own value and is not the thing to change; what mattered
is that each event cost a full ancestor-screen template execution.

**Two paths marked, independently, on every frame:**

1. `SymbioteHostPropsDirective.wrapCallback` wraps EVERY `onX` prop with `markForCheck()`, scroll
   included - and `markForCheck` walks `RefreshView|Dirty` to the root (§3). Fixed by excluding the
   one per-frame callback (`PER_FRAME_CALLBACK = 'onScroll'`). The drag/momentum begin/end family
   stays wrapped: once per gesture is not a hot path, and a handler there mutating plain state is
   ordinary code. Nothing lost its refresh - VirtualizedList marks itself (below), sticky rides the
   native driver, and a caller's own handler is typically an `Animated.event` touching no Angular
   state (the canary's is exactly that).
2. `VirtualizedList.dispatch` marked whenever the reducer reported `changed`, and the shared reducer
   returns `changed: true` for EVERY scroll offset - correctly, since the offset feeds end-reached
   distance, viewability and the batch-fill timer, all of which run as effects. But none of those
   are what the TEMPLATE reads; it reads the window. Now gated on a render signature
   (`first|last|count|total`), so a frame that moves no cell marks nothing. The shared reducer was
   deliberately NOT changed - its `changed` flag is right for what it means, and editing it would
   reach React and Vue for an Angular-only problem.

Measured, `components/virtualized-list/scroll-cost.test.ts` (10 frames over a screen with 5 `@for`
rows): screen template re-runs **10 -> 1**, `@for` row re-runs **50 -> 5**. The remaining 1 is the
first frame genuinely moving the window, which is when the screen SHOULD pay.
`__tests__/scroll-change-detection-cost.test.ts` flipped from asserting the defect (10 / 50) to
asserting 0 / 0 for a frame that changes nothing; its "handler still called" assertion is what
separates "stopped wasting work" from "stopped delivering the event", and the responder tests
remain the discriminator proving non-scroll `onX` props still mark.

**Device result: 60fps, dipping to 59 - level with Vue** (was ~37, sticky section, iPhone 17 sim).
So the two gates above were the whole gap; the signal refactor below was NOT needed and should not
be undertaken speculatively. Re-measure before reaching for it.

**Not fixed by this, and the next lever IF a future screen needs it:** a frame that DOES move the
window still re-runs the whole ancestor chain, because `markForCheck` has no "dirty only me" mode.
Only a signal write does - and a signal write reaches Angular through `markAncestorsForTraversal`
(§5), which flags ancestors `HasChildViewsToRefresh` without re-executing them. Moving
VirtualizedList's template-bound state (`windowCells` and friends) onto `computed()`s driven by a
`renderVersion` signal is that step. Note it is NOT a small edit: those fields are assembled in
`recomputeView()` from `ngDoCheck`, and `ngDoCheck` only runs when an ancestor refreshes - so the
derivation has to move INTO the computeds for the targeted path to work at all.

### §15a. Measured: the anchor poll is free, do NOT replace it with a push (2026-08)

§14a put an `ngDoCheck` anchor poll on ~24 composed components, and the obvious follow-up question
is whether that per-pass work is worth replacing with a push from the renderer (`commitClassStyle`
writing a signal, so nothing polls at all). Architecturally nicer. Measured first, and the answer
is no.

Counted with a scratch counter in the directive's `ngDoCheck`, on a screen carrying five
directive-bearing components (Pressable, SafeAreaView, TextInput, ImageBackground,
VirtualizedList) plus a real VirtualizedList:

```
mount                          7 polls
10-frame scroll burst          6 polls    -> 0.6 per frame
one full screen refresh        5 polls    -> one per directive-bearing component
```

The poll rides on template execution: `ngDoCheck` only runs when an ancestor actually refreshes.
Since §15 cut scroll frames from "refresh the whole screen" to "refresh nothing unless the window
moved", the poll count collapsed with it - the 6 polls across ten frames are the ONE frame that
genuinely moved the window (a useful cross-check that §15's 10 -> 1 is real). Each poll is one
property read plus `Object.is`.

So: no push refactor, no signal migration for this. If a future screen ever refreshes on every
frame again, this number moves with it - re-measure then rather than assuming.
