---
name: symbiote-rn-port-elimination
description: "!!! URGENT, DO THIS AS SOON AS A BRANCH IS FREE. Deleting SymbioteNative's 36 hand-rolled JS ports of react-native's own modules (core/engine/src/process-transform, process-filter, process-box-shadow, process-background-image, process-transform-origin, process-aspect-ratio, process-font-variant, style/flattenStyle, style-sheet, pan-responder, animated/{bezier,easing,value}, platform, dimensions, appearance, app-state, pixel-ratio, keyboard, back-handler, alert, vibration, settings, i18n-manager, toast-android, permissions-android, layout-animation, image-loader, report-error, accessibility-info, ...) in favour of importing the upstream module. Read BEFORE porting ANY further RN JS module by hand, before deciding whether an RN module is safe to import, and before starting the cleanup branch. Holds: the MEASURED transitive import closure of every candidate against react-native 0.86.0, split into three tiers (A: 12 modules at 1-5 files with zero native and zero React, delete the port; B: 13-38 files sharing one ~1.2k-LOC TurboModule/BatchedBridge floor, judgement call; C: 3 modules — Keyboard, AccessibilityInfo, Image.ios — that reach ReactNative/RendererProxy -> Renderer/implementations/ReactFabric-{dev,prod}, i.e. React's own Fabric renderer, and must STAY ported); the single import edge that decides tier C; the METHODOLOGY TRAP that makes a naive closure 194 files when the real one is 1 (Flow `import type` is erased — count value imports only); the real gate, which is not the graph but Vitest's inability to parse Flow (symbiote-rn-import-testability) and the Flow-strip transform that opens tier A, RUN AND GREEN 2026-09-10 (Hermes' parser, not @babel/preset-flow, plus four further blockers); the working precedent already in the repo (core/components/src/bootstrap imports react-native behind a package `exports` subpath) and why that trick does NOT extend to commit-path modules; and a re-runnable closure script for the next RN bump. This is CLEANUP and belongs on its OWN branch — never mix it into a perf/engine branch. Trigger on: 'port an RN module', 'why does core have no react-native imports', 'can we import RN's processX', 'delete our ports', 'RN import graph', 'Flow parse failure in vitest', an RN version bump, or any task that starts by copying a file out of .vendors/react-native."
---

# Deleting our hand-rolled ports of react-native's JS modules

> **!!! СРОЧНО — сделать как можно быстрее.**
> **!!! URGENT — start this as soon as a branch is free.**
>
> **It is CLEANUP, and it belongs on its OWN branch.** Do not mix it into an engine/perf
> branch: the diffs touch the same files (`core/engine/src/**`) but answer a completely
> different question, and reviewing "did we get faster" tangled with "did we delete the
> right 12 files" is how both get rubber-stamped. Measured and planned 2026-08-22 against
> `react-native@0.86.0`; not started.

## The finding

```
core/engine/src : 36 files whose own header says "JS-side port of RN's <X>"
core/engine/src : 0  imports from 'react-native'
```

Every one of those files is a hand-maintained reimplementation of a module that ships,
already written and already correct, inside the `react-native` we depend on. That is the
same failure the CSS parser had before it was rewritten around `lightningcss`: **corner
cases re-derived by hand instead of delegating to the implementation that already covers
them.** And it already bites — `process-transform/index.ts`'s own comment records a real
Android crash (`String cannot be cast to ReadableArray`). Its cause was the **absence** of the
JS parse, not a divergence: RN parses `transform` in JS only for a STRING (an ARRAY comes back
unchanged) and we forwarded a raw string. This file and root CLAUDE.md both said "diverged on
array input" until 2026-09-10 — the incident argues for importing upstream just as strongly, but
a wrong diagnosis sends the next reader auditing the array branch.

`react-native` is a `peerDependency` of `@symbiote-native/engine`, so at runtime it is
**always** present. We are paying for an isolation that does not exist in production.

## Read this before trusting any closure number: the `import type` trap

The first measurement said `processFontVariant` pulls **194 files / 57 690 lines**. The
whole file is 30 lines with one import, and that import is `import type`:

```js
// react-native/Libraries/StyleSheet/processFontVariant.js — the ENTIRE file's imports
import type {____FontVariantArray_Internal} from './StyleSheetTypes';
```

Flow types are erased at build time. `flattenStyle.js` is the same: 57 lines, both imports
type-only. **Count value imports only** — strip `import type` / `import typeof` — or every
number is fiction and the whole cleanup looks impossible. Same class of error as auditing
adapter parity with grep (`.claude/rules/adapter-parity-audit.md`): you measure mentions,
not reachability.

