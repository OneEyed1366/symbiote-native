---
name: angular-adapter
description: "Symbiote Angular adapter — entry point, read BEFORE planning or writing Angular adapter code (adapters/angular/**, examples/angular/**). Status (2026-07): IMPLEMENTED, 21+ components at parity, renderer seam/bootstrap/AOT all real (§0). Holds CORE architecture only — split 2026-07: AOT build/prepare-script/dev-watch → angular-adapter-build; change detection/SignalView/markForCheck/ApplicationRef.tick() → angular-adapter-change-detection; @Input to @Output conversion → angular-adapter-events; createPortal/createTunnel/AppRegistry → angular-adapter-portal; FlatList/SectionList/ScrollView bugs → angular-adapter-lists. Stays HERE: Renderer2/RendererFactory2 seam; DOM-less bootstrap; version floor angular/core 20+; component parity (DescriptorOutlet, mixed adoption); symbioteHostProps escape hatch incl. dynamic testID; ANCHOR_HOST_COMPONENTS (unlisted composed component paints Unimplemented-component fallback on device; §21: listed-but-not-merging-anchorHostStyle silently drops class="..." — device-confirmed on Animated*/Button/ScrollViewStickyHeader, checklist + anchorStyleProp<T> helper); style-array-crashes-styleMap gotcha; DrawerLayoutAndroid removal note."
---

# Symbiote Angular adapter — core architecture

## This skill was split (2026-07)

The Angular adapter's knowledge outgrew one file. This skill keeps the core
architecture — status, seam, bootstrap, version floor, the component-parity
model, and general cross-cutting gotchas that don't belong to one narrower
topic. Everything else moved into a focused sibling skill:

| Topic | Skill |
|---|---|
| AOT build pipeline (two-stage ngc→linker), package self-build via `prepare`+conditional `exports`, `dev`/`start` + `ngc --watch` | `angular-adapter-build` |
| Change detection — `whenCommitted`, SignalView vs CheckAlways, `markForCheck`, real `ApplicationRef.tick()` | `angular-adapter-change-detection` |
| `@Input()` callback → `@Output()` EventEmitter conversion, the anchor double-fire bug, NG2007/NG8002 | `angular-adapter-events` |
| `createPortal`/`createTunnel`, `AppRegistry` + dynamic component composition | `angular-adapter-portal` |
| FlatList/SectionList/VirtualizedList/VirtualizedSectionList/ScrollView bugs | `angular-adapter-lists` |

Read this skill first for the architecture; jump to the matching topic skill
for implementation-level gotchas. Section numbers below (§0, §1, …) are
preserved from before the split — some numbers (§4, §5, §7–§9, §12–§15,
§17–§18, §20) now live only in the topic skills above, not here.

## §0. Status: IMPLEMENTED (verified 2026-07), not planning

`adapters/angular/src/` and `examples/angular/` are real and working — this
supersedes the "planning / pre-spike" framing the rest of this document was
originally written under. Sections below are corrected in place where reality
diverged from the plan; read §0 first, then treat the rest as the (now mostly
accurate) design record — §7's (`angular-adapter-events`) `@Output()` rollout
is DONE (2026-07), not an open question, except the permanent onScroll-family
exception it documents.

- **Components**: 21+ at full cross-adapter parity — `components/` has
  activity-indicator, button, drawer-layout-android, flat-list, image,
  image-background, input-accessory-view, keyboard-avoiding-view, modal,
  pressable, refresh-control, safe-area-view, scroll-view, section-list,
  switch, text-input, touchable, touchable-native-feedback,
  virtualized-list, virtualized-section-list. `primitives/` holds the
  `symbiote-*` host components (`ViewHost`, `TextHost`, `ImageHost`,
  `ScrollViewHost`, …). `modules/` has `animated`, `status-bar`. `services/`
  (`ColorSchemeService`, `WindowDimensionsService`) is the Angular-idiomatic
  DI-injectable lifecycle bucket — the framework-idiom equivalent of React
  hooks / Vue composables (`<adapter_src_follows_framework_idioms>`; see the
  `symbiote-file-layout` skill for the general bucket/placement rules this
  follows).
- **Bootstrap** (`adapters/angular/src/render.ts`) is real — see §2 for the
  corrected mechanism (it differs from the original plan below).
- **Renderer seam** (`adapters/angular/src/renderer.ts`,
  `SymbioteRendererFactory`/`Renderer2`) is fully wired to the engine mutation
  API with microtask-coalesced `requestCommit()`, confirming §1 below.
- **AOT pipeline**: `ng:build: ngc -p tsconfig.angular.json` produces real
  compiled output in `adapters/angular/build/angular/`, feeding the
  Metro/compiler-cli linker — not just a bench-spike, the real build. Full
  detail: `angular-adapter-build`.
- **Example app**: `examples/angular/App.ts` is a working demo using 20+
  components (Pressable, FlatList, Modal, KeyboardAvoidingView, …), with
  `ios`/`android`/`dev` pnpm scripts mirroring `examples/react` and
  `examples/vue-sfc`, plus Detox e2e config. Aligned 2026-07 to full section
  parity with the React/Vue canaries: the press-retention demo
  (`pressRetentionOffset`/`hitSlop`/`(pressMove)`), the native-driver
  `AnimatedScrollView` scroll-header demo, the boxShadow/filter/
  transformOrigin style-prop A/B demos, the `Image` web-alias demo, and a
  LOCAL KeyboardAvoidingView toggle demo (switch + nested KAV + email
  `TextInput`) were all missing and have been added. The root no longer wraps
  the whole screen in `KeyboardAvoidingView` (`SafeAreaView` → `ScrollView`
  directly, matching React/Vue) — that wrapping was itself a parity bug: it
  shifted the ENTIRE app on keyboard-open instead of one isolated demo panel,
  and `kavEnabled` had no switch to toggle it. The new `AnimatedScrollView`
  demo surfaced two real device-only bugs, fixed the same pass:

```
§0a_animatedscrollview_bugs := {
  bugs: ["Android-only content-wrapping crash: \"ScrollView can host only one direct child\"",
         "missing nestedScrollEnabled default"],
  fix: "adapters/angular/src/modules/animated/create-animated-component.ts",
  root_cause: "AnimatedScrollView is a from-scratch reimplementation talking directly to
               symbiote-scroll-view, so it silently misses ANY defaulting/behavior that
               lives in the real ScrollView component's prop-bag assembly
               (scroll-view/shared.ts)",
  open: "before trusting AnimatedScrollView for a new use case, diff its prop bag against
         scroll-view/shared.ts for anything else silently dropped (sticky headers, snap-to,
         scrollEventThrottle defaults, keyboard-dismiss handling, …) rather than assuming
         parity"
}
```

  Note testID naming across the three canaries was NEVER a strict cross-adapter
  invariant — don't chase full testID-string parity, only content/behavior
  parity.
- **Both closed (2026-07)**: `packages/slider/src/angular/` ships a real Angular
  build (`@symbiote-native/slider/angular`, same `createNode`-by-ViewConfig wrapper
  React/Vue use — the wrapper mechanism itself lives in the `symbiote-third-party-native-view`
  skill); the docs site's live framework switcher
  (`apps/docs-site/src/pages/index.astro`) lists Angular as `live: true`
  alongside React/Vue (`LIVE_SYMBIOTES = ['react', 'vue', 'angular']`). The
  ONLY remaining Angular-specific gap is third-party **React component**
  packages (`@react-native-community/slider` itself) — React-dispatcher-only
  per `<third_party_rn_packages_are_react_only>`, not fixable by a wrapper.

