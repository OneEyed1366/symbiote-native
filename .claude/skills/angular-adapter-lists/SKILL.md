---
name: angular-adapter-lists
description: "Symbiote Angular adapter — FlatList/SectionList/VirtualizedList/VirtualizedSectionList/ScrollView bugs. Read BEFORE touching adapters/angular/src/components/{flat-list,section-list,virtualized-list,virtualized-section-list,scroll-view}/** or debugging blank list cells, cells outside the ScrollView (horizontal FlatList painting as a full vertical stack), an infinite CD loop/freeze once cells render, an unwanted RefreshControl (SCROLL-MULTI), or 2+ ng-content declarations projecting into only ONE. Covers: (1) bare ng-content passthrough breaking @ContentChild across a second re-projection hop (VListOutletDirective, asItem cast helper); (2) an ngDoCheck rebuilding a child's context unconditionally — a real infinite loop, fixed via a dependency-snapshot guard; (3) (event)=\"x.emit($event)\" forwarding poisoning .observed (refreshRequested fix) — real cause of a freeze first misattributed to bug 2; (4) ng-content duplicated across @if/@else, fixed on iOS (one host tag) and Android (one shared ng-template + outlet)."
---

# Symbiote Angular adapter — list family (FlatList/SectionList/VirtualizedList/VirtualizedSectionList) and ScrollView content-projection bugs

`FlatList`, `SectionList`, `VirtualizedList`, `VirtualizedSectionList`, and `ScrollView`
are the single densest bug-report cluster in the Angular adapter. All of it traces back
to two **different flavors of the same symptom family** — "list cells look empty" or
"list cells land in the wrong place" — with two genuinely distinct root causes, plus one
change-detection bug and one event-forwarding bug that were mistaken for each other on
a real device. Do not assume a blank-cells or misplaced-cells report is "the §12 bug" or
"the §18 bug" without checking which one actually applies:

- **`@ContentChild` across a second `<ng-content>` re-projection hop** (Bug 1 below) —
  a WRAPPER component (`FlatList`, `SectionList`) passes the app's own projected content
  straight through to an INNER component (`VirtualizedList`, `VirtualizedSectionList`)
  via a bare `<ng-content></ng-content>`, and the inner component's `@ContentChild` never
  sees it. Symptom: cells render as **empty wrapper views** — no exception, just blank
  rows.
- **Literal duplicate `<ng-content>` DECLARATIONS inside one component's own template**
  (the ScrollView bug below) — a single component (`ScrollView`) declares `<ng-content>`
  more than once in its own compiled template (once per `@if`/`@else` branch, or once per
  outlet), and Angular only ever projects into the LAST one declared, regardless of which
  branch is structurally active. Symptom: cells render **outside the scroll container
  entirely** — structurally misplaced, not empty.

Both were real on-device symptoms (a screenshot of blank lists, then a full app freeze;
later, a horizontal `FlatList` painting as a full-width vertical stack) that no amount of
`tsc -b` / `ngc` / pre-existing `vitest run` caught, because `FlatList`, `SectionList`,
`VirtualizedList`, and `VirtualizedSectionList` had **zero vitest coverage at all** before
this cluster of investigations — the whole family was verified only by type-checking,
which proves the surface compiles, not that it renders. `flat-list.test.ts` (`mount()` +
`installFabric()`, asserting on `fabric.created` node `testID`s / `RCTRawText` content
after `mount()` + a couple of microtask ticks — exactly like `pressable.test.ts`) is the
reference pattern for testing this family going forward.

## When to use this skill

Read this BEFORE:

- Touching `adapters/angular/src/components/{flat-list,section-list,virtualized-list,
  virtualized-section-list,scroll-view}/**`.
- Debugging a list that renders blank/empty cells with no thrown error.
- Debugging cells that render structurally outside their container (siblings of
  `RCTScrollView` instead of children of `RCTScrollContentView`).
- Debugging an infinite change-detection loop, a list-related app freeze, or RAM growth
  that starts the moment list cells begin rendering.
- Debugging a `RefreshControl` / `PullToRefreshView` that appears on a list with no
  `(refresh)` binding anywhere in the app's own code, or a `SCROLL-MULTI` diagnostic in
  the engine's `commit.ts` log on a `ScrollView` that shouldn't have two children.