## DRIFT AUDIT, 2026-09-10 — tier A is not 12 deletes, it is about three

The tiering below measures REACHABILITY and still holds. What it does not measure is whether
upstream's behaviour is the one we want, and mostly it is not. **The divergences are one decision
taken repeatedly: upstream validates by `invariant`, i.e. it THROWS, and our commit path must never
throw.** Three port headers say so in their own words.

```
                        verdict            why
flattenStyle            KEEP               returns {} where upstream returns undefined -> 4 unguarded
                                           call sites TypeError on the swap (touchable.ts:202 fires
                                           on any un-styled Touchable press). And it shallow-COPIES
                                           where upstream returns identity — load-bearing: the
                                           preprocessor path mutates the result in place, and the
                                           style-registry hands one cached object to every node
                                           using a class. Both pinned by our own tests.
processAspectRatio      KEEP, ours is      upstream's length check lives only inside a __DEV__
                        BETTER             invariant, so RELEASE upstream turns '1/2/3' into a
                                           ratio of 1. Ours drops it. Deleting introduces a bug.
processTransform        KEEP the shell,    adopting upstream converts a dlog into a throw inside
processTransformOrigin  IMPORT the checks  commit, in Debug. But ours implements ~2 of upstream's
                                           ~12 validations, and the gap is real device risk.
processFontVariant      deletable          ours is upstream plus a total fallback; unreachable
                                           in-repo, a crash only for a downstream npm consumer
bezier + easing         deletable, one     algorithmically identical; drift is float32-vs-float64
                        commit             on the spline table, worst case 6e-7
PanResponder            after 3 steps      half the file is verbatim upstream. TouchHistoryMath's
                                           half is a clean delete with no conditions
report-error            not a port         upstream ErrorUtils.js is `export default global.ErrorUtils`
```

**So the win here is the opposite of a deletion: import upstream's validators, keep the
non-throwing shell.** We implement almost none of them. An `Animated.Value` inside a `transform`
array reaches Fabric as an opaque object where upstream redboxes; a `matrix` of the wrong length, a
`transformOrigin` of length != 3, `{perspective: 0}` and an unknown transform key forward silently.

### Two LIVE colour bugs, verified by hand

Neither is a swap risk. Both are wrong on device today, and importing upstream is the fix.

**1. A numeric colour is never rotated.** `processShadowColor` and its twins return the number
verbatim (`process-box-shadow/index.ts:46`, `process-filter.ts:59`,
`process-background-image/index.ts:88`), on a header comment asserting it is "already resolved". It
is not: `structured-style.ts` runs at prop-write time on the app's raw style, so the number is the
author's literal. Upstream's `processColor.js:47` range-checks it, then rotates `0xrrggbbaa` into
`0xaarrggbb` (and `|0` on Android).

```
boxShadow: [{ offsetX: 0, offsetY: 2, color: 0xff0000ff }]   // rrggbbaa = opaque red
upstream  0xffff0000   red
ours      0xff0000ff   native reads aarrggbb -> BLUE
```

No test passes a number to any of the three, which is why it survived. The colour STRING path is
already upstream's: `platform-color/index.ts` is an injected seam, and
`core/components/src/bootstrap/index.ts:60-66` wires RN's own `processColor` into it.

**2. `core/engine/src/animated/rgba.ts:38` cannot read a named colour.** It parses hex and
`rgb()/rgba()` and returns `undefined` for everything else; `animated/color.ts:45` turns that into
`DEFAULT_COLOR`, so an animated interpolation from `'red'` animates from BLACK. Upstream ships the
150-name table (checked: `normalizeColor('red')` is `4278190335`). No tier table lists this one,
because it is not named after an RN module.

**Two more bugs, unrelated to the port question**, both at
`core/engine/src/structured-style.ts:96`. `processTransform(value.filter(isRecord))` allocates, so
the byte-identical-reference contract declared in `process-transform/index.ts:8-12` and
`structured-style.ts:15-19` is false for every array `transform`, on the animated hot path. And
`.filter(isRecord)` drops entries upstream forwards (`['x', {scale: 2}]` loses `'x'`).

Method note worth more than any row: **a port's header is evidence of a decision, never evidence
that the decision still holds.** `pan-responder/index.ts` justifies its whole adaptation with "RN
has a global ResponderTouchHistoryStore and we do not". `core/engine/src/touch-history.ts` now
exists and attaches on all four native touch types, so that workaround is dead code on device.