Angular was the 4th adapter (after React, Vue) and isolated the same R4 risk
Vue did — a second non-React, mutation-oriented framework on the validated
engine — plus one genuinely new risk: **AOT template compilation under
Metro**, which `angular-adapter-build` covers in full.

## 1. The renderer seam — Angular is already built for us

An Angular component never touches the DOM; every paint goes through `Renderer2`,
created per component by `RendererFactory2`, and Angular lets you provide your own
factory. That is the framework-agnostic seam — twin of Vue's `createRenderer` and
React's `react-reconciler` host config. `SymbioteRenderer implements Renderer2`
(`adapters/angular/src/renderer/index.ts`) maps every method onto the engine mutation
API; the engine owns all Fabric clone-on-write.

Full `Renderer2 → @symbiote-native/engine` mapping table, the class/style handling, and
why events arrive pre-named: `references/renderer-seam.md`. For the engine's mutation
API, node identity, and commit mechanics this seam drives, see the `symbiote-engine-core`
skill.

## 2. DOM-less bootstrap — AS BUILT (corrected from the original plan)

`mount(rootTag, RootComponent)` (`adapters/angular/src/render.ts`) does NOT use
`createApplication` + `provideZonelessChangeDetection()`: `createEnvironmentInjector`
with a null parent installs no application-level CD providers, so that helper has
nothing to attach to. It supplies `NoopNgZone` + a `ChangeDetectionScheduler` directly.
One Angular app per surface, so Fast Refresh tears down cleanly. Two sanctioned FFI-edge
`as` casts live in this file and nowhere else in the adapter.

Full bootstrap shape, the provider list, and the `INJECTOR_SCOPE:'root'` follow-up:
`references/bootstrap.md` (and `angular-adapter-change-detection` §3, which supersedes
the hand-rolled scheduler).

## 3. Version floor — @angular/core >=20 (locked, confirmed in `package.json`)

`adapters/angular/package.json` pins `@angular/core: ">=20"` as a peerDependency,
matching this section. **Correction vs the original plan**: the floor is NOT
because we call `provideZonelessChangeDetection()` — we don't (see §2, §0). The
real bootstrap supplies `NoopNgZone` + a hand-rolled scheduler directly via
`createEnvironmentInjector`, which has worked since `>=20`'s stable
`createEnvironmentInjector`/`createComponent` API surface regardless of the
zoneless helper. The floor still holds because **that's the version where
zoneless-without-zone.js is a first-class, non-experimental Angular concept**
(the ecosystem, tooling, and Angular's own internal APIs like
`ɵChangeDetectionScheduler` stabilized around it) — not because of the public
helper function itself. If a future refactor DOES switch to calling
`provideZonelessChangeDetection()` (e.g. if bootstrap moves to a shape that
supports it), the floor reasoning changes to the original one below; today it
doesn't apply literally.

The floor is set by **change detection without zone.js**, which is effectively a
requirement, not a nicety: zone.js monkey-patches global async primitives and under
Hermes that is a known headache. Zoneless availability by version:

```
v17 (wolf-tui)  no public zoneless → private ɵChangeDetectionScheduler hack   AVOID
v18–19          provideExperimentalZonelessChangeDetection()  (public, experimental)
v20             provideZonelessChangeDetection()  (stable)                    ← FLOOR
v21+            zoneless by default, nothing to call
```

Angular's support window is 18 months / EOL every ~6 months. As of 2026-06 only
**v20, v21, v22** are supported; **v17/18/19 are all EOL** (v17 — wolf-tui's version —
dead since 2025-05). So floor=20 = "any still-supported Angular", and excludes only
EOL versions. Everything else we need (Renderer2, standalone, createComponent /
createApplication / createEnvironmentInjector, signals) exists since ≤17, so zoneless
is the only thing that moves the floor.

- `adapters/angular` peerDependency: `@angular/core` `>=20`.
- `examples/angular`: pin a recent stable (21.x).
- Lowering the floor later is a one-line range change; raising it is breaking — so
  start high.

### There is now a CEILING too: `~22.0.8`. Angular 22.1 moved to Babel 8; Metro is Babel 7 (2026-08)

The floor above says "start high". That advice now has a hard stop on the other end, and it
is NOT a stale pin someone forgot to widen — widening it breaks the iOS/Android build outright:

```
[BABEL] examples/angular/index.js: Requires Babel "^8.0.0-0", but was loaded with "7.29.7".
        (While processing: ".../examples/angular/babel.config.js$1")
```

```
22.0.0  dependencies.@babel/core = 7.29.0
22.0.8  dependencies.@babel/core = 7.29.7   ← last Babel-7 release, our pin
22.1.0  dependencies.@babel/core = 8.0.1    ← the break
22.1.1  dependencies.@babel/core = 8.0.1
```

```
§3_babel8_ceiling := {
  bug: "@angular/compiler-cli@22.1.0 bumps its @babel/core dep 7.29.7 → 8.0.1; in lock-step
        bundles/linker/babel/index.js:585 flips api.assertVersion(7) → assertVersion(8)",
  mechanism: "the linker is stage B of the AOT pipeline and runs INSIDE Metro's Babel
              (examples/angular/babel.config.js requires it via
              @symbiote-native/angular/babel-linker); @react-native/babel-preset 0.86 is
              Babel 7.29.7, so Angular's plugin gets handed a Babel 7 api and refuses",
  do_not: "stub assertVersion to bypass it — the bundle does
           `import { types } from '@babel/core'` (4 sites: lines 24/27/308/435), and
           compiler-cli 22.1.x installs its OWN nested @babel/core@8.0.1, so that resolves
           to Babel 8's types. Bypassing the assert would splice Babel-8-constructed AST
           nodes into a Babel-7 program — a real incompatibility, not pedantry",
  lock_step: "all four @angular/* entries (pnpm-workspace.yaml catalog +
              examples/angular/package.json) move together because compiler-cli
              peer-requires @angular/compiler at an EXACT version",
  fix_options: ["wait for RN to ship a Babel 8 preset — zero work, just widen the pin and
                 drop this section; the expected resolution",
                "move the linker out of Metro — run it as a post-ngc pass under Angular's
                 own bundled Babel 8 so Metro never loads an Angular Babel plugin; ngc is
                 already a separate build step (pnpm ng:build), no new stage cost, but
                 loses the Metro plugin's per-file granularity — check against Fast Refresh
                 on template edits before committing to it"],
  verified: "2026-08-13, after pinning: ngc -p tsconfig.angular.json clean; react-native
             bundle --platform ios --reset-cache produces 79 ɵɵdefineComponent and ZERO
             unlinked ɵɵngDeclareComponent call sites (3 textual matches left are
             @angular/core's own runtime export plus a comment in
             babel-register-composed.cjs) — the linker genuinely ran, didn't silently skip"
}
```

## 6. Component parity (L4) — a generic `descriptorToAngular` NOW EXISTS (mixed adoption)

Parity is structural: shared state machines live in `@symbiote-native/components` and every
adapter imports them verbatim. `DescriptorOutlet`
(`adapters/angular/src/descriptor-to-angular/index.ts`, selector
`symbiote-descriptor-outlet`) IS the Angular bridge — an imperative `Descriptor` walker,
since Angular has no hyperscript to return a tree from.

