---
name: symbiote-rn-port-elimination
description: "!!! URGENT, DO THIS AS SOON AS A BRANCH IS FREE. Deleting SymbioteNative's 36 hand-rolled JS ports of react-native's own modules (core/engine/src/process-transform, process-filter, process-box-shadow, process-background-image, process-transform-origin, process-aspect-ratio, process-font-variant, style/flattenStyle, style-sheet, pan-responder, animated/{bezier,easing,value}, platform, dimensions, appearance, app-state, pixel-ratio, keyboard, back-handler, alert, vibration, settings, i18n-manager, toast-android, permissions-android, layout-animation, image-loader, report-error, accessibility-info, ...) in favour of importing the upstream module. Read BEFORE porting ANY further RN JS module by hand, before deciding whether an RN module is safe to import, and before starting the cleanup branch. Holds: the MEASURED transitive import closure of every candidate against react-native 0.86.0, split into three tiers (A: 12 modules at 1-5 files with zero native and zero React, delete the port; B: 13-38 files sharing one ~1.2k-LOC TurboModule/BatchedBridge floor, judgement call; C: 3 modules — Keyboard, AccessibilityInfo, Image.ios — that reach ReactNative/RendererProxy -> Renderer/implementations/ReactFabric-{dev,prod}, i.e. React's own Fabric renderer, and must STAY ported); the single import edge that decides tier C; the METHODOLOGY TRAP that makes a naive closure 194 files when the real one is 1 (Flow `import type` is erased — count value imports only); the real gate, which is not the graph but Vitest's inability to parse Flow (symbiote-rn-import-testability) and the UNVERIFIED Flow-strip transform that would open tier A; the working precedent already in the repo (core/components/src/bootstrap imports react-native behind a package `exports` subpath) and why that trick does NOT extend to commit-path modules; and a re-runnable closure script for the next RN bump. This is CLEANUP and belongs on its OWN branch — never mix it into a perf/engine branch. Trigger on: 'port an RN module', 'why does core have no react-native imports', 'can we import RN's processX', 'delete our ports', 'RN import graph', 'Flow parse failure in vitest', an RN version bump, or any task that starts by copying a file out of .vendors/react-native."
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
Android crash (`String cannot be cast to ReadableArray`) caused by our port diverging from
upstream's behaviour on an array input.

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

> **Step 0, and everything depends on it: teach Vitest to strip Flow from
> `node_modules/react-native/**`.** A Babel plugin (`@babel/preset-flow`) scoped to that path
> in `vitest.config.ts`. **This has NOT been tried.** It is ~30 minutes and it decides whether
> tier A exists at all. Do it before planning anything else.

A global `resolve.alias` stub is NOT an acceptable substitute: it would replace the real
implementation with a fake, which defeats the entire point of importing upstream.

## The plan

1. **Step 0 — the Flow transform experiment.** Scope `@babel/preset-flow` to
   `node_modules/react-native` in `vitest.config.ts`. Prove one tier-A module (`flattenStyle` is
   the right pilot — smallest, hottest, most-tested) imports and its existing tests pass. If this
   fails, STOP and record why; tiers A and B both close.
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
