---
name: symbiote-parity-check
description: "Symbiote parity-check workflow — verify a component reaches FULL feature-parity across adapters, the P0 'proven by a parity check' gate. Run it as the LAST phase of symbiote-add-component, or standalone to audit an existing component for drift. React is the REFERENCE surface (M1/M2 done, widest prop-edge coverage). Method: (1) enumerate X's complete surface on React — every prop, event, imperative method, and platform (.ios/.android) branch. (2) prop-by-prop DIFF against X on Vue (and each future adapter); any prop/event/method present on React but missing on the other is a P0 gap, NOT a follow-up. (3) confirm parity is STRUCTURAL — the shared half (reducer + renderX + prop resolution) lives in @symbiote-native/components and both adapters call it, rather than each re-implementing the surface (a hand-copied surface that happens to match today will drift). (4) confirm the agnostic public prop type (ISwitchProps etc.) is RE-EXPORTED from @symbiote-native/components by every adapter, never redeclared. (5) smoke both adapters headless (vitest, ADR 0025) + the co-located component tests. Trigger on parity verification, component audit, 'is X at parity across adapters', or finishing an add-component task."
---

# Symbiote parity-check — proving full feature-parity

P0 (`<adapters_reach_full_feature_parity>`): every component ships at full
feature-parity across ALL adapters, and "add component X to adapter Y" is DONE
only when X on Y matches X everywhere else — **proven by a parity check**, not
asserted. This skill is that check. It is the final phase of
`symbiote-add-component` and a standalone drift audit.

## 1. React is the reference surface

React is the validated, widest adapter (M1/M2 done, the reference prop-edge
coverage). Parity is always measured **against React**: a prop/event/method that
React's X exposes and another adapter's X does not is a gap to close, not a
difference to accept.

## 2. The diff — enumerate, then compare

```
STEP 1  Enumerate X's full surface on React:
        - every PROP            (incl. platform-only ones)
        - every EVENT           (onChange, onValueChange, responder events…)
        - every IMPERATIVE METHOD on the ref (focus/blur/measure/setNativeProps/scrollTo…)
        - every PLATFORM BRANCH (.ios.ts vs .android.ts — command names, prop names, defaults)

STEP 2  For Vue (and each other adapter), confirm each item is present and behaves the same.
        Missing on the other adapter → P0 GAP (close it now, do not defer).

STEP 3  Reductions are violations: a 'minimal' / 'basic' / 'partial' / 'stub' port is FORBIDDEN.
```

Concretely for Switch: `value`, `onValueChange`, `onChange`, `disabled`,
`trackColor`, `thumbColor`, `ios_backgroundColor`, `style`, the accessibility/aria
fields, the snap-back command, AND the iOS/Android prop-name + command split — all
present on both adapters.

## 3. Structural, not hand-copied

Matching surfaces today is necessary but not sufficient — two hand-copied
implementations drift. Parity must be **structural**:

```
✓ the shared half (reducer + renderX + prop resolution) lives ONCE in @symbiote-native/components
✓ each adapter calls it and supplies ONLY lifecycle + the descriptor bridge
✗ an adapter re-implements state or render for a component that already exists in core/components
  → this is the exact bug the three-layer split exists to prevent (<components_split_logic_view_lifecycle>)
```

So the check includes: does X's logic/view actually come from
`core/components/src/{state,view}/`, or did the adapter grow its own copy?

## 4. Prop-type re-export check

The agnostic public prop type is defined ONCE and re-exported, never redeclared:

```
✓ adapters/react/src/components/switch/shared.ts:  export type { ISwitchProps } from '@symbiote-native/components'
✗ a second `interface ISwitchProps { … }` inside an adapter  → duplication bug
```

A per-adapter type (children/ref-bearing: `IViewProps`, `IPressableProps`) is
expected to be separately declared — that's by design, not a gap
(`symbiote-file-layout` §4).

## 4b. Barrel parity - the passthrough facade, and the drift it hides

Roughly HALF of every adapter's public surface is names it re-exports verbatim from
`@symbiote-native/engine` / `@symbiote-native/components`. Measured 2026-08-15:

```
adapter   total names   of which shared passthrough
react        201                 89
vue          226                109
angular      227                 91
svelte       223                118
```