**Adoption is partial — check, do not assume.** `ActivityIndicator` is migrated; ~15
other components still hand-write a template over `primitives/`.
`grep -l DescriptorOutlet adapters/angular/src/components/*/index*.ts` tells you which.
Prefer `DescriptorOutlet` for a NEW component with a shared render fn. Migrating the
rest is real, uncompleted backlog.

Mechanism, patch/diff behaviour, and the fallback caveat: `references/component-parity.md`.
For the three-layer split a shared component must land in before it reaches this bridge,
see `symbiote-add-component`; to verify a ported component actually reached full parity,
see `symbiote-parity-check`.

## Layered milestones (mirror the Vue plan) — ALL SHIPPED (see §0)

```
L1  Static paint     View/Text/Image, no reactivity → prove createComponent +
                     RendererFactory2 → surface paints on iOS  (gated by the AOT pipeline — see angular-adapter-build) DONE
L2  Reactive         signals/CD → requestCommit; a counter increments                 DONE
L3  Events           (press) → setEventListener; Pressable                            DONE
L4  Parity (P0)      @symbiote-native/components state machines + descriptorToAngular      DONE for L1-L3 surface (see §6 — DescriptorOutlet
                     (DescriptorOutlet) for new components, hand-written templates    exists + proven on ActivityIndicator; most
                     for the ~15 not yet migrated                                    components still hand-written, migration ongoing)
Build                Variant 1 (ngc + Metro/linker) + examples/angular               DONE
```

## §10. `symbioteHostProps` is the general escape hatch for ANY non-`@Input()` prop on a bare primitive — including `testID`

`View`/`Text` (`adapters/angular/src/primitives/shared.ts`'s `SymbiotePrimitiveHost`)
declare ONLY `style` as a real `@Input()`. Everything else — `testID`, accessibility props
(`accessible`, `accessibilityRole`, `accessibilityState`, `role`, `aria-label`, ...),
Responder negotiation callbacks (`onStartShouldSetResponder`, `onResponderGrant`, ...),
`Text`'s `onLongPress`/`onPress` — is NOT a declared Input. A STATIC string-literal attribute
with no brackets (`testID="ref-box"`) works fine even though it's undeclared (Angular treats
an unbound literal attribute differently from a bound property). But the MOMENT the value
needs to be a bound expression — `[testID]="dynamicExpr"` inside a `@for` loop, `[onLongPress]
="handler"`, `[accessibilityState]="someObject"` — it fails Angular's real `strictTemplates`
build with `NG8002: Can't bind to 'X' since it isn't a known property of 'View'`, even though
it works fine at RUNTIME (Angular still routes it through `Renderer2.setProperty` when no
schema/Input matches — the failure is a STATIC template-check-time rejection, not a runtime
one, so plain `vitest`/headless tests never catch it; only a real `ngc --strictTemplates`
compile does — see `angular-adapter-build`).

**The fix, already proven in `Pressable`'s own template** (`adapters/angular/src/components/
pressable/index.ts`): bundle every such prop into ONE plain object and bind it through
`[symbioteHostProps]`, a REAL declared `@Input()` on `SymbioteHostPropsDirective`
(`adapters/angular/src/primitives/shared.ts`, `exportAs: 'symbioteHost'`) — now also exported
from the public barrel (`adapters/angular/src/index.ts`) so app/example code can use it
directly, not just internal composed components:
```html
<View [symbioteHostProps]="chip.hostProps" [style]="styles.chip">
```
```ts
readonly hostProps = { testID: `resp-chip-${index}`, onResponderGrant, onResponderMove, ... };
```
This was needed (and fixed) in `examples/angular/components/{ResponderDemo,ParityDemo,
AccessibilityDemo}.ts` — every one of them binds a MIX of testID + responder/a11y/press
callbacks onto a bare `View`/`Text`, all through one `hostProps` bag per element, never a
separate `[testID]=`/`[onFoo]=` binding. **Rule of thumb**: if a prop you want to bind onto
`View`/`Text` isn't `style`, and the value isn't a static string literal, it goes in a
`symbioteHostProps` bag — don't add a new `@Input()` to the primitive host classes just to
make one more binding legal (that would defeat the point of them staying thin), and don't
assume a static-literal exception applies once the value becomes an expression.

Note: `SymbioteHostPropsDirective` ALSO wraps every `onX` function prop to call
`markForCheck()` after the handler runs, which is what makes a flat-bag callback
(e.g. a responder gesture) actually repaint the component — see
`angular-adapter-change-detection` for why that's necessary at all.

## §11. Every composed `@Component` used as a plain `<Tag>` must be listed in `ANCHOR_HOST_COMPONENTS` — a real, device-visible failure mode, not silent

`SymbioteRenderer.createElement(name)` (`adapters/angular/src/renderer.ts`) is called for
EVERY element Angular's template compiler emits, including the host element it auto-creates
for a NESTED component tag (`<Slider>`, `<Pressable>`, `<AnimatedDemo>` — any custom
`@Component` used as a child inside another component's template gets its OWN host element
created via this exact call, using its selector as `name`, same as a plain `<View>`/`<Text>`
would). `createElement` checks `name` against the `ANCHOR_HOST_COMPONENTS` set FIRST — a
listed name gets a harmless anchor host (invisible, no native view, exactly right for a
composed component whose OWN template does the real painting). An UNLISTED name falls
through to `descriptorFor(engineName)` — which, per its own doc comment, treats any name
that isn't a recognized `symbiote-*` primitive as "a raw Fabric view name" and hands it
straight to a real `createNode` call. Since `'Slider'`/`'AnimatedDemo'`/etc. are NOT real
native view names, this doesn't throw or no-op — **React Native's own Fabric fallback
silently paints a real, visible "Unimplemented component: `<Name>`" placeholder view** in
its place. This is NOT a headless-testable bug: vitest/tsc/ngc all stay green (the mock
Fabric in tests doesn't reproduce RN's real "unknown view name" fallback rendering), so it
was only caught on a real device/simulator run.

**Discovered 2026-07** porting Slider + 8 new demo components into `examples/angular`: every
one of them (adapter-authored OR app-authored, the mechanism doesn't distinguish) needed its
selector added to `ANCHOR_HOST_COMPONENTS` before it painted correctly instead of showing the
red "Unimplemented component" banner (with, confusingly, the REAL content sometimes still
partially visible/functional underneath or beside it, since the anchor issue is about the
OUTER host, not the component's own inner-template rendering — "looks broken but the widget
still works" is exactly this bug, not a coincidence).

**This is a known scaling gap, not a one-time fix**: the set is a manually-maintained
allowlist with no general/automatic rule for "is this selector a composed component or a raw
Fabric view name" — Angular's `Renderer2` contract gives `createElement` no such signal.
Every NEW composed `@Component` ANYONE writes and uses as a plain tag — in the adapter, in
an example app, in a future consumer's own app code — needs a one-line addition here or it
silently (from the type-checker's perspective) paints wrong on a real device. When adding a
new composed component, add its selector to this set as a matter of course; when debugging
"my component partially renders but shows a red overlay on device," check this list FIRST
before suspecting the component's own logic.

Being correctly listed here is necessary but NOT sufficient — the anchor host it gets still
needs its class-derived style merged back into the real inner primitive, or `class="..."` on
it silently does nothing (a DIFFERENT, second-order failure of the exact same anchor
mechanism). See §21.

```
§11a_lookup_was_case_sensitive := {
  bug: "a STATIC template tag reaches createElement with its authored case intact (the compiler
        copies source text); a component mounted DYNAMICALLY via ViewContainerRef.createComponent /
        NgComponentOutlet does NOT — Ivy derives the host tag from runtime selector metadata and
        LOWERCASES it. So 'MenuScreen' in the Set never matched the runtime 'menuscreen'",
  scope: "every screen mounted by Stack/Tab/Drawer (packages/navigation/src/angular/stack.ts's
          *ngComponentOutlet). Found 2026-07-09, first real-device run of the Angular Stack",
  symptom: "NOT the usual red 'Unimplemented component' banner — the unrecognized host silently
            failed to size/paint at all, so a correctly-rendered subtree (real geometry, colors,
            measured height) was simply INVISIBLE: blank screen, working native header, no crash,
            no console output, no redbox",
  how_found: "DEBUG=1 device logs side by side — `createElement Stack -> anchor host` (static, case
              preserved) vs `createElement menuscreen -> menuscreen` (dynamic, lowercased, fell
              through to a real unrecognized-viewName createNode). The engine's own
              `logScrollChildren` dlog (core/engine/src/commit.ts, unrelated but present in the same
              log) was what ruled the engine out first",
  fix: "lowercase every entry at Set-construction time AND lowercase the lookup/insert key in
        createElement + registerComposedComponent — closes it for every future component without
        touching the (still manually maintained) allowlist",
  stale_doc_note: "renderer.ts's own comment claimed the static and dynamic paths behave
                   identically — untested on a device, and wrong"
}