## The three tiers, measured (react-native 0.86.0, value imports only)

### Tier A — import it, delete our port

1-5 files, **zero** native module access, **zero** React. Only externals are `invariant` and
`@react-native/normalize-colors`, both already in RN's own dependency tree.

```
files  LOC   upstream entry                            our port
    1    31  StyleSheet/processFontVariant.js          process-font-variant.ts
    1    57  StyleSheet/flattenStyle.js                style/index.ts
    1    66  StyleSheet/processAspectRatio.js          process-aspect-ratio.ts
    1   144  StyleSheet/processTransformOrigin.js      process-transform-origin/index.ts
    1    52  vendor/core/ErrorUtils.js                 report-error.ts (half)
    1   165  Animated/bezier.js                        animated/bezier.ts
    2   392  StyleSheet/processTransform.js            process-transform/index.ts   <- the Android crash
    2   416  Animated/Easing.js                        animated/easing.ts
    2   721  Interaction/PanResponder.js               pan-responder/index.ts       <- +TouchHistoryMath, that's all
    5   344  StyleSheet/processBoxShadow.js            process-box-shadow/index.ts
    5   462  StyleSheet/processFilter.js               process-filter.ts
    5   959  StyleSheet/processBackgroundImage.js      process-background-image/index.ts
```

The 5-file ones all pull the same small colour trio (`processColor`, `normalizeColor`,
`PlatformColorValueTypes`) plus `Utilities/Platform`. `PanResponder` at two files is the
most surprising row on the list — ours is a whole folder.

### Tier B — judgement call, one shared floor

13-38 files, 1.4-5.8k LOC, 3-7 native touchpoints, **no React**.

```
13  Utilities/Platform.ios · ReactNative/I18nManager · Components/ToastAndroid
14  Vibration/Vibration                       18  AppState/AppState
15  Utilities/Dimensions · Alert · Settings   19  Utilities/BackHandler.android
16  Utilities/PixelRatio · PermissionsAndroid 23  LayoutAnimation/LayoutAnimation
17  Utilities/Appearance                      34  Animated/nodes/AnimatedValue
                                              38  StyleSheet/StyleSheetExports
                                              38  Core/ReactFiberErrorDialog (+LogBox, `react` as an external)
```

The "native" part is the SAME ~1.2k-LOC floor under all of them —
`TurboModuleRegistry → NativeModules → BatchedBridge → MessageQueue → ErrorUtils /
Systrace / RCTDeviceEventEmitter`. It is not a per-module tax: the first module pays it and
every subsequent one is nearly free. Verified clean of the Fabric renderer:
`StyleSheetExports`, `AnimatedValue`, `LayoutAnimation`, `ReactFiberErrorDialog`.

Weigh per module against `<runtime_modules_layering>` and `<native_module_name_is_platform_specific>`:
some of these ports exist because we deliberately re-routed a platform branch, not because
we could not import. Check each port's header comment before deleting it.

### Tier C — STAYS ported. One edge decides it.

```
 51 files  34 986 LOC   Components/AccessibilityInfo
102 files  42 981 LOC   Components/Keyboard
107 files  42 519 LOC   Image/Image.ios
```

All three for the same reason, and it is one import hop:

```
AccessibilityInfo.js  →  ReactNative/RendererProxy.js  →  Renderer/implementations/ReactFabric-{dev,prod}.js
Keyboard.js  →  Utilities/dismissKeyboard.js  →  Components/TextInput/TextInputState.js  →  RendererProxy.js
Image.ios.js  →  ImageViewNativeComponent.js  →  Utilities/codegenNativeCommands.js  →  RendererProxy.js
```

`RendererProxy` is **React's own Fabric renderer**. Pulling it into a Vue/Svelte/Solid/Angular
bundle to call `Keyboard.dismiss()` is the exact thing this project exists not to do. Note the
tainted node in Keyboard's chain is `TextInputState` — which we had already ported by hand, so
the earlier judgement was right, it just had no recorded reason. It has one now.

**Before adding a module to any tier, run the path check for `RendererProxy` first.** It is the
single question that changes the answer.

## The real gate is not the graph — it is Flow in Vitest

`react-native`'s source is Flow. Vitest's Rolldown transform cannot parse it and dies with
`RolldownError: Parse failure: Flow is not supported` the moment a test **transitively**
imports it. That is the actual reason all 36 ports exist, stated in `fabric-props.ts`:
_"keeping shared free of a react-native dependency (and the headless harness working)"_.
Full constraint: **`symbiote-rn-import-testability`** — read it first.