**Keep the facade.** The re-export buys two things. (1) One import root: an app moving off RN
swaps `'react-native'` for `'@symbiote-native/<fw>'` on one line instead of splitting ~40 names
across two specifiers it would have to memorise. (2) Freedom to move the implementation -
`Alert`/`Share`/`Dimensions` used to live inside `@symbiote-native/react` and moved to the engine
with no app noticing, and the boundary still moves in BOTH directions (`StatusBar` sits in the
same alphabetical list of "plain utilities" but has a real declarative half in Svelte, an
`$effect`, and a 3.7K file in Vue).

**One argument for the facade is FALSE, do not repeat it:** it does not hide the engine from the
app's manifest. `@symbiote-native/engine` is a peerDependency of every adapter and is already a
direct `dependencies` entry in all five example apps. It hides engine from app CODE only -
exactly the split `<react_native_is_an_explicit_top_level_peer>` already states for `react-native`.

**What IS redundant: the intermediate stub file.** React and Svelte each kept a
`src/modules/<name>.ts` whose entire body was `export { X } from '@symbiote-native/engine'` - 16
and 15 files. Vue and Angular re-export the same names straight from the barrel and prove the hop
is unnecessary. All 31 were deleted 2026-08-15 with the public surface byte-identical
(react 201->201, svelte 223->223). Do not reintroduce them: a passthrough belongs in the barrel.

**The drift the facade hides is real and recurring.** A missing re-export is NOT a type error,
so `tsc` is blind to it and it only surfaces when an app imports the name and cannot find it.
`PanResponder` was absent from Svelte's barrel until 2026-08-12; the test below then found 22
more of the same shape, all closed 2026-08-15 (barrel totals react 201->219, vue 226->232,
angular 227->248, svelte 223->236). What they were:

- Angular carried the VALUES but not their TYPES: `IViewStyle`/`ITextStyle`/`IFlex*`,
  `IPlatform*`, `INativeViewConfig*`, `IAccessibility*`, `IResponderProps`, `IPressState`. It
  takes props as `@Input()`s, but an app still needs these to type a style object or a
  `Platform.select` spec.
- The app-entry seams had split up: `setNativeViewConfigSource` was in all four,
  `setColorProcessor` and `setDeviceEventSource` were not. The three travel together.
- `dlog`/`isDebug` reached two adapters only, while `examples/vue-tsx` already imports `dlog`
  FROM THE ADAPTER, so on the other three that path did not work at all.
- Agnostic component-detail types, each having reached 1-2 barrels: `ICellLayout`,
  `ISeparatorProps`, `ISeparators`, `IModalOrientationChangeEvent`,
  `IPressableAndroidRippleConfig`, `IEnterKeyHint`, `IInputMode`, `ISubmitBehavior`,
  `ITextInputSelection`, `IImageStatics`.

**Two traps found while closing them, both worth re-reading before the next sweep:**

1. **A name-level parity check has false positives.** `ITextInputProps` looked like a gap in
   Angular, but React and Vue DECLARE their own (`ITextInputBaseProps & { className?: string }`)
   rather than re-exporting the shared one - the per-adapter half of
   `<prop_types_split_agnostic_vs_per_adapter>`, not drift. Before "closing" a gap, check whether
   the other adapters re-export the shared type or redeclare it: parse the local file the barrel
   points at and look for a `type`/`interface` DECLARATION of that name. Only `IImageProps`,
   `ITextInputProps` and `IButtonProps` are redeclared this way today (react + vue).