§11b_the_fix_regressed := {
  bug: "the Set literal drifted back to un-lowercased strings while §11a still described the fix as
        done — `new Set([...capitalized...])` with NO `.map(s => s.toLowerCase())`. A plain Set does
        not normalize its members, so `has(engineName.toLowerCase())` missed every capitalized entry
        ('ActivityIndicator', 'Switch', 'ScrollView', 'StatusBar', 'Pressable', …); only the handful
        already spelled lowercase ever matched",
  found: "2026-07-13, as 8 headless vitest failures across 5 files after an unrelated
          folder-as-module pass touched renderer.ts; `git stash` against the literal HEAD commit
          proved the failures PRE-EXISTED the move — a real committed regression, not the move",
  why_it_stayed_masked: "~15 composed-component tests search by testID/style, which finds the real
                         inner node regardless of an extra un-anchored ancestor. Only tests
                         asserting exact viewName, a serialized-tree string, root.children.length,
                         or an exact event-fire count broke (activity-indicator, switch, status-bar,
                         pressable, scroll-view-projection)",
  fix: "`.map(selector => selector.toLowerCase())` on the array passed to new Set(...)",
  lesson: "this skill describing a fix as done is NOT proof the code still has it — the Set literal
           is one array anyone adding a component could retype without the .map. Verify the
           .map(toLowerCase) call is present before trusting §11a/§11b's narrative"
}