**A working precedent already ships**, so this is not theoretical:

```jsonc
// core/components/package.json
{ ".": "./src/index.ts", "./bootstrap": "./src/bootstrap/index.ts" }
```

`core/components/src/bootstrap/index.ts` imports `react-native` AND a deep internal path
(`react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry`) and works, because the
subpath keeps it out of the main barrel and out of every test's import graph.

**That trick does NOT extend to tier A**, and this is the crux of the whole plan.
`flattenStyle` is called from `fabric-props.ts`, i.e. from the commit path, i.e. from the
main barrel that hundreds of tests import. It cannot be moved behind a subpath. So tier A needs
the other fix:

> **Step 0 ran 2026-09-10: all 12 tier-A entries import and run under Vitest. Tier A exists.**
> The transform is `vitest-rn-flow-transform.ts` + `vitest-rn-globals.setup.ts` beside this file;
> fold both into the real `vitest.config.ts`.

**`@babel/preset-flow`, prescribed above, does NOT work.** Babel's Flow parser is behind Flow's
syntax and dies on the conditional type at `flattenStyle.js:19` (`Missing semicolon`, pointing at
`extends`). RN compiles itself with Hermes' parser instead: put `babel-plugin-syntax-hermes-parser`
(`parseLangTypes: 'flow'`) ahead of `@babel/plugin-transform-flow-strip-types`. Both resolve today
only through react-native's own require, so a real landing declares them as devDependencies.

**Flow was one of five blockers, and each surfaced only once the previous was fixed:**

```
Flow syntax          Babel's flow plugin can't parse RN 0.86   -> hermes-parser swap
sibling packages     @react-native/normalize-colors is Flow    -> match @react-native/* too
                     too, and lives OUTSIDE react-native/
.ios.js resolution   Platform.js re-exports './Platform'       -> resolve.extensions ['.ios.js', ...]
                     Metro knows the order, Vite does not         (symptom: bare "Cannot find module")
import + require     RN mixes both in ONE file (PanResponder    -> hoist require() to import, with
   in one file       :15). Vite rewrites the imports and           `.default` interop: a namespace is
                     leaves the require, so Node loads the         not callable, but RN's own
                     next hop RAW -> "Unexpected token ':'"        `require('./X').default` unwraps once
globals              __DEV__, __fbBatchedBridgeConfig,          -> define + a setup file
                     __turboModuleProxy('PlatformConstants')
```

**Tier A's stated property is wrong: 3 of the 12 touch a native module at import time.**
`processBoxShadow`, `processFilter` and `processBackgroundImage` reach
`TurboModuleRegistry.getEnforcing('PlatformConstants')` through `processColor` ->
`PlatformColorValueTypes` -> `Utilities/Platform`. The setup file answers by name, so they import
fine, but the closure script flags native touchpoints by GREP and this hop is three files down a
colour helper. Tier B's floor is already paid by tier A's largest three.

A global `resolve.alias` stub is NOT an acceptable substitute: it would replace the real
implementation with a fake, which defeats the entire point of importing upstream.

## The plan

1. **Step 0 — LANDED 2026-09-10 in `vitest.config.ts`, full suite green (653 files, 5569 tests).**
   The reference copies beside this file are what shipped, minus two things they got wrong.

   `resolve.extensions` is NOT in the landed config. Putting `.ios.js` ahead of `.js` is repo-wide
   and would silently change which platform variant every `react-native-*` package resolves to in
   tests. Add a scoped `resolveId` if a module ever needs it; `processTransform` does not.

   **`define: { __DEV__ }` does not reach a module in the SSR pipeline** — the import succeeds and
   the first CALL throws `__DEV__ is not defined`, inside our own catch, so it surfaces as an empty
   result rather than a stack. `vitest.setup.ts` assigns the global instead. `true` is deliberate:
   RN gates its validation on it, and that validation is the half a port never reproduces.

   And `SHARED.plugins` is REPLACED, not merged, by a project that declares its own — the solid
   project did, so the transform has to be restated there or half the suite never sees it.

   The other branch's copy of this step said the opposite — that `.ios.js` now wins over `.js`
   repo-wide — because it was written from the PROBE, which did reorder `resolve.extensions`. The
   landed config does not, and the two accounts met in a merge. What shipped is above.