2. **`flattenStyle` was removed from Angular, not added to the other three** - reversing a
   deliberate 2026-07-01 decision that exported it "for advanced users". It is the RAW collapse;
   the public path is `StyleSheet.flatten`, which is the same collapse PLUS the registered style
   preprocessors, so an app reaching for `flattenStyle` silently skips them. Nothing imported it
   from the adapter (`packages/navigation`'s Angular drawer takes it from the engine directly).

`tests/adapter-barrel-parity.test.ts` is the ratchet. It parses the barrels as SOURCE (most
drifting names are types, so a runtime `Object.keys(await import(...))` would see none of them),
computes every shared name that some adapters export and others don't, and compares that set for
EQUALITY against `KNOWN_GAPS`. Equality, not containment, is the point: adding a shared name to
one barrel and forgetting the rest fails with the adapters named, and closing a gap without
deleting its entry also fails - so the list cannot rot into an allowlist that permits new drift.
When you add a shared name to one adapter, add it to all four in the same commit.

**In `packages/*` the same duplication first had a cheaper fix: `export * from '../core'`.** Each
package ships `src/{core,react,vue,svelte,angular}/index.ts`, and the framework barrels used to
list the ENTIRE core surface by name - 4 copies to keep in sync, per package. 15 packages already
used `export *`; the 6 that didn't (battery, brightness, keep-awake, localization, network,
screen-orientation) were converted 2026-08-15, −276 lines, surfaces verified identical against
`git show HEAD:` and `ngc` green (the star survives into the AOT `.d.ts`/`.js`). This works
because the package's `"."` export already points at core, so nothing is being newly exposed.

Two packages deliberately expose a SUBSET of core and must NOT be converted blindly -
`sensors` withholds 21 names (the `Accelerometer`/`Gyroscope`/`DeviceSensor` classes) and
`splash-screen` withholds 6 (`HideAnimationController` and the internals `useHideAnimation`
wraps). `navigation` and `slider` are not passthrough at all (slider's barrel carries the
load-bearing `import '../register'` side effect - see the Metro `inlineRequires` note in
CLAUDE.md). Check what a barrel omits before starring it.

**2026-08-17: that fix was itself incomplete for one sub-case, and got superseded there —
`export * from '../core'` is still correct wherever a physical file must exist for some other
reason, but for a subpath that needs NOTHING beyond core, not even that one line should exist.**
The unit of the decision is one adapter SUBPATH, not the whole package - ask whether it is
genuinely and PERMANENTLY stateless (plain sync/async free functions, enums, constants; no
per-instance state, no event/subscription stream, so categorically nothing a hook/composable/rune
could ever wrap - the distinguishing feature vs. `sensors`' real hook is exactly that
subscribable stream). When it is, delete the physical `src/<fw>/index.ts` and point the subpath
directly at core in both `exports` and `publishConfig.exports`:

```json
"exports": {
  ".": "./src/core/index.ts",
  "./vue": "./src/core/index.ts",
  "./react": "./src/core/index.ts",
  "./svelte": "./src/core/index.ts",
  "./angular": { "types": "./build-ngc/angular/index.d.ts", "react-native": "./build-ngc/angular/index.js", "default": "./src/angular/index.ts" }
}
```

(`publishConfig.exports` mirrors it: `./react`/`./vue`/`./svelte` get the exact value `.` has,
`{ "types": "./build/core/index.d.ts", "default": "./build/core/index.js" }`.) 12 packages were
converted this way 2026-08-17: `sharing`, `sms`, `store-review`, `web-browser`, `local-auth`,
`secure-store`, `device`, `crypto`, `standard-web-crypto`, `system-ui`, `application`, `haptics`.
`standard-web-crypto`'s three barrels each also had `export { default as webCrypto } from
'../core'` (`export *` never forwards a default export) - that alias moved into
`src/core/index.ts` itself once, instead of surviving as three identical copies.

`./angular` is NEVER folded into this, categorically, regardless of statelessness - it builds via
a separate ngc/AOT pipeline (`build-ngc/`, `symbiote-release-publishing`) with its own tsconfig
and linker step, so the export target structurally cannot be a bare path like the other three.
Keep its own conditional-exports block and its own `src/angular/index.ts` even when that file's
content is also just a re-export.

The same "do NOT convert blindly" exceptions above still gate this - a subpath that withholds
part of core, carries a load-bearing side effect, or adds real per-framework lifecycle
(a hook/composable/rune/service subfolder for that adapter) keeps its physical file. This is also
why "drop all framework subpaths everywhere and make every consuming app hand-write its own
wrapper" is NOT the right generalization: for the hook/composable/rune-bearing tier, collapsing
the subpath onto app code would mean every consumer re-implements the same subscription/lifecycle
logic - exactly what `runtime_modules_layering` / `components_split_logic_view_lifecycle` exist to
prevent by centralizing it once in the SDK. Only the genuinely-stateless tier gets the direct-alias
treatment; the lifecycle-bearing tier keeps the subpath-plus-physical-file pattern.

## 5. Smoke

```
pnpm test                        vitest headless — the co-located X tests on both adapters (ADR 0025)
  state/X.test.ts                reducer + predicates (framework-free)
  view/render-X.test.ts          Descriptor snapshot
  components/X/X.test.*          per-adapter lifecycle (React + Vue + Angular)