§11c_root_cause_was_STALE_ngc_ARTIFACTS := {
  bug: "an app-authored composed screen (MenuScreen via NgComponentOutlet) did not anchor-host under
        examples/angular on workspace:* — `createElement menuscreen -> menuscreen` (raw native path)
        ⟶ iOS blank body under a working native header, Android redbox
        `Can't find ViewManager 'menuscreen'`",
  the_tell: "ONLY the pnpm workspace:* harness; the canary (fresh npm build) rendered correctly ⟶
             canary builds build/ from a clean pack, the workspace reuses a LOCAL build/ that ngc
             had incrementally polluted",
  root_cause: "`ngc -p` (like `tsc -p`, non---build) NEVER deletes orphaned outputs. Renaming
               src/renderer.ts → src/renderer/index.ts left build/angular/renderer.js behind, and a
               FILE beats a FOLDER in Node/Metro resolution, so the barrel's `export … from
               './renderer'` resolved to the STALE flat renderer.js — which carried its own inline
               ANCHOR_HOST_COMPONENTS Set. The bundle held TWO registry modules: the stale one
               createElement read, and the live one registrations wrote",
  proof: "react-native bundle + grep — `grep -c 'function isAnchorHostComponent'` = 1 but
          `grep -c 'function registerComposedComponent'` = 2; `node -e require.resolve('./build/
          angular/renderer')` returned …/renderer.js, not …/renderer/index.js. After
          `rm -rf build && ngc`: exactly ONE registry",
  fix_decisive: "every Angular-shipping package (adapters/angular, packages/{slider,navigation,
                 splash-screen}) now has `\"clean\": \"rm -rf build\"` and
                 `\"ng:build\": \"pnpm run clean && ngc …\"`",
  fix_hygiene_only: "the registry (ANCHOR_HOST_COMPONENTS + registerComposedComponent +
                     isAnchorHostComponent) also moved into the dependency-free leaf
                     adapters/angular/src/anchor-host-registry.ts — renderer imports it, the barrel
                     re-exports off it, BOTH by relative path (one Metro instance);
                     babel-register-composed.cjs keeps injecting the BARREL",
  require_cycle_theory: "the original hypothesis, NEVER confirmed — possibly a full misdiagnosis of
                         the stale shadow. The leaf is kept as harmless insurance, not as proof",
  do_not_reattempt: "a realpath-canonicalizing Metro resolveRequest dedup is a NO-OP — there was
                     only ever one RESOLUTION route; the duplication was on DISK",
  trap_one_resolution_route: "a first cut gave the leaf its own
                              @symbiote-native/angular/anchor-host-registry exports subpath while the
                              renderer kept a relative import — TWO specifiers for one file. Under
                              pnpm symlinks Metro made TWO instances ⟶ two Sets ⟶ device redbox
                              `Can't find ViewManager 'Stack'`. A singleton module is imported
                              through ONE specifier everywhere",
  trap_ngc_never_cleans: "after ANY source file/folder rename in a package built by ngc -p / tsc -p,
                          the old output lingers in build/ and can shadow the new one. Clean first",
  verified: "device-verified 2026-07-17 on examples/angular with Metro --reset-cache (both the build
             AND the injected transform changed; a warm Metro serves a stale mix) — every composed
             selector logs `createElement <selector> -> anchor host` and paints on iOS + Android.
             Changeset .changeset/angular-anchor-host-leaf-module.md; build-hygiene angle also in
             the angular-adapter-build skill"
}
```

## §16. `[style]="[a, b]"` (RN's array-composition idiom) crashes Angular's built-in `ɵɵstyleMap` — always flatten first (2026-07)

Angular's compiler special-cases the literal binding NAME `style` (and `class`, `style.x`,
`class.x`) at PARSE TIME, whatever the target element: `[style]="expr"` always lowers to
`ɵɵstyleMap(expr)`, never `ɵɵproperty('style', expr)` — even on our own components with a plain
`@Input() style`. A flat style object is fine (§1's `setStyle` per-key merge handles it). An
ARRAY throws inside Angular's own styling engine (`prop.indexOf is not a function` in
`applyStyling`) BEFORE `Renderer2.setStyle` is ever called, so nothing in the adapter can
intercept it.

**The rule, both ends:**

- **App authors** — never write `[style]="[a, b]"`. Call the engine's `flattenStyle`
  (re-exported from `@symbiote-native/angular`): `[style]="flattenStyle([a, b])"`, exposed as
  `readonly flattenStyle = flattenStyle;` since Angular templates can only call instance
  members, never a module-level import.
- **Adapter components** — any field/getter a template binds via `[style]=` that CAN hold an
  array must flatten at assignment, not carry `IStyleProp<T>` to the binding.
- **Forwarding is just as exposed as a leaf usage.** A wrapper's own `<Inner [style]="style">`
  is still a literal `[style]=` binding, so an app passing an array to the WRAPPER crashes at
  the wrapper's template before the inner component runs. Every list-family forwarder exposes a
  flattened `resolvedStyle` for this.

```
§16_style_array_crash := {
  incident: "examples/angular/App.ts's 'FlatList · 24 chips' demo bound
             [style]='[styles.chipCard, { backgroundColor: chipColor(item) }]' on each cell",
  two_symptoms_one_cause: "the crash landed inside a change-detection microtask
                           (adapters/angular/src/render.ts) whose try/finally has NO catch — the
                           exception left the microtask uncaught while the reentrancy guard still
                           reset in the finally, so the NEXT notify re-ran detectChanges() and hit
                           the identical throw, forever. The item's style never committed ('styles
                           don't apply') AND change detection free-ran retrying (log spam, climbing
                           RAM)",
  repro: "adapters/angular/src/components/flat-list/flat-list-array-style.test.ts — reproduces the
          crash on a raw array binding, then shows both symptoms gone once flattened",
  sites_fixed: ["flat-list/index.ts rowStyle — ALWAYS an array
                 ([{flexDirection:'row'}, columnWrapperStyle]), so it crashed on EVERY
                 multi-column FlatList, immediately",
                "virtualized-list/index.ts resolvedStyle — an array only when inverted, dormant
                 until the first inverted-list demo",
                "FlatList / SectionList / VirtualizedSectionList — each now flattens its own
                 forwarded @Input() style"],
  rejected_alternative: "renaming the public binding away from `style` (e.g. [styleProp]=) WOULD
                         dodge the interception and route through the normal setProperty ⟶
                         routeProp path, where the engine's own flattenStyle already handles it at
                         commit time — rejected because it breaks the RN-idiom `style` name every
                         other adapter and the whole demo app use, for every component. Revisit
                         only if flatten-at-every-site becomes unmanageable",
  not_yet_swept: "touchable.ts and image-background.ts still forward [style]='style' without a
                  flatten — same latent risk if an app passes an array to THEIR top-level style
                  input. Apply the resolvedStyle pattern if one surfaces.
                  (drawer-layout-android was the third such site and is gone — see §19)",
  related_fix_same_pass: "examples/angular/tsconfig.json (editor-facing base) lacked the
                          lib:['DOM'] that tsconfig.angular.json (the real ngc config) already had,
                          so every file importing @angular/core spammed TS2584 'Cannot find name
                          document' in editor diagnostics only, never in the real build. Mirrored
                          the lib array into the base config"
}
```

## §20. Sticky is POSITIONAL over projected records — RefreshControl exclusion is load-bearing

```
§20_sticky_positional := {
  angular_only: "RefreshControl is a projected CHILD of ScrollView here; React puts it in the
                 refreshControl PROP (adapters/react/.../virtualized-list:
                 scrollProps.refreshControl = createElement(RefreshControl, …)), where it can
                 never occupy a child position",
  mechanism: "projection.ts reconcileStickyRecords walks its own ordered `records`, counts the
              ones that paint, wraps those whose derived index ∈ stickyHeaderIndices",
  index_space: "buildListPlan.stickyChildPositions — shared code, knows nothing about a
                RefreshControl child",
  looks_like_off_by_one: ¬bug ⟶ the exclusion already exists and must not be 'simplified':
    `if (config.excludeRefreshControl && isProjectedRefreshControl(record.child)) { drop; continue; }`
    `const countsAsChild = !isAnchor(record.child) && !isProjectedRefreshControl(record.child);`,
  isProjectedRefreshControl_matches: ["PullToRefreshView", "AndroidSwipeRefreshLayout",
                                      "an anchor host CONTAINING one"]
    ⟵ public <RefreshControl> is an anchor host whose real native node lives inside its
       component view — both clauses load-bearing,
  verified: "scroll-view/sticky-with-refresh-control.test.ts (2026-08-18) mounts RefreshControl
             AND stickyHeaderIndices together — the interaction older tests covered only
             separately; mutation-checked (moving the index by one fails it)",
  test_trap: "`collapsable === false && children.some(testID)` ALSO matches RCTScrollContentView
              (same props, holds every child) ⟶ negative assertions pass for every testID and
              prove nothing. Require viewName === 'RCTView' too"
}
```

## §21. Sticky attach, the fan-outs, and the frame-budget hunt (2026-08-18/19)

```
§21a_attach_needs_three_hooks := {
  bug: "attachSticky() binds the native scroll driver only when sticky is on AND the host node
        exists; it ran from ngAfterViewInit + ngOnChanges only, and its design depends on a
        LATER call arriving. For a VirtualizedList/SectionList no later call arrives",
  trace: "ngAfterViewInit → hasStickyHeaders=false (window not measured yet)
          STICKY[list]    → renderedStickyIndices=[0] derived from the measured window
          ngOnChanges     → wantsAttach=true, hostNode still null → 'NOT attaching'
          (nothing else)  → sticky never turns on",
  immune: "a literal [stickyHeaderIndices]='[0,4,…]' in a template (benchmark PATH A) — the
           indices exist before ngAfterViewInit, which then sees a node and attaches",
  fix: "ngDoCheck retries ONLY from the stuck state
        (stickyAttachedEnabled && stickyAttachedNode === null) ⟶ a settled ScrollView pays nothing",
  verified: "device-diagnosed AND device-verified 2026-08-18, examples/angular BenchmarkScreen",
  how_found: "records=801 children=801 ⟶ no dead-record leak (the leading hypothesis, guarded by
              projection-removal-tracking.test.ts); childPositions=[0] vs window=[0,9] ⟶ the
              shared buildListPlan was right too. The one field that separated working from
              broken was `hasNode` inside a line that says it is NOT attaching",
  uncovered_next_defect: "with the retry in place PATH B runs end to end —
                          `attachSticky node committed -> attachStickyScroll` →
                          `attachStickyScroll onScroll -> value#852`, header pins on a SLOW drag.
                          FAST drag janks several rendering-visible ways (stale pinned header);
                          PATH A on the same screen never janks. Do NOT read the two as one bug",
  memory_not_involved: "~800 MB, in line with every other adapter"
}

§21b_two_wrong_measurement_claims := {
  claim_1: "'445 MB → 3014 MB growth' — WRONG, misread off a device screenshot; the real figure
            never left ~800 MB",
  claim_2: "'the DEBUG=1 build is a confound' — WRONG here: the other adapters' 'PATH B is fine'
            was observed on DEBUG=1 too. Same build, same screen, same seams",
  rule: "read a number off the device yourself before building a theory on it, and check what
         flavour the COMPARISON was taken in before calling a build a confound"
}