2. **Tier A — delete 12 ports.** One commit per module or small group, each keeping the port's
   existing tests pointed at the upstream implementation. Where our port deliberately DIVERGES
   from upstream, that divergence is either a bug to drop or a documented reason to keep the
   port — decide explicitly, in the commit message, never silently.
3. **Re-run the closure script** (below) and diff our ports against upstream 0.86 for drift. Any
   port whose behaviour has silently diverged is a latent device bug like the `processTransform`
   Android crash. This is worth doing **even if step 0 fails**, and it is the cheapest safety win
   in this whole skill.
4. **Tier B — module by module, not wholesale.** Land one first (`Platform` or `PixelRatio`) and
   measure the bundle delta on a real example app before continuing.
5. **Tier C — never.** Record the `RendererProxy` path beside each port so nobody re-litigates it.

## The first port deleted, and what its four red tests were worth

`process-transform/index.ts` is now a wrapper: 157 lines to 44. Upstream validates through
`invariant`, i.e. it THROWS, so the wrapper catches and dlogs — which keeps the never-throw
guarantee AND inherits all ~12 checks where the port implemented two. **The recipe generalises:
import, try/catch, dlog upstream's own message, return the empty result.**

Its own suite went red in four places, and every one was the port being LOOSER than RN in a way
that forwarded something native cannot read:

```
[{a: 1, b: 2}]              two properties in one entry     forwarded  -> dropped
'rotate(0.5)'               RN needs a string with deg/rad  {rotate:0.5} -> dropped
'perspective(100)'          STRING form needs a unit        {persp:100}  -> dropped
                            (the ARRAY form takes a bare number - keep both halves pinned)
'matrix(1,0,0,1,10,20)'     CSS's own 2D matrix is SIX      forwarded  -> dropped
                            values; RN accepts 9 or 16
```

The matrix row is the one real capability loss, and it is worth stating to a user: CSS `matrix()`
in its standard 2D spelling no longer parses. It never worked — six numbers reached a native side
that reads nine or sixteen — but it used to reach it silently, and now it is dropped silently.

**A red test here is a question about which side is wrong, not a fixture to retune.** Three of the
four fixtures were written from the port's own behaviour and documented a decision nobody made.

## Decided 2026-09-10: PanResponder KEEPS its divergence, and only its TouchHistoryMath half went

Upstream's `onResponderGrant` sets `x0/y0/dx/dy` and leaves `_accountsForMovesUpTo` at 0. Ours
seeds it with the grant frame's timestamp (`pan-responder/index.ts`, and the line says why). The
consequence is only visible on a gesture claimed at START, where no capture-phase move has advanced
the clock: upstream then computes `dt` against an absolute timestamp and reports `vx ~ 0` on the
first move, and we report a real velocity.

That is not academic. `packages/navigation`'s drawer, in all five adapters, reads `vx` through
`resolveSwipeIntent` with a 0.5 flick threshold — so adopting upstream's PanResponder wholesale
would stop a fast swipe being recognised. **Decision: keep ours.** It was a deliberate improvement
recorded only in a code comment until now.

What DID go is the `TouchHistoryMath` half: six centroid readings that were a line-by-line
re-derivation of a dependency-free, native-free upstream module. Verified first by running upstream
against our own record shape across five histories and three thresholds — including the case where
its two scans disagree (a timestamp EQUAL to the threshold, where the single-active-touch fast path
uses a strict `>` and the multi-touch loop uses `>=`).

The per-record runtime guard went with it. It existed because `nativeEvent` is a
`Record<string, unknown>` and the no-`as` rule forces a guard; `touchHistoryOf` already validates
the bank at the boundary, and our own `touch-history.ts` writes what is inside it. A malformed
record now yields NaN rather than being skipped — reachable only from a hand-built fixture, which
is a bad fixture rather than a defect the guard should hide.

**`processFontVariant` was deliberately NOT taken.** Our port is upstream plus a `[]` fallback, and
upstream is `split(' ').filter(Boolean)` — there are no corner cases to inherit, so the import edge
would buy nothing. Ports are deleted to inherit upstream's edge cases, not to lower a line count.

## The closure script (re-run it on every RN bump — the tiers move)

```sh
npm pack react-native@<version> && tar xzf react-native-*.tgz   # -> package/Libraries/**
```

