---
name: symbiote-rn-port-elimination
description: "The backlog for deleting our 36 hand-rolled ports of React Native JS modules and importing upstream instead. Read BEFORE hand-porting ANY further RN module into `core/engine/src`, before touching one of the existing ports (`flattenStyle`, `processTransform`, `processFilter`, `processBoxShadow`, `PanResponder`, `Easing`, `ErrorUtils`, ...), and before scheduling this cleanup. Holds: why the ports exist and what they have already cost (a real Android device crash), the Tier A/B/C split measured against react-native@0.86.0, the three modules that must STAY ported because they reach React's own Fabric renderer, the two traps that make the job look impossible or trivial when it is neither, and the ~30-minute Step 0 experiment that decides whether Tier A is reachable at all. Trigger on: 'port RN module', 'reimplement flattenStyle/processTransform/Easing/PanResponder', 'why do we have a copy of RN's X', 'RN port elimination', 'import react-native directly in the engine', 'delete hand-rolled ports', 'Vitest cannot parse RN Flow'."
---

# Deleting our hand-rolled RN ports

**Urgent, and its own branch — this is a cleanup, not perf/engine work. Do not fold it into another
branch.**

`core/engine/src` holds **36 files whose own headers say "JS-side port of RN's `<X>`"** and **zero**
imports from `react-native` — a module we already carry as a `peerDependency` and that is therefore
always present at runtime. Every one of those files re-derives by hand the corner cases of an
implementation we already ship. Same mistake the CSS parser had before it was rebuilt around
`lightningcss`.

**It has already cost a real device bug.** `process-transform` crashed Android with
`String cannot be cast to ReadableArray`. The cause was the **ABSENCE of the JS parse**, not a
divergence from upstream: RN parses `transform` in JS only for a STRING, and we forwarded a raw
string. (This was recorded as "diverged from upstream on array input" until 2026-09-10, which sends
the next reader auditing the wrong branch.)

## The split, measured against `react-native@0.86.0`

| tier | count | shape | verdict |
|---|---|---|---|
| **A** | 12 modules, 1-5 files each | zero native, zero React | delete the port, import upstream |
| **B** | 15 modules, 13-38 files | all sharing ONE ~1.2k-LOC TurboModule/BatchedBridge floor | judgement call, module by module |
| **C** | 3 modules | reach `ReactNative/RendererProxy` -> `Renderer/implementations/ReactFabric-{dev,prod}` | must STAY ported |

**Tier A:** `flattenStyle`, `processTransform`, `processFilter`, `processBoxShadow`,
`processBackgroundImage`, `processTransformOrigin`, `processAspectRatio`, `processFontVariant`,
`PanResponder`, `Easing`, `bezier`, `ErrorUtils`.

**Tier C, and the reason is the whole architecture:** `Keyboard`, `AccessibilityInfo`, `Image.ios`
each reach **React's own Fabric renderer**, which must never enter a Vue/Svelte/Solid/Angular
bundle.

Full tables, the measured import closures, the `RendererProxy` paths and a re-runnable closure
script: `.docs/rn-port-elimination-audit.md`.

## Step 0 — the ~30-minute experiment that has never been run

The blocker is not the import graph, it is that **Vitest cannot parse RN's Flow source**. Scope
`@babel/preset-flow` to `node_modules/react-native` in `vitest.config.ts`. That one experiment
decides whether Tier A exists at all.

**Related evidence from the itest side, which is NOT the same harness:** the itest runner already
strips Flow with Hermes' own parser, and `ReactFabric-prod.js` imports and runs there. So RN's Flow
is not what blocks importing RN in *that* runner. What did block it was JSX in `.js` files (the
loader handed esbuild `js`; returning the `jsx` loader fixes it, and is strictly wider) and RN's app
bootstrap `ReactNativePrivateInitializeCore` pulling LogBox's dev modules and `.png` imports.

## Two traps

**A naive import closure counts Flow `import type` edges and reports 194 files where the truth is
1.** Do not budget off that number.

**The `core/components/src/bootstrap` subpath already imports `react-native` today, and that
precedent does NOT extend to Tier A** — commit-path modules cannot leave the main barrel.

## One latent fact to check per module, not assume

In every itest bundle without the `@symbiote-platform-extensions` directive, RN's `Platform` is
`undefined`, and any upstream module that dereferences it throws.
`Libraries/Utilities/Platform.js` is a shim whose whole body re-exports `./Platform`, relying on
**Metro** to resolve `Platform.ios.js`; esbuild has no platform extensions, so the file resolves to
itself and the cycle yields `undefined`.

Our colour path imports `processColor`, whose `Platform.OS === 'android'` check sits on a branch our
itests evidently never execute — on device they would. So **"it imports and the tests pass" is NOT
evidence that an upstream module works headlessly**; it may only mean the line needing `Platform`
was never reached. Check Tier A's candidates against this specifically.

Turning platform extensions on harness-wide is not the answer: it broke 154 of 158 itests, because
the engine imports `processColor` -> `Platform` -> `NativePlatformConstantsIOS` -> a native module.
Satisfying that would need a permissive `__turboModuleProxy`, and the engine reads that global
itself — so every itest asserting a module is ABSENT would silently start finding one.