§21c_two_ON_fanouts := {
  root_cause: "projection.ts held two O(N) broadcasts; the cost is a PRODUCT, invisible at small
               N and fatal at large N. Fixed 2026-08-19",
  arithmetic: "reconcileStickyRecords() ran per PROJECTED INSERT and rebuilt EVERY sticky record
               recordHeaderLayoutY()    ran per HEADER LAYOUT  and rebuilt EVERY sticky record
                 canary            70 inserts ×   3 sticky =     210 dispatches → unnoticed
                 benchmark PATH A 801 inserts × 200 sticky = 160 200 dispatches → thread starves
                                + 200 layouts × 200 sticky =  40 000 more",
  why_neither_was_needed: "a wrapper's inputs change in exactly two ways and both already had a
                           targeted path — its childIndex shifted, or its neighbour moved.
                           nextStickyHeaderY(i) returns the first sticky index ABOVE i, so a
                           recorded Y is read by exactly ONE header (the closest sticky index
                           below it); the other N−1 answered `ranges unchanged, skipped rebuild`",
  fix: ["reconcileStickyRecords(notifyAll) — true only from update(), since the config-only
         inputs scrollViewHeight / invertStickyHeaders reach wrappers nowhere else",
        "recordHeaderLayoutY notifies the ONE neighbour"],
  angular_only_by_construction: "every other adapter declares the sticky wrapper in the template,
                                 so framework diffing filters uninterested headers for free; the
                                 imperative projection controller has no diffing",
  guarded_by: "sticky-header-layout-fanout.test.ts, mutation-verified (restoring the broadcast
               fails it: `expected 3 to have a length of 1`)",
  why_it_counts_dispatches: "a pinned header's translateY is computed by the NATIVE driver — the
                             committed props read `translateY: 0` whether the math is right or
                             not — and the reducer's own 'skipped rebuild' guard hides a
                             broadcast from any assertion on rebuilds. When the only observable
                             of a defect is how OFTEN something runs, count the seam; do not
                             invent a prop to assert on"
}

§21d_per_frame_idle_commit := {
  finding: "standing STILL on the benchmark screen, touching nothing, the engine commits ONCE PER
            FRAME (measured 2026-08-19) — this reframes everything above",
  log: "commit root=11 start children=1
        SCROLL-MULTI!! RCTScrollView tag=238 children(2)=[#anchor#NEW,RCTScrollContentView#240]
        mirror.set (update) node=6 tag=234 view=RNSScreenContentWrapper
        mirror.set (update) node=7 tag=230 view=RNSScreen
        mirror.set (update) node=4 tag=4   view=RNSScreenStack
        commit root=11 reconciled changed=true
        commit root=11 incremental created=0 cloneProps=3 cloneChildren=16 reused=40 walk=3.4ms",
  dirty_marking_works: "the same build answers changed=false seventeen times in a row at startup",
  cost: "3.4 ms of a 16 ms frame burns BEFORE the list does anything ⟶ the VirtualizedList is the
         first thing to miss its budget ('dies after ~4 sections'), and every list-aimed fix only
         moved the threshold",
  lead_unconfirmed: "RCTScrollView holds TWO children — an anchor with no id (#anchor#NEW) beside
                     the content view. An anchor re-created each frame IS a structural change each
                     frame, which would explain changed=true + cloneChildren=16 exactly.
                     Probe: filter SCROLL-MULTI and watch whether the anchor's node id CHANGES
                     between frames (growing = really re-created, chase whoever creates it during
                     change detection; stable = the anchor is fine, the dirtying is elsewhere)",
  ruled_out: "anchorHostStyle — reads node.props.style, allocates nothing, so the ngDoCheck signal
              poll cannot be dirtying anything"
}

§21e_checkalways_mechanism := {
  source_verified: ".vendors/angular 22, read not inferred",
  view_construction_263: "packages/core/src/render3/view/construction.ts:263 —
                          let flags = LViewFlags.CheckAlways;
                          if (def.signals)     flags = LViewFlags.SignalView;
                          else if (def.onPush) flags = LViewFlags.Dirty;",
  change_detection_464: "packages/core/src/render3/instructions/change_detection.ts:464 —
                         refreshes every CheckAlways view on every GLOBAL tick ⟶ a component that
                         is neither signal-based nor OnPush is re-checked whenever anything
                         anywhere schedules a tick",
  our_counts: "adapters/angular/src/primitives/index.ts — 15 components, OnPush: 0
               (ViewHost, TextHost, ImageHost, ScrollViewHost, ScrollContentView, TextInputHost,
                SwitchHost, SafeAreaViewHost, ModalHost, …) i.e. EVERY <View> and <Text> an app
               renders. Adapter-wide: 48 components, 27 OnPush, 74 ngDoCheck sites — and ngDoCheck
               runs during the PARENT's refresh even for a view that would be skipped",
  consequence: "one tick costs a walk of the screen's whole primitive tree, not of what changed.
                The on-screen frame-rate meter writes a signal per frame ⟶ one Global tick per
                frame ⟶ full primitive walk ⟶ any prop touched ⟶ engine commit ⟶ Fabric mount
                instructions ON THE UI THREAD. Other adapters repaint one component for the same
                instrument",
  device_numbers_2026_08_19: "Angular alone drops the UI thread to 1-4 fps (others pin 60 in every
                              test), alone drops JS to ~8 fps, alone costs 4 UI / 21 JS frames on
                              a screen change, alone starts at 250+ MB (React 120-170,
                              Vue 110-170, Svelte 90-150)",
  ram_is_background_not_evidence: "NativeScript publishes ~100 MB for a BLANK NativeScript-Angular
                                   app (~90 with webpack+AOT) — Angular on a custom renderer
                                   starts heavy by itself",
  order_matters: "step 1 'primitives leave the CheckAlways set' is NOT a mechanical one-liner per
                  component: SymbioteStyleInputDirective and both ngDoCheck polls exist precisely
                  because [style]/class do NOT dirty a view, and CheckAlways is what currently
                  covers that gap. Give style/class a signal path FIRST",
  do_NOT_blanket_OnPush: "angular.dev/guide/zoneless — 'library components that dynamically host
                          arbitrary user components should avoid OnPush to ensure default-strategy
                          child components refresh properly' ⟶ binds Stack/Tab/Drawer (they create
                          screen components through ViewContainerRef); does NOT bind the primitives
                          (ng-content content belongs to the parent's view and is checked with it)"
}