```js
const RE =
  /(?:^|\n)\s*(?:import\s+(?!type\s|typeof\s)(?:[^'";]*?\s+from\s+)?|export\s+(?:\*|\{[^}]*\})\s+from\s+)['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
// ^ the (?!type\s|typeof\s) is the whole trick — without it every number is ~194 files of nothing.
// BFS the closure from an entry, resolving .js / .ios.js / .android.js / index.js;
// count files + LOC; flag TurboModuleRegistry|NativeModules|requireNativeComponent|codegenNativeComponent;
// then BFS again for /ReactFabric-(dev|prod)|RendererProxy/ — that second search is the tier decision.
```

## What NOT to do

- Do **not** copy another file out of `.vendors/react-native` into `core/` without running the
  closure and the `RendererProxy` check first. That is how this backlog was created.
- Do **not** trust a file-count that includes `import type`.
- Do **not** put this work on an engine or perf branch.
- Do **not** reach for a Vitest alias stub instead of the Flow transform — importing a fake
  instead of a hand-rolled port trades one reimplementation for a worse one.

## Corrections measured 2026-09-10 — four facts above are now wrong

A seven-domain re-audit (reports: `.docs/rn-port-elimination-audit.md`,
`.docs/list-parity-across-adapters.md` — untracked, `.docs/` is gitignored) contradicted this
skill on four points. Each was measured, not reasoned.

**1. The vendored path is `.vendors/react-native/packages/react-native/Libraries/**`**, not
`.vendors/react-native/Libraries/**`. The checkout is the RN monorepo. Six briefs written against
the shorter path had to fall back to `node_modules`.

**2. The list family is a SEPARATE npm package.** `Libraries/Lists/*` are 17-27-line re-export
shims; the source is `@react-native/virtualized-lists@0.86.0`, whose runtime deps are only
`invariant` + `nullthrows`. It is declared nowhere in this repo, so taking it is a manifest change.
Six of its files are React-free and importable whole — `ViewabilityHelper` (353),
`ListMetricsAggregator` (331), `VirtualizeUtils` (257), `FillRateHelper` (256), `CellRenderMask`
(156), `ChildListCollection` (73). Traps: the `Libraries/Lists` shims cover only three of the six
and re-export `keyExtractor` alone from `VirtualizeUtils`; the package barrel pulls React; and
`exports` declares `"types": null` for every subpath, so each import needs our own `.d.ts`.

**3. `ReactNativeAttributePayload` moved out of `Renderer/`** into
`Libraries/ReactNative/ReactFabricPublicInstance/`, and its value closure is THREE files — itself,
`deepDiffer.js`, `flattenStyle.js` — with zero renderer hits. Constraint 1 does not block it. This
skill assumes otherwise. Its `flattenStyle` and `deepDiffer` leaves are importable; `create()` and
`diff()` are not, for a CONFIG reason rather than a renderer one (they are driven by a
`validAttributes` we deliberately do not have, and `create` flags every function prop `true` where
our `GATED_EVENT_PROPS` flags exactly six).

**4. The ~1.2k-LOC Tier B floor is ALREADY PAID, so its break-even is the zeroth module.** All five
`adapters/*/src/bootstrap.ts:6` do `import { AppRegistry } from 'react-native'` — closure 456 files
/ 91 566 LOC, containing every floor file, every Tier B candidate, and `RendererProxy` itself. The
invariant still intact, and the one conversions must not break, is that `core/engine/src/index.ts`
does not reach the renderer. Tier B's cost/benefit in this file was computed against a floor nobody
pays twice.

**And Tier C is a module-level verdict hiding a symbol-level one.** `Keyboard` and
`AccessibilityInfo` each reach `RendererProxy` through exactly ONE symbol used by exactly ONE
method (`dismissKeyboard`->`TextInputState`->`findNodeHandle`, and `sendAccessibilityEvent`). Their
other submodules are renderer-free and individually importable, so the answer is a partial import,
not a full port. For `Image` the edge is real but belongs to the COMPONENT
(`ImageViewNativeComponent` -> `codegenNativeCommands`); the loader path is clean. Consequence:
`core/components/src/bootstrap/index.ts:6` imports `{ Image }` from the barrel and drags 106 files
plus react plus ReactFabric into every adapter's bootstrap, when it needs only
`react-native/Libraries/Image/resolveAssetSource` (145 LOC, 22 files).

**Method note that outlived the findings.** Where two auditors disagreed about the SAME shared
file, one of them was always looking at a real gap — the disagreement located it. A `YES` in a
feature inventory means "I found code", never "the behaviour matches RN"; only reading both sides
settles that. Both times it was checked by hand here, there was something there.