- Adding a new component with a similar wrapper-forwards-to-inner-component shape, or a
  template with more than one `<ng-content>` occurrence (conditional or not).

## Bug 1 — bare `<ng-content>` passthrough breaks `@ContentChild` across a second re-projection hop

```
§bug1_contentchild_reprojection := {
  bug: "FlatList's single-column path + SectionList (pure forwarder) did
        <VirtualizedList><ng-content></ng-content></VirtualizedList> /
        <VirtualizedSectionList><ng-content></ng-content></VirtualizedSectionList>,
        banking on the WRONG claim that Angular content queries traverse projected content",
  root_cause: "@ContentChild on the INNER component resolves against whatever was projected
               directly onto ITS OWN tag in the template that instantiates it — that
               template is the WRAPPER's own, where <ng-content> is only a placeholder, not
               real template nodes. The real app-authored <ng-template vListItem> lives one
               level further out and never resolves — breaks across a SECOND <ng-content>
               re-projection hop specifically",
  symptom: "itemDir/headerDir/etc. stay undefined inside VirtualizedList/
            VirtualizedSectionList, VListOutletDirective gets an undefined templateRef,
            every cell renders as an EMPTY wrapper view — no exception, no red banner, just
            blank rows (reads as 'list is invisible', not 'list is empty')",
  fix: "WRAPPER captures the app's templates with its OWN @ContentChild (single direct hop,
        always resolves) and RE-AUTHORS equivalent <ng-template>s on the inner component,
        forwarding the captured templateRef + a freshly-built context through
        VListOutletDirective — the pattern VirtualizedSectionList already used correctly for
        its own inner VirtualizedList (multi-column FlatList path already did this too; only
        single-column FlatList + all of SectionList had the broken passthrough)",
  cast_helper: "asItem<ItemT>(value): ItemT | undefined (flat-list/index.ts,
                section-list/index.ts) — narrowest legitimate `as` boundary, for when a
                [vListOutletContext] literal needs a field typed ItemT (e.g. separator's
                leadingItem/trailingItem) but the only value available is a template `let-`
                binding typed unknown (generic structural-directive type param not
                preserved across this reuse). Not a general license to cast",
  precedent: "VListOutletDirective (capture w/ own @ContentChild → re-author <ng-template>
              → forward via template-outlet directive) is the shape create-tunnel's TunnelOut
              uses for cross-surface content sharing — see Scope boundary below",
}
```

## Bug 2 — `VirtualizedList.ngDoCheck()` recomputed `windowCells` unconditionally, causing a genuine infinite render loop

```
§bug2_infinite_recompute_loop := {
  bug: "recomputeView() rebuilt windowCells (+ each cell's `separators` handle — brand-new
        closures every call) from scratch on EVERY ngDoCheck, no memoization at all —
        unlike VirtualizedSectionList's own ngDoCheck, which already gates on
        sections/hasSectionSeparator unchanged",
  mechanism: "fresh context object every tick -> VListOutletDirective's `context` @Input()
              'changes' by reference every tick -> ngOnChanges -> viewRef.markForCheck()
              -> zoneless scheduler's notify() (render.ts's
              SymbioteChangeDetectionScheduler) -> detectChanges() next microtask ->
              ngDoCheck runs again -> rebuilds fresh again -> repeat forever",
  dormant_until: "present in VirtualizedList since it was written but invisible until Bug 1
                  fixed — with itemDir always undefined, VListOutletDirective's embedded
                  view was never created, so markForCheck() was never called from there",
  symptom_device: "'списки появились, но приложение намертво висит' (lists appeared, app
                   hard-froze) + broken layout — JS thread pegged in perpetual re-render
                   churn, layout/paint starved",
  fix: "ngDoCheck() now snapshots every input recomputeMetrics/recomputeView actually
        depend on — data, extraData, getItemLayout, keyExtractor, horizontal, inverted,
        windowSize, initialNumToRender, maxToRenderPerBatch, stickyHeaderIndices,
        maintainVisibleContentPosition, style, contentContainerStyle, scrollOffset,
        viewportLength, measureVersion, + 4 header/footer/empty/separator
        directive-presence booleans — skips recompute entirely when every value is
        reference-identical to the previous check. Explicit state changes (scroll, layout,
        a cell measurement, a genuine data swap) still bump a tracked value and trigger a
        fresh recompute",
  generalize: "any future component with an unconditional ngDoCheck/ngOnChanges feeding
               fresh object identities into a child @Input() needs the same
               dependency-snapshot guard — not list-specific. See
               angular-adapter-change-detection (Scope boundary below)",
}

§gotcha_jit_only_not_production := {
  issue: "VListItemDirective/VListHeaderDirective/etc. + VSection*Directive family
          originally took TemplateRef/ViewContainerRef via constructor-param injection
          (constructor(public readonly templateRef: TemplateRef<T>) {}) -> threw NG0202
          under vitest JIT (Angular JIT DI needs Reflect-based design:paramtypes metadata
          oxc's legacy-decorator lowering doesn't reliably emit for a generic class)",
  not_broken_on_device: "compiled to correct, fully-static
                         deps: [{ token: i0.TemplateRef }] under real
                         `ngc --compilationMode partial` build (confirmed inspecting
                         adapters/angular/build/angular/**/directives.js)",
  fix_anyway: "converted to inject() field style (readonly templateRef =
               inject<TemplateRef<T>>(TemplateRef);) — matches codebase DI convention,
               side effect: made these directives headless-testable at all",
  open: "SEPARATE, still-unresolved JIT-only quirk — SectionList wrapping
         VirtualizedSectionList throws \"Can't construct a query for the property ...
         since the query selector wasn't defined\" under vitest specifically — confirmed
         absent mounting VirtualizedSectionList directly; real ngc build of SectionList
         compiles 0 errors -> SectionList has no passing headless test as of this
         session — known gap, not evidence of a broken component; verify SectionList
         changes on a real device/simulator until tracked down",
}
```