detox (device/sim)               anything needing a real Fabric tag — native commands, autoFocus,
                                 sticky headers (the headless smoke CANNOT prove these; see
                                 vue-adapter-reactivity §2 — a missing tag is green headless, dead on device)
```

A native-driven feature green in vitest but untested on a simulator is NOT proven
at parity — the async-commit-timing class is invisible headless.

Run the detox/simulator leg against `examples/<app>`.

## 6. Verdict

```
PARITY        every React prop/event/method/platform-branch present + structural + re-exported + smoke green
PARTIAL       enumerate the EXACT missing items → they are the remaining work (P0, not a follow-up)
DRIFT         surfaces match but logic/view is hand-copied in an adapter → extract to core/components
```

## Differential input trace — when a bug reproduces on ONE adapter only

A component whose logic lives in `@symbiote-native/components` (a reducer + `renderX`) but
misbehaves on exactly one adapter CANNOT be broken in that shared logic — every adapter runs the
same bytes. The defect is necessarily in what that adapter FEEDS the shared layer. Device logs are
the wrong tool here and actively mislead: they show the reducer emitting sane values (because it
is sane), so reading them in circles is the predictable failure mode.

Instead write a **differential parity test**: mount the SAME scenario through the broken adapter
and through React (the reference), wrap the shared entry point to record every `(action, inputs)`
it receives, and diff the two traces. The divergence localizes the bug to a line.

Reference implementation:
`adapters/svelte/src/components/virtualized-list/sticky-collision-parity.test.ts`.

Mechanics that matter (each one cost a debugging round when got wrong):

- **One `vi.mock` covers both adapters** — they import the shared function from the same specifier.
  Use `vi.hoisted` for the trace array (`vi.mock` is hoisted above imports), and `importOriginal`
  so the real implementation still runs.
- **Identify each instance by object identity, not by a state field.** Keying the trace by
  something like `layoutY` merges every instance that starts at 0 into one bucket and hides the
  divergence. Use a `Map<stateObject, id>`, and RESET it per adapter so ids line up.
- **Settle between steps.** React batches its updates; Svelte applies them fine-grained. Without an
  `await tick()` after each event the test compares scheduling, not behavior — the two trees will
  differ in cell count and every later assertion is noise.
- **Compare per-step snapshots keyed by instance, not raw call sequences.** Different reactivity
  granularity legitimately produces different numbers of calls; the semantic state after each step
  is what must match.
- **Prove the scenario is not vacuous.** Assert the REFERENCE adapter actually reaches the state
  under test (e.g. really establishes a collision point). A scenario where the feature never
  engages passes trivially on both sides and proves nothing — this happened twice, first with a
  sticky index outside the initial window, then with one outside the viewport.
- Cross-adapter imports are legitimate HERE (the P0 invariant defines parity as a diff "against
  the reference adapter"), as a **devDependency** only — the published `files` surface is `build`.

Bug this found (2026-08-13, Svelte sticky headers): React hands its ScrollView
`renderedStickyIndices` — only headers currently mounted — while Svelte's VirtualizedList passed
the FULL section list into `nextStickyHeaderYFor`. Since `headerLayoutYs` is append-only, a header
kept receiving the stale `y` of a next header that had already unmounted, pinned itself against an
obstacle that no longer existed, and froze. One-line fix: filter the indices by the currently
mounted cells.

## Reference

- The P0 invariant: `<adapters_reach_full_feature_parity>`. The split it relies on:
  `<components_split_logic_view_lifecycle>`.
- Reference component surface: `adapters/react/src/components/switch/*` vs
  `adapters/vue/src/components/switch/*`; shared half in
  `core/components/src/{state,view}/switch*`.
- Building the component this check gates: `symbiote-add-component`.
- Native-only parity (tag-dependent features): `vue-adapter-reactivity` §2.
- Testing strategy: `.docs/decisions/0025` (vitest + detox).
</content>