§21f_signals_proposal := {
  status: "owner's standing proposal 2026-08-19, raised after the fifth serious regression, again
           around VirtualizedList — a proposal, NOT a decision",
  evidence: "both defects of §21c were the same shape — BROADCAST BECAUSE THE CODE CANNOT KNOW WHO
             DEPENDS ON A VALUE. recordHeaderLayoutY rebuilt all N when exactly one neighbour reads
             it; reconcileStickyRecords rebuilt all N per insert when none read anything new. Each
             was fixed by hand-deriving the real dependency; a computed() derives it structurally,
             so the bug has nowhere to live",
  third_witness: "shared.ts's `inputsRevision.update(r => r + 1)` — a hand-rolled invalidation
                  counter for memoized prop bags — plus two ngDoCheck POLLS (anchor style, attach
                  retry) that exist because nothing notifies",
  will_NOT_fix: ["the projection controller's imperative insertBefore/removeChild/appendChild
                  re-parenting, and with it the silent 'append to the end' degradations (ordering,
                  not reactivity)",
                 "the per-frame idle commit — if anything MORE direct under signals, since
                  'updating a signal read in a template' is the first entry in zoneless's own list
                  of what schedules a tick, and a per-frame frame-rate meter is exactly that"],
  sell_as: "removes a recurring class of invalidation bug",
  never_sell_as: "fixes the frame budget"
}

§21g_ecosystem_precedent := {
  searched: "2026-08-19, before touching the projection path again",
  finding: "NOBODY wraps projected children by index",
  cdk: "cdkVirtualFor owns a ViewContainerRef + TemplateRef and creates the views itself; identity
        is the ABSOLUTE index, never the window position —
        cdk/scrolling/virtual-for-of.ts:
          _updateContext() { view.context.index = this._renderedRange.start + i; }  // UPDATE, not recreate
          trackBy = (index, item) => fn(index + this._renderedRange.start, item)
        plus a recycling view cache (cdkVirtualForTemplateCacheSize, default 20)",
  rx_angular: "rxVirtualFor states the same goal — 're-use views instead of re-creating them'",
  sticky_is_UNSOLVED_there: ["angular/components#11621 open since 2018",
                             "#14833 — position:sticky inside the viewport 'works for a while then
                              breaks', which is our own symptom in a browser"],
  proposed_api_there: "<cdk-virtual-scroll-sticky> — a separate projection slot, i.e. the pinned
                       header rendered OUTSIDE the virtualized stream"
}

§21h_three_fixes_applied_and_FALSIFIED := {
  fix_1: "identity is the CHILD, not the position — `record.stickyIndex !== childIndex` used to
          destroy() + new StickyProjectionWrapper, discarding createInitialStickyState() (the
          measured layout) and costing a native round trip per window step (restoreDefaultValues +
          dropAnimatedNode out, a fresh interpolation + AnimatedProps in). Now setChildIndex(next)
          feeds the SAME state machine and the reducer's range guard decides what rebuilds",
  fix_2: "one reconcile per change-detection pass, flushed at RendererFactory2.end(). It used to
          run per projected mutation: O(M²) to mount M children, and — worse — a windowed list
          feeds the controller through TWO channels landing at different moments of one pass
          (children via the renderer, stickyHeaderIndices via an @Input → update()), so at least
          one walk always matched NEW children against OLD indices",
  fix_2_why_NOT_a_microtask: "engine mutations only markDirty, the commit is microtask-coalesced by
                              the surface, and a reconcile queued AFTER that commit mutates a tree
                              nobody commits again — six tests went red proving it. end() runs
                              inside ApplicationRef.tick, so it precedes every microtask of the pass",
  fix_3: "wrapper inserted AT its slot, computed from `records`. wrapRecord read the position off
          record.child.parent, so a child not sitting directly in the content had no slot and the
          wrapper was appended to the END — a silent reordering that compounds with scroll distance.
          CDK carries the same warning at its own insert site (an extra anchor node between insert
          and move throws the move off) and this tree is full of anchors",
  verified: "tsc 0, eslint 0, prettier clean, 193 Angular tests / 3336 repo-wide; new
             sticky-wrapper-reuse.test.ts, both cases mutation-verified",
  FALSIFIED_ON_DEVICE: "all three changed NOTHING — owner rebuilt and re-ran, 'без изменений
                        вообще'. The projection controller is NOT the cause of the frame drops, the
                        blank cells, or the 4-section limit, and neither is anything sticky-specific:
                        three independent defects removed with zero observable effect. KEEP the
                        fixes (real defects, mutation-tested) but do NOT re-open this file hunting
                        the regression, and do NOT sell them as a performance fix",
  also_died_with_them: "a per-frame render hook — there is no afterRender / afterNextRender /
                        requestAnimationFrame anywhere in adapters/angular/src or
                        packages/navigation/src/angular"
}

§21i_test_harness_traps := {
  trap_1: "fabric.find CANNOT prove absence — it searches `created` (every node ever createNode'd
           this run), NOT the committed tree, and a detached node is still returned WITH the stale
           children it had at creation. 'The wrapper is GONE' can never pass through it, and 'it is
           the same node' can pass on a leftover. Walk fabric.appRoot() instead",
  scope: "the other sticky tests in scroll-view/ still use fabric.find and are weaker than they read",
  trap_2: "the wrapper NODE is not what gets recreated — wrapRecord creates it and it survives
           either way, so asserting on its `tag` PASSES under a mutation that fully reverts fix 1.
           What a recreated wrapper loses is its measured layout, which the reducer prints
           (`STICKY[reducer y=<layoutY>]`). Assert on that, the way
           sticky-header-layout-fanout.test.ts asserts on dispatch counts"
}

§21j_open := {
  next_measurement: "proposed three times, still NOT run, costs nothing and needs no rebuild: take
                     the frame-rate meter off the screen (or open a screen without it) and watch
                     for `commit root=… changed=true` at idle.
                       stopped       ⟶ the instrument is the load, and §21e's CheckAlways walk is
                                       the mechanism that turns one per-frame signal write into a
                                       whole-screen traversal
                       still running ⟶ change detection is exonerated too, and what is left is
                                       #anchor#NEW from SCROLL-MULTI!!
                     Run this BEFORE writing any more code against these symptoms",
  fix_4_not_done: "wrappers still live inside the window and their count still equals the sticky
                   headers on screen; position-as-identity is defanged, not gone. The ecosystem's
                   answer (§21g) is ONE pinned header rendered above the list, its CONTENT changing,
                   with the virtualized stream unaware of it ⟶ no per-window re-wrapping, no
                   re-parenting, no two-channel race left to lose",
  benchmark_screen_built_at_app_start: "the 200-header ScrollView is instantiated while the MENU
                                        screen is displayed — the app-start log shows
                                        `BenchmarkScreen.js … createElement StickyScrollViewBlock`
                                        right after the menu mounts, and the sticky sweep runs on a
                                        screen the user never opened. That is the navigator's screen
                                        creation, not the scroll view; the fan-out fix removes most
                                        of its cost but not the fact that it runs",
  headless_cannot_exercise_this: ["a uniform windowed list never reproduced any drift",
                                  "a SectionList harness rendered ZERO rows while its assertions
                                   passed vacuously (the loop `continue`d every iteration) until the
                                   trace was printed",
                                  "deferring the ScrollView behind @if to force the ordering never
                                   rendered the ScrollView at all"]
    ⟶ diagnose this class on device from the dlog seams; a green headless run does NOT mean sticky works
}
```
## Prior art

- **NativeScript-Angular** — nearest relative (Angular on native iOS/Android via a
  custom renderer) but compiles via `@ngtools/webpack` + webpack; transfer the idea,
  not the code (Metro ≠ webpack).
- **`angular/react-native-renderer`** — Google's own abandoned ~2016 "Angular → React
  Native" experiment. Conceptual twin, but its compilation approach is pre-Ivy and
  dead; renderer shape only, not worth vendoring.

## §19. DrawerLayoutAndroid — REMOVED entirely (2026-07), do not re-add casually

```
§19_drawer_removed := {
  why_it_existed: "parity coverage only — proving the adapter seam can drive an arbitrary
                   third-party native ViewManager, not just SymbioteNative's own primitives.
                   Demoed ONLY in examples/angular/App.ts, never in the React/Vue canaries",
  crash_1: "`ColorValue: the value must be a number or Object` — a genuinely fixable COLOR_PROPS
            gap, since reverted with everything else",
  crash_2: "`The Drawer cannot have more than two children` — ReactDrawerLayoutManager.kt, RN's OWN
            native Fabric mounting layer, not our JS engine. SurfaceMountingManager.kt itself admits
            'we don't know /why/ this happens yet' about the underlying re-add pattern",
  mitigation_tried: "memoization — headless could neither confirm nor deny it fixed anything, since
                     the JS-side shadow tree was already provably correct; the bug lived entirely in
                     native code this project does not control",
  decision: "DrawerLayoutAndroid is DEPRECATED in React Native core itself (ecosystem moved to
             @react-navigation/drawer), Android-only, undemonstrated outside the Angular example,
             and was the one thing blocking real-device Android testing ⟶ dropped entirely rather
             than chase an unfixable native bug",
  removed_from: ["adapters/{react,vue,angular}/src/components/",
                 "core/components/src/{state,view}/",
                 "examples/angular/App.ts (imports, template, handlers, @ViewChild, styles)",
                 "examples/angular/e2e/probe.test.ts",
                 "the COLOR_PROPS entries it needed in core/engine/src/commit.ts"],
  durable_rationale: "root CLAUDE.md carries the one-line version",
  if_needed_again: "wrap @react-navigation/drawer (or a maintained equivalent) through
                    <third_party_rn_packages_are_react_only> — do NOT revive this RN component"
}
```

## §21. `ANCHOR_HOST_COMPONENTS` §11's sequel: being listed does not forward `class`

Being listed in `ANCHOR_HOST_COMPONENTS` (§11) gets a composed component a harmless anchor host.
That anchor needs a SECOND, separate step. Angular offers no `@Input()` interception hook for
`class="…"` / `[class.x]` / `[ngClass]` the way it does for `[style]`, so a class at a composed
component's OWN use site always resolves onto its anchor (`routeProp`'s `commitClassStyle` writes
the resolved style straight to `anchor.props.style`) and NEVER reaches the real inner `symbiote-*`
primitive one level down — unless the component reads it back off its own anchor and merges it.

**Fix pattern** — inject the component's OWN `ElementRef` (its anchor host, NOT a `@ViewChild`
into its inner primitive) and merge anchor style FIRST, so an explicit `[style]` input still wins
via `flattenStyle`'s later-wins collapse:

- Loosely-typed target (a `Record<string, unknown>` hostProps bag, or `AnimatedComponentBase`'s
  untyped `style: unknown`) → `reduced['style'] = [anchorHostStyle(this.elementRef), reduced['style']];`
- `AnimatedImage` is the exception: `resolveImageProps(reduced)` builds its OWN
  `[dimensionStyle, style]` array from `width`/`height`, so merging into the INPUT double-nests.
  Merge into the OUTPUT instead.
- Strictly-typed target (an inner primitive's real `@Input() style: IStyleProp<Concrete>`, e.g.
  `Button` → `TouchableOpacity`) → `anchorStyleProp<T>(elementRef)`, a generic runtime type-guard,
  no `as` cast. **Pass the generic explicitly** (`anchorStyleProp<IViewStyle>(…)`) — it does NOT
  infer from an array-literal call site, and a wrong result types as `unknown` that only fails
  under a REAL `ngc` AOT build, never under plain `tsc --build`.

```
§21_anchor_class_not_forwarded := {
  no_compiler_signal: "skipping the merge produces NOTHING — `tsc --build` stays green and even a
                       real ngc strictTemplates AOT build stays green, because this is a runtime
                       data-flow gap, not a template binding error",
  device_confirmed_2026_07: "AnimatedView / AnimatedText / AnimatedImage / AnimatedScrollView
                             (modules/animated/create-animated-component.ts), Button
                             (components/button.ts) and ScrollViewStickyHeader
                             (components/scroll-view/sticky-header.ts) were all correctly LISTED
                             but never merged",
  symptom: "a scroll-linked header-fade demo in examples/angular/App.ts — class='box-list160' on an
            <AnimatedScrollView> (meant to give a fixed height + overflow clipping) never reached
            the real scroll view, so the box had NO height/overflow constraint: every row rendered
            fully stacked, zero clipping, zero scrolling. Not cosmetic — functionally
            non-scrollable",
  audit: "4 parallel agents swept every other ANCHOR_HOST_COMPONENTS entry (ActivityIndicator, the
          whole Pressable/Touchable family, the whole list family, Switch, TextInput, ScrollView,
          Image, ImageBackground, InputAccessoryView, KeyboardAvoidingView, Modal, RefreshControl,
          SafeAreaView) — all already correct; only those 3 newer spots had the gap.
          StatusBar is N/A (template: '', purely imperative, no visual host)",
  helper_location: "anchorHostStyle / anchorStyleProp / its isStyleValue<T> guard live in
                    adapters/angular/src/primitives/shared.ts — they used to be duplicated
                    un-exported inside touchable.ts and were moved when Button became a second
                    consumer. Do not re-duplicate a third time",
  button_is_parity_not_scope_creep: "RN's stock Button accepts no style prop, but this project
                                     supports styling Button via className/class regardless —
                                     adapters/react/src/components/button.ts declares its own
                                     className field for exactly this and forwards it to
                                     TouchableOpacity",
  cross_adapter_scope: "Angular-ONLY, caused by the anchor-host indirection. React (className into
                        a plain ...rest spread) and Vue (class auto-fallthrough, or a manual
                        attrs.class / normalizeVueAttrs forward when inheritAttrs:false) render a
                        composed tree with no anchor node — both audited fully clean. Do NOT port
                        this checklist to them",
  how_to_verify_a_future_fix: "tsc --build AND ngc -p both stay green with OR without the bug. The
                               only proof is a real device render of a class-styled instance, or a
                               headless test asserting the COMMITTED node's resolved style contains
                               the class-derived value (scroll-view-class-style.test.ts's pattern)"
}
```

## §22. `injectX()`, not `useX()` — and imperative APIs are plain methods

Three Angular conventions this codebase follows, all confirmed against Angular sources
and the Angular team:

- A standalone function calling `inject()` internally is named `injectX()`, never
  `useX()` — the name must signal the injection-context requirement.
  `packages/navigation/src/angular/injectors/` is the reference shape.
- A component's imperative API is plain public methods on the class, never a nested
  `handle` object (that is a React `useImperativeHandle` habit; an Angular component IS
  a stable instance).
- `this` inside a component's own template is legal and type-safe (`ThisReceiver` in the
  compiler), so `[someInput]="this"` is idiomatic.

Sources, quotes, and the `Stack`/`Tab`/`Drawer` refactor detail:
`references/injection-conventions.md`.

## Reference

- Vendored Angular source: `.vendors/angular` (= `~/projects/vendors/angular`, git
  submodule, shallow `main` @ v22-next — for reading the mechanism; version-stable
  for ngtsc/linker). Key files:
  - Stage B linker Babel plugin: `packages/compiler-cli/linker/babel/src/{babel_plugin,es2015_linker_plugin}.ts`
  - Stage A ngtsc: `packages/compiler-cli/src/ngtsc`, `packages/compiler`
- Renderer seam reference: `wolf-tui/packages/angular/src/renderer/*` and
  `src/bootstrap.ts` (no-DOM bootstrap; note its private-CD hack is obsolete for us).
- Engine mutation API the seam targets: `core/engine/src/node.ts`
  (`createElement`/`createRawText`/`createAnchor`/`appendChild`/`insertBefore`/
  `removeChild`/`routeProp`/`setEventListener`/`setText`), surface
  `requestCommit` in `core/engine/src/surface.ts`.
- Vue twin to mirror: `adapters/vue/src/{renderer,render,index}.ts`.
- Commit-timing: the `vue-adapter-reactivity` skill (Gotcha 2 / `whenCommitted`),
  or `angular-adapter-change-detection` for the Angular-specific follow-on.
- Build pipeline: `angular-adapter-build`. Change detection: `angular-adapter-change-detection`.
  Events: `angular-adapter-events`. Portal/tunnel/AppRegistry: `angular-adapter-portal`.
  Lists/ScrollView: `angular-adapter-lists`.