## Bug 3 — `(event)="x.emit($event)"` forwarding permanently poisons an inner component's `.observed` gate

```
§bug3_observed_forwarding_poison := {
  bug: "every list wrapper (FlatList, SectionList, VirtualizedSectionList) forwards its
        inner VirtualizedList's `refresh` event via (refresh)=\"refresh.emit()\" (or
        resolvedOnRefresh?.()). The MERE PRESENCE of that binding subscribes to the inner
        component's `refresh` @Output() unconditionally, regardless of the handler
        expression -> VirtualizedList's own `refresh.observed` getter is permanently true
        the moment it's used inside ANY wrapper, even when the app never listens to
        (refresh) on the outermost <FlatList>/<SectionList>",
  symptom: "VirtualizedList's template gated <RefreshControl> on @if (refresh.observed) ->
            EVERY list in the app renders RefreshControl/PullToRefreshView, always —
            confirmed on-device via DEBUG=1 log: every RCTScrollView (all 5 in app,
            including ones with no (refresh) binding anywhere in app code) showed
            SCROLL-MULTI!! (core/engine/src/commit.ts diagnostic: 'ScrollView has more
            than one direct child') with an unconditional PullToRefreshView child",
  misdiagnosis: "this is the ACTUAL cause of the device freeze/RAM-growth symptom reported
                 AFTER Bug 1 + Bug 2 were fixed, originally misattributed to Bug 2's loop
                 guard being wrong. Real chain: extra always-present PullToRefreshView (+
                 a permanently-uncommitted #anchor#NEW sibling, never resolving to a
                 stable Fabric tag in the log) destabilized native scroll/layout ->
                 onLayout/onScroll kept firing with shifting values -> correctly (per
                 Bug 2's working memoization) kept triggering fresh legitimate recomputes
                 forever. Bug 2's guard was never wrong; the values it watched genuinely
                 never settled. Check for an .observed-forwarding leak BEFORE re-opening
                 Bug 2's memoization on a similar symptom",
  fix: ".observed cannot be trusted as a 'does anyone actually want this' gate on a
        component that is ALWAYS wrapped and internally forwarded — the wrapping layer's
        forwarding subscription poisons it. Added explicit @Input() refreshRequested?:
        boolean to VirtualizedList (+ VirtualizedSectionList, identical problem one layer
        up), computed shouldRenderRefreshControl = this.refreshRequested ??
        this.refresh.observed (falls back to own .observed for direct unwrapped usage,
        unchanged there). Each wrapper passes [refreshRequested]=\"refresh.observed\" —
        its OWN public output's .observed, the one signal that genuinely reflects 'did
        the APP subscribe' — down the chain: FlatList -> VirtualizedList, SectionList ->
        VirtualizedSectionList -> VirtualizedList",
  generalize: "any future wrapper forwarding a child's @Output() via
               (event)=\"x.emit($event)\" then reading that SAME child's .observed to
               gate behavior has this exact bug — the forwarding binding is itself an
               observer. Fix pattern (explicit override input, falling back to local
               .observed) generalizes directly",
}
```

See `angular-adapter-events`'s Landmine 3 for the sibling case of this same
`VirtualizedList`→`ScrollView`/`RefreshControl` forwarding chain breaking prop-to-event
conversion (`NG8002`) — a different symptom, same forwarding structure.

## ScrollView — `<ng-content>` duplicated across `@if`/`@else` branches, cells land outside the ScrollView (FIXED 2026-07)

```
§scrollview_root_cause := {
  symptom: "horizontal FlatList's item cells rendered as a full-width vertical stack at
            the app root instead of a small horizontal strip (device-confirmed iOS,
            'FlatList · 24 chips, windowed' demo in examples/angular/App.ts) — looked like
            'styles not applied' but styles were correct; cells structurally outside
            ScrollView (siblings of RCTScrollView, not children of RCTScrollContentView).
            Other lists on same screen (plain FlatList, SectionList w/ sticky headers,
            MVCP prepend-without-jump) unaffected",
  root_cause: "ScrollView's iOS template (scroll-view/index.ios.ts) branched its ENTIRE
               host structure on @if (isHorizontal) {...<ng-content>...} @else
               {...<ng-content>...} — <ng-content> declared TWICE. Angular limitation:
               content projected into the FIRST (@if) branch of a two-branch conditional
               never gets native 'catch-up' placement; only the SECOND (@else) branch
               does",
  confirmed_by: "own DEBUG=1 trace + upstream angular/angular#53310 ('@if syntax does not
                 display projected content'), #54840 ('Conditionals and content
                 projection', same with legacy *ngIf/else); angular.dev docs state it as a
                 hard rule: 'You should not conditionally include <ng-content> with @if,
                 @for, or @switch' — general workaround is <ng-template> +
                 ViewContainerRef/NgTemplateOutlet",
  mechanism_trace: "vertical (@else, second) branch: Angular's native catch-up
                    (applyProjection) fires immediately after RCTScrollContentView is
                    created — real appendChild/insertBefore land already-built cell
                    row-wrappers BEFORE ScrollViewProjectionController.bindContentNode()
                    runs (confirmed: bindContentNode preExistingChildren=29). horizontal
                    (@if, first): catch-up never fires — bindContentNode
                    preExistingChildren=0 forever, even after a real topLayout event +
                    multiple settle-ticks",
}

§scrollview_ios_fix := {
  fix: "iOS has ONE native intrinsic pair regardless of axis —
        symbiote-scroll-view/symbiote-horizontal-scroll-view (+ -content counterparts)
        both resolve to the same Fabric view (RCTScrollView/RCTScrollContentView,
        confirmed in trace logs). shared.ts's scrollProps getter already forwards axis as
        a plain prop (if (this.horizontal !== undefined) bag.horizontal =
        this.horizontal — comment: 'iOS needs horizontal to flip RCTScrollView's axis;
        Android's dedicated manager ignores it'), so the @if/@else-over-two-tag-pairs
        shape was ALWAYS redundant — written to mirror Android's genuinely-necessary
        branching, for authoring symmetry, not because iOS needed it",
  change: "removed the conditional entirely — index.ios.ts renders ONE
           <symbiote-scroll-view>/<symbiote-scroll-content> structure unconditionally
           (dropped HorizontalScrollView/HorizontalScrollContentView imports from this
           file only, still exported from primitives/index.ts for index.android.ts),
           <ng-content> declared exactly once. hasProjectedRefreshControl's own @if
           untouched (doesn't wrap <ng-content>, never part of this bug)",
  verified: "pnpm ng:build (from adapters/angular) clean; adapters/angular/src suite
             57/57 passing, zero regressions — incl. the 3 scroll-view-projection.test.ts
             vertical-scenario tests that DID break under the ruled-out swap below
             (confirms this fix, unlike the swap, doesn't trade one axis for the other).
             flat-list-scroll-containment.test.ts's pinned regression test flipped
             it.fails -> it, passes for real",
}

§scrollview_ruled_out_ios_swap := {
  tried: "swapped index.ios.ts to @if (!isHorizontal) {...vertical...} @else
          {...horizontal...} (semantically identical, just reordered which block is
          textually first)",
  result: "horizontal chip test flipped to passing (confirms first/second-branch theory)
           BUT 3 previously-green scroll-view-projection.test.ts tests +
           flat-list.test.ts's header/footer test immediately broke (vertical content now
           empty: RCTScrollView(RCTScrollContentView) with nothing inside)",
  conclusion: "bug is purely positional, not horizontal-vs-vertical semantics —
               reordering only relocates it onto whichever axis ends up first. Do not
               retry a plain reorder as 'the fix'",
}

§scrollview_android := {
  worse_shape: "index.android.ts same bug class, FOUR call sites (nested @if
                (isHorizontal) { @if (hasProjectedRefreshControl) {...} @else {...} }
                @else { @if (hasProjectedRefreshControl) {...} @else {...} }), one
                additionally used <ng-content select=\"*:not(RefreshControl)\"> where
                others didn't",
  dead_weight: "that selector was dead weight, not a real inconsistency —
                ScrollViewProjectionController.reconcileStickyRecords() (projection.ts:315)
                already strips a projected <RefreshControl> from content records whenever
                excludeRefreshControl is set, regardless of <ng-content select> (confirmed
                by reading the code); fix drops the selector",
  android_constraint: "cannot reuse iOS's 'collapse to one tag' — genuinely needs a
                       different Fabric view per axis for BOTH the outer scroll container
                       (RCTScrollView vertical-only; AndroidHorizontalScrollView a
                       dedicated ViewManager) AND the inner content view (RN's
                       *ScrollContentViewNativeComponents.js: vertical = plain Android
                       View; horizontal = AndroidHorizontalScrollContentView, carries its
                       own ShadowNode::layout() override participating in scroll
                       content-size math, NOT cosmetic — confirmed reading
                       AndroidHorizontalScrollContentViewShadowNode.h in
                       .vendors/react-native, so downgrading horizontal content to a plain
                       RCTView is not a safe shortcut)",
}

§scrollview_android_attempt1_ruled_out := {
  tried: "<ng-template> PER AXIS (two templates), each with its own <ng-content>,
          outletted into the correct @if/@else branch via a custom
          [symbioteTemplateOutlet] directive (ViewContainerRef.createEmbeddedView, a
          local @angular/core-only twin of @angular/common's NgTemplateOutlet — adapter
          deliberately has no @angular/common dep, see package.json). Literally Angular's
          own documented workaround (angular.dev: 'configure component to accept an
          <ng-template> element... will not initialize content until explicitly
          rendered') — still failed, still declared <ng-content> TWICE (once per axis
          template)",
  result: "broke DIFFERENTLY depending on which of the two <ng-template> blocks was
           declared LAST in template source order — whichever declared last received
           projected content, the other got NOTHING (zero appendChild calls, confirmed
           DEBUG=1 headless trace: bindContentNode preExistingChildren=0, reconcile
           records=0 forever). Swapping branch ORDER inside @if/@else did NOT change
           this — only swapping which <ng-template> was declared last did",
  key_finding: "rule is NOT 'first @if branch loses catch-up' (iOS's framing, too
                narrow) — it's 'a component with TWO TEXTUALLY DISTINCT unqualified
                <ng-content> declarations anywhere in its own compiled template reliably
                projects into only ONE (the one declared last in source), regardless of
                @if/@else wrapping, <ng-template> deferral, or
                ViewContainerRef.createEmbeddedView/NgTemplateOutlet outletting.' Matches
                title of angular/angular#22972 ('Strange behaviour with multiple
                <ng-content> and *ngIf'). Nesting a second distinct COMPONENT with its own
                single <ng-content> doesn't dodge this — count that matters is 'how many
                distinct <ng-content> declarations in the ONE component whose caller
                supplied the content'; delegating axis choice to a child component just
                relocates that same count into the child's template",
}

§scrollview_android_attempt3_fix := {
  fix: "ONE shared <ng-template>, referenced by outlet from all four branches, not
        one-per-axis. Insight Attempt 1 missed: 'only last one wins' fires on
        <ng-content> DECLARATION COUNT, not how many places reference/instantiate it.
        index.android.ts declares SINGLE top-level
        <ng-template #sharedContent><ng-content></ng-content></ng-template> — one
        <ng-content> occurrence — every one of four structural branches contains
        <ng-container [symbioteTemplateOutlet]=\"sharedContent\"></ng-container> instead
        of its own <ng-content>",
  directive: "SymbioteTemplateOutletDirective (same minimal @angular/common-free twin of
              NgTemplateOutlet from Attempt 1, now exported from index.android.ts —
              ngtsc partial-mode compiler requires a symbol referenced in a component's
              imports array to be exported from its declaring file, confirmed via real
              NG3004 build error) instantiates the one TemplateRef via
              ViewContainerRef.createEmbeddedView wherever the active branch places it.
              Only one branch ever live -> only one embedded view of sharedContent at a
              time, but DECLARATION is textually singular so 'last one wins' never
              triggers. Angular local template vars (#sharedContent) hoisted across the
              whole component template regardless of DOM position, so declaring before
              @if is valid and all four outlet references resolve correctly",
  verified: "pnpm ng:build (AOT partial->linker) clean, monorepo tsc --build clean,
             ESLint clean. New permanent regression test
             scroll-view/android-scroll-view-axis-projection.test.ts covers all four
             static axis x refresh-control combinations PLUS a runtime
             vertical->horizontal axis switch (signal-driven @if re-evaluation) — all
             pass. Full adapters/angular/src suite: 61/61 passing zero regressions (57
             pre-existing + 4 new), incl. scroll-view-projection.test.ts's Android
             refresh-control case + flat-list-scroll-containment.test.ts",
  open: "NOT tested on real Android device/emulator (headless vitest + AOT build only) —
         worth a real-device smoke before shipping; headless mechanism match with the
         now-fixed iOS case (same engine, same commit path) is strong evidence",
  attempt2_never_tried: "imperative relocation via ScrollViewProjectionController never
                         attempted — Attempt 3 resolved it declaratively first and is
                         simpler; keep Attempt 2's approach on file as fallback ONLY if a
                         future Angular version changes the outlet-reuse behavior
                         Attempt 3 relies on",
}
```

## Verification checklist

Run through this whenever touching the list family or `ScrollView`'s templates:

1. Does any component pass a bare `<ng-content></ng-content>` straight into a child that
   itself declares a `@ContentChild`? If yes, that query will never resolve — capture with
   the wrapper's own `@ContentChild` and re-author `<ng-template>` + a template-outlet
   directive instead (Bug 1).
2. Does any component declare `<ng-content>` more than once in its OWN compiled template
   (across `@if`/`@else` branches, multiple `<ng-template>`s, or otherwise)? Collapse to a
   single unconditional `<ng-content>` if the structural difference can be expressed as a
   prop instead (iOS fix); if genuinely different host tags are required per branch, use
   ONE shared `<ng-template>` + outlet referenced from every branch, never one `<ng-content>`
   per branch (Android fix).
3. Does a `ngDoCheck`/`ngOnChanges` in the touched component rebuild any object/array
   passed to a child `@Input()` unconditionally, every CD pass? If yes, add a
   dependency-snapshot guard (Bug 2's pattern) before it ships.
4. Does any template forward a child component's `@Output()` via `(event)="x.emit($event)"`
   and then read that SAME child's `.observed` getter to gate behavior? If yes, that
   `.observed` is permanently poisoned — add an explicit override `@Input()` instead
   (Bug 3's `refreshRequested` pattern).
5. Run the full `adapters/angular/src` vitest suite; confirm no regression against the
   pinned counts (57/57 after the iOS ScrollView fix, 61/61 after the Android fix).
6. Rebuild via `pnpm ng:build` (AOT partial→linker) — a JIT-only pass (plain `vitest run`)
   is not sufficient proof for anything touching `@ContentChild`/DI/`<ng-content>`; the
   real compiler can behave differently (see the NG0202 gotcha and the NG3004 export-
   visibility gotcha above).
7. For anything Android-specific, budget a real device/emulator smoke — this cluster's
   Android fixes have repeatedly been headless-clean but unverified on a real host.

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Cells render as empty wrapper views, no error | Bare `<ng-content>` passthrough breaks `@ContentChild` on inner component (Bug 1) | Capture with wrapper's own `@ContentChild`, re-author `<ng-template>` + `VListOutletDirective` |
| App hard-freezes / JS thread pegged the moment list cells start rendering | `ngDoCheck` rebuilding fresh object identities every CD pass, feeding a child `@Input()` (Bug 2) | Add a dependency-snapshot memoization guard to `ngDoCheck` |
| `RefreshControl`/`PullToRefreshView` appears on a list with no `(refresh)` binding in app code | `(event)="x.emit($event)"` forwarding makes `.observed` permanently true (Bug 3) | Add an explicit override `@Input()` (e.g. `refreshRequested`), fall back to local `.observed` |
| A device freeze looks like Bug 2's loop guard is wrong again | Actually Bug 3's RefreshControl leak destabilizing scroll/layout, which correctly re-triggers Bug 2's (working) memoized recompute | Check for a `.observed`-forwarding leak before touching Bug 2's guard |
| A horizontal `FlatList`/`ScrollView` paints as a full-width vertical stack; cells are siblings of `RCTScrollView`, not children of `RCTScrollContentView` | Duplicate `<ng-content>` across `@if`/`@else` branches on iOS; first branch never gets Angular's projection catch-up | Collapse to one unconditional host tag with one `<ng-content>` (iOS fix) |
| Same symptom on Android, or content silently disappears from whichever branch was declared earlier in the template | Duplicate `<ng-content>` across FOUR branches on Android; "last declared wins", not "first branch loses" | ONE shared `<ng-template>` + `SymbioteTemplateOutletDirective` referenced by outlet from every branch |
| `NG0202` thrown only under vitest JIT, directive otherwise fine | JIT DI can't resolve constructor-param-injected `TemplateRef`/`ViewContainerRef` on a generic class | Convert to `inject()` field style (also makes the directive headless-testable) |
| `NG3004` build error referencing a template-outlet directive | `ngtsc` partial-mode requires a symbol referenced in a component's `imports` array to be exported from its declaring file | Export the directive from the file that declares the shared `<ng-template>` |
| `SectionList` throws "Can't construct a query for the property..." only under vitest | Known unresolved JIT-only quirk, absent when mounting `VirtualizedSectionList` directly and absent from the real `ngc` build | Not a production bug; verify `SectionList` changes on a real device/simulator until tracked down |

## Scope boundary

This skill owns the **list-family content-projection, infinite-loop, and RefreshControl-
leak bugs** (FlatList/SectionList/VirtualizedList/VirtualizedSectionList/ScrollView) —
nothing else about these components' props, styling, or general architecture.

- **`angular-adapter`** — the main skill — is the parent record: §0 for adapter status,
  §6 for the `DescriptorOutlet`/`descriptorToAngular` component-parity model these list
  components build their views on top of. Read it first for anything outside this
  skill's list-specific bug cluster.
- **`angular-adapter-portal`** — `TunnelOut`'s own template-outlet mechanism for
  cross-surface content sharing is directly modeled on `VListOutletDirective` (Bug 1's
  fix in this skill) — the capture-with-your-own-`@ContentChild`-then-re-author-
  `<ng-template>` pattern is precedent, not a coincidence. Read that skill for anything
  about portals/tunnels; treat `VListOutletDirective` as the reference shape it followed.
- **`angular-adapter-change-detection`** — Bug 2's infinite-loop fix (the dependency-
  snapshot memoization guard on `ngDoCheck`) and that skill's `SignalView`/`markForCheck`
  material are closely related: a list's `ngDoCheck` misbehaving is fundamentally a
  change-detection-mechanics problem wearing a list-specific costume. Read that skill for
  the general CD model this bug is one instance of, or when a similar unconditional-
  recompute pattern shows up outside the list family.
- **`angular-adapter-events`** — its Landmine 3 documents the SAME `FlatList`→
  `VirtualizedList`→`ScrollView`/`RefreshControl` wrapped-forwarding chain that Bug 3
  above exploits, but from the callback-`@Input()`-to-`@Output()` conversion angle
  (`NG8002` on an inner wrapped component's prop) rather than the `.observed`-poisoning
  angle. Read that skill when converting a new callback prop through this same chain.

Reach for the right skill by what the work is actually about: LIST CELLS/CONTENT-
PROJECTION/REFRESH-LEAK → this skill, CROSS-SURFACE CONTENT SHARING → `angular-adapter-
portal`, GENERAL CD MECHANICS/SIGNALS → `angular-adapter-change-detection`, CALLBACK-
PROP-TO-`@Output()` CONVERSION → `angular-adapter-events`, ANYTHING ELSE →
`angular-adapter`.
