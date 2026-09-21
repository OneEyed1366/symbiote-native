<div align="center">

<img src="./assets/logo.svg" width="96" height="96" alt="SymbioteNative logo">

# SymbioteNative

### Want React Native's stack, but you don't write React? Today you can't.

**Stable** | iOS + Android | React, Vue 3, Angular, Svelte, Solid

[**Docs**](https://docs.symbiote-native.dev) | [Install](#install) | [Demo](#see-it-work) | [vs. NativeScript / Hippy / Lynx](#why-not-nativescript-hippy-or-lynx) | [Benchmarks](#how-fast-against-stock-react-native) | [Architecture](#how-it-works) | [Contributing](./CONTRIBUTING.md)

</div>

---

## The Problem

React Native gives you a genuinely good native stack: Fabric's C++ shadow tree, Yoga layout, JSI,
the iOS/Android host, Hermes, and thousands of npm packages that assume all of it. But that stack
only takes orders from **React**.

You can of course ship a native app in Vue or Svelte today, through NativeScript, Hippy or Lynx.
What you cannot do is ship it on _this_ stack. Each of those runs its own native layer, so
choosing one means leaving React Native's ecosystem behind and picking up a smaller one.

That lock is not a property of the stack, though. React is **not** privileged inside React Native's renderer. Fabric exposes a framework-agnostic, JSI-bound mutation API, `global.nativeFabricUIManager`, and React's renderer is
just one client of it. All of React's glue lives in a single file, `ReactFiberConfigFabric.js`.
"Removing React" means: stop calling that file, call the slot from your own renderer instead.

So SymbioteNative keeps React Native underneath as an ordinary dependency and replaces only the JS
renderer. **The native core is never forked.**

---

## Install

```bash
npx @symbiote-native/cli new my-app
```

Pick a framework and you get a working app: Metro configured, the entry seam wired, Expo-module
autolinking if you want it.

**Start a new app rather than converting one you already have.** The renderer, the Metro config and
the entry point all differ from a stock RN app, so bolting SymbioteNative onto an existing one is
more work than moving your screens into a fresh project, and it is not a path we support.

`react-native` stays **your app's own top-level dependency**. SymbioteNative never hides it, it only
replaces the JS renderer driving it.

What each framework needs in the build differs, and the CLI writes it for you:

| Framework                     | Package                    | What it adds to the build                                                                                                                                                 |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [React](./adapters/react)     | `@symbiote-native/react`   | nothing, plain Metro                                                                                                                                                      |
| [Vue 3](./adapters/vue)       | `@symbiote-native/vue`     | its `babel-jsx` pair for TSX; a Metro transformer as well for `.vue` SFCs                                                                                                 |
| [Angular](./adapters/angular) | `@symbiote-native/angular` | the most wiring of the five: `ngc --watch` beside Metro, its `metro-config`, and its `babel-linker` plus `babel-register-composed`. Needs `@angular/core` >= 20, zoneless |
| [Svelte](./adapters/svelte)   | `@symbiote-native/svelte`  | a Metro transformer for `.svelte`                                                                                                                                         |
| [Solid](./adapters/solid)     | `@symbiote-native/solid`   | its `babel-preset` listed **last** in Metro's presets                                                                                                                     |

Every adapter is [on npm](https://www.npmjs.com/org/symbiote-native) at `2.0.x`, and the scope
publishes **37 packages** in all. Beyond the five adapters and the shared core, 27 companion
packages cover navigation, third-party native views, and Expo-module wrappers for device, sensor
and permission APIs. Each lives under [`packages/`](./packages) with its own README.

---

## See It Work

The _same_ native app, same engine, same stock Fabric core, driven by five frameworks on the iOS
simulator. React Native's own renderer is never in the path of any of them:

<div align="center">

<table>
<tr>
<td align="center"><b>React</b></td>
<td align="center"><b>Vue 3</b></td>
<td align="center"><b>Angular</b></td>
<td align="center"><b>Svelte</b></td>
<td align="center"><b>Solid</b></td>
</tr>
<tr>
<td><img src="./assets/react-demo.gif" width="240" alt="React driving real native iOS views through SymbioteNative"></td>
<td><img src="./assets/vue-demo.gif" width="240" alt="Vue 3 driving real native iOS views through SymbioteNative"></td>
<td><img src="./assets/angular-demo.gif" width="240" alt="Angular driving real native iOS views through SymbioteNative"></td>
<td><img src="./assets/svelte-demo.gif" width="240" alt="Svelte driving real native iOS views through SymbioteNative"></td>
<td><img src="./assets/solid-demo.gif" width="240" alt="Solid driving real native iOS views through SymbioteNative"></td>
</tr>
</table>

</div>

The smallest slice is a tap-to-increment counter. The app is ordinary React, and the native
primitives are plain intrinsic tags, so nothing is imported for them:

```jsx
import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <view style={{ padding: 24 }}>
      <text>Taps: {count}</text>
      <pressable onPress={() => setCount(c => c + 1)}>
        <text>Tap me</text>
      </pressable>
    </view>
  );
}
```

That tree paints real native views, and the tap re-commits through the engine into Fabric. The full
canary and how to run it live in each adapter's README:
[react](./adapters/react), [vue](./adapters/vue), [angular](./adapters/angular),
[svelte](./adapters/svelte), [solid](./adapters/solid).

---

## Why Not NativeScript, Hippy, or Lynx?

**Framework count is not the differentiator.** NativeScript has supported this many flavors for
years, and Lynx is adding them fast. If all you want is Vue on a phone, those work, and they are
older than we are.

|                    | Whose native layer                   | Frameworks                                | What it costs you                                                      |
| ------------------ | ------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------- |
| **React Native**   | Meta's Fabric / Yoga / Hermes        | React only                                | React lock-in                                                          |
| **NativeScript**   | its own runtime and bindings         | JS/TS, Angular, Vue, Solid, Svelte, React | leaving RN's ecosystem for its own                                     |
| **Hippy**          | its own C++ DOM and layout engine    | React, Vue                                | leaving RN's ecosystem for Tencent's                                   |
| **Lynx**           | its own engine (PrimJS, dual-thread) | React, Vue                                | an 18-month-old ecosystem, mostly hand-written bridging                |
| **SymbioteNative** | **stock, unforked React Native**     | React, Vue 3, Angular, Svelte, Solid      | Angular is our slowest adapter; ecosystem packages are wrapped by hand |

The difference is the row you read first. All three alternatives wrote their own native layer, so
picking one means adopting its ecosystem too. As far as we have verified, SymbioteNative is the only
one reusing React Native's own unforked Fabric/JSI/Yoga pipeline as the shared native backend: Meta
keeps maintaining the native half, upstream releases keep arriving, and Detox, the debugger and
native modules work because underneath it really is an RN app.

The price of that bet is the other direction. We stay inside what Fabric can already do, where a
project owning its runtime can change it.

Three costs:

- **Angular is the slowest of the five.** 1.62x stock on a create-shaped row where Solid is 1.04x.
  The numbers and what is responsible for them are [below](#how-fast-against-stock-react-native).
- **Ecosystem packages are wrapped by hand, one at a time.** The _native view_ comes for free,
  through the same ViewConfig path as our own primitives, with zero SymbioteNative metadata. The JS
  surface around it does not, because a library's own component body is React internally. So each
  package gets a thin agnostic wrapper written here: no native code, no forking, a few hundred
  lines. Cheap per package, but manual, so the covered surface grows one library at a time.

<details>
<summary>Evidence behind that table, with dates</summary>

Latest npm releases, read from the registry on 2026-09-20.

**NativeScript** lists six flavors in its own docs, and five of the six are current:

| Flavor  | Package                                 | Latest              |
| ------- | --------------------------------------- | ------------------- |
| JS / TS | `@nativescript/core`                    | 9.1.2, Sep 16 2026  |
| Angular | `@nativescript/angular`                 | 22.0.1, Aug 24 2026 |
| Vue     | `nativescript-vue`                      | 3.1.2, Sep 15 2026  |
| Solid   | `@nativescript-community/solid-js`      | 0.1.2, Aug 15 2026  |
| Svelte  | `@nativescript-community/svelte-native` | 1.0.32, Apr 9 2026  |
| React   | `react-nativescript`                    | 5.0.0, Aug 2023     |

The original `svelte-native` (1.0.29, Nov 2024) is the abandoned one; the maintained fork is the
`@nativescript-community` package above. React is their stale flavor, not Svelte.

**Hippy** ships React actively, `@hippy/react` 3.3.5 (Aug 4 2026), in QQ, QQ Music and Tencent News.
Its Vue packages lag: `@hippy/vue` and `@hippy/vue-next` both sit at 3.3.2 from Feb 17 2025.

**Lynx** launched Mar 2025 and moves fast, `@lynx-js/react` 0.126.1 (Sep 11 2026). Vue Lynx is real
rather than a prototype: `vue-lynx` 0.5.1 (Jul 2026), its own docs site, `npm create vue-lynx`, and
Composition API, SFCs, Vue Router and Pinia. Pre-1.0, and Lynx says non-React flavors are already
about half its usage.

The wrapping cost has one mechanism behind it: a library's JS component calls React hooks in its own
body, so under a non-React adapter the dispatcher is null and it throws. The _native view_ is
unaffected. [`@symbiote-native/slider`](./packages/slider) is the reference shape for reaching one
without importing the library's React component.

</details>

---

## Component Behavior Lives In C++, Once For Every Framework

React Native's own components carry a mountain of small, framework-agnostic behavior inside their JS
bodies. `Pressable` folds `disabled` into `accessibilityState`. `Switch` uses different native prop
names per platform. A `<Text>` defaults its `ellipsizeMode`, `Image` resolves `srcSet` over `src`
over `source`, ARIA aliases resolve, `TouchableHighlight` paints an underlay.

Get any of it wrong and a control is announced incorrectly to a screen reader, or paints nothing.
Ported per adapter, that is five copies of every rule, drifting apart one release at a time.

So it is not ported. Each node carries the Fabric tag it was created with (`view`, `pressable`,
`switch`, `text-input`, ...), and a rule keyed on that tag runs **once, in C++, for whichever
adapter committed the node**.

|                   | before                    | now                                |
| ----------------- | ------------------------- | ---------------------------------- |
| a rule's home     | JS, per adapter           | C++, once, keyed on the node's tag |
| adding an adapter | port every rule again     | the rules are already there        |
| cost per commit   | a JSI round trip per node | none                               |

The crossing cost four to five times the rule it carried. A fold is charged for _existing_ rather
than for what it does, because the whole props bag travels both ways.

The port also found a shipping accessibility bug that every test had been green on: a disabled
`TouchableHighlight` reached Fabric as `focusable: true`, so a keyboard and a TV remote stopped on a
control that did nothing.

What deliberately stays in JS: gesture and press machines, the controlled-input handshake, and
anything only the bundler knows, such as resolving a `require()`'d image to a URI. Those run at
gesture rate and call back into app code, or need information a native rule cannot reach. It is the
same split a browser makes.

---

## How Fast, Against Stock React Native

Freeing you from React is worth nothing if the app gets slower. So `examples/bare-rn` is plain
React Native 0.86 driven by **React's own Fabric renderer**, carrying a port of the same benchmark
screen. It holds zero `@symbiote-native/*` dependencies on purpose: being untouched by this project
is the only thing it is for.

**What is measured.** The [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
operation list, the same one web frameworks are ranked with. Each row builds ten native views (three
`View`, three `Text`, three raw text nodes, a `TextInput`), so a run commits just over 10 000 nodes:
10 002 for stock, 10 003 for an adapter, which mounts one container view of its own.

**How it is kept honest.**

- **Read the counters before the milliseconds.** Two columns whose node or prop-key counts differ
  are not one workload, and the ms mean nothing. This has caught real errors in both directions:
  a stock app not rebuilt after the row gained a node, and an adapter whose "win" was a step that
  committed nothing.
- **Release builds only.** The same comparison read 13% _faster_ in Debug and 30% slower in Release.
  The sign of the headline metric flips.
- **One ruler, one sitting.** Every column below was taken back to back in a single run.
- **Small-ms rows carry no verdict.** Two builds of unchanged code drifted 4% on `Create` and 6x on
  `Clear`, so `Select`, `Swap` and `Clear` need a repeat before they mean anything.

### The numbers

Headless, 1 000 rows, `bench:itest` Release build, one sitting. The stock column is React's own
Fabric renderer running in the same harness. Ratio is ours over stock, so **below 1.00 is faster
than stock React Native**. Bold marks a row we win.

| 1 000 rows | stock RN |             React |              Vue |             Solid |            Svelte |         Angular |
| ---------- | -------: | ----------------: | ---------------: | ----------------: | ----------------: | --------------: |
| Create     |    109.2 |     139.5 / 1.28x |    151.9 / 1.39x |     113.9 / 1.04x |     121.1 / 1.11x |   177.2 / 1.62x |
| Replace    |    161.2 | **150.3 / 0.93x** |    207.4 / 1.29x | **134.5 / 0.83x** |     175.4 / 1.09x |   175.2 / 1.09x |
| Partial    |     11.7 |      12.8 / 1.09x |     13.5 / 1.15x |   **6.9 / 0.59x** |   **9.1 / 0.78x** | **7.6 / 0.65x** |
| Select     |     14.2 |  **13.3 / 0.94x** | **13.4 / 0.94x** |      16.8 / 1.18x |      14.2 / 1.00x |         2.3 / † |
| Swap       |     15.7 |      23.0 / 1.46x |  **5.5 / 0.35x** |   **6.8 / 0.43x** |   **6.2 / 0.39x** | **4.2 / 0.27x** |
| Remove     |     17.9 |   **5.7 / 0.32x** |  **4.7 / 0.26x** |   **6.5 / 0.36x** |   **5.9 / 0.33x** |        14.9 / † |
| Append     |    130.0 |     136.3 / 1.05x |    149.7 / 1.15x | **112.0 / 0.86x** | **124.8 / 0.96x** |   160.1 / 1.23x |
| Clear      |     12.6 |      21.3 / 1.69x |     28.7 / 2.28x |     427.2 / 33.9x |      22.1 / 1.75x |    29.3 / 2.33x |

**† Angular's `Select` and `Remove` get no ratio, by the first bullet above.** On `Select` the engine
counters read `cloned=0 setProps=1` against every other adapter's `cloned=3 setProps=1`: the selected
style never reached the engine, so 2.3 ms is a step that did not run. `Remove` diverges the same way.
Both are being chased, and until they agree with the other columns they are not a measurement.

**Mutating a mounted tree is where this architecture pays.** Removing one row of a thousand lands
every adapter 3x under stock, and swapping two lands the non-React ones 2.3-3.8x under. Stock pays a
walk over a thousand fibers plus persistent-mode cloning whatever host mutations come out the other
end. Vue, Svelte and Solid walk nothing and emit one `removeChild`.

React's `Swap` is the one loss, and it is not the engine's: the engine reports `cloned=2 setProps=0`,
so not a single prop write crosses. Both sides run the _same_ reconciler, and what differs is that we
drive it in **mutation** mode against stock's persistent mode. That was deliberate, so the
clone-on-write path could not be quietly skipped, and about 15 ms of the gap is React's own mutation
commit with a host config doing nothing at all. The other four adapters emit their moves straight
into the engine and never pay it.

**Create-shaped rows are where we still pay.** Solid is at parity (1.04x); React, Svelte and Vue sit
1.1-1.4x over. Angular's 1.62x is mostly Angular's own machinery rather than the adapter: measured
against an inlined row, a per-row component instance costs about 81 us in LViews, DI scopes and
`EventEmitter`s. That is an app author's choice the adapter cannot remove.

Solid's `Clear` at 427 ms is a known outlier, reproduced five times across two state spellings. It is
not the engine, whose own halves account for about 3% of it.

The harness is JavaScriptCore rather than Hermes, a test host rather than a real Fabric pipeline, and
the runner applies no app-level Babel lowering. Read it as a sound comparison of the six columns
_against each other_ on one ruler, and re-measure on device before quoting a ratio against stock.

<details>
<summary>The last full on-device run, from a release that no longer ships</summary>

Taken on the **JS retained-tree** engine, before the tree moved into C++. iOS 26.5 simulator,
Release, 1 000 rows, all mounted. Kept because the device is the real instrument and this is the most
recent reading from it, but the architecture underneath has been replaced. Do not read it as current.

| Operation      | stock RN |             Solid |            Svelte |               Vue |             React |          Angular |
| -------------- | -------: | ----------------: | ----------------: | ----------------: | ----------------: | ---------------: |
| Create 1 000   |    257.3 | **195.7 / 0.76x** | **205.0 / 0.80x** | **228.7 / 0.89x** |     264.7 / 1.03x |    367.2 / 1.43x |
| Replace all    |    256.3 | **229.3 / 0.89x** | **214.0 / 0.83x** | **238.1 / 0.93x** |     266.3 / 1.04x |    460.2 / 1.80x |
| Append 1 000   |    415.0 | **204.3 / 0.49x** | **223.1 / 0.54x** | **229.0 / 0.55x** | **390.2 / 0.94x** |    438.2 / 1.06x |
| Partial update |     33.6 |  **11.8 / 0.35x** |  **15.4 / 0.46x** |  **19.2 / 0.57x** |  **26.1 / 0.78x** |     39.1 / 1.16x |
| Remove row     |    121.4 |  **10.4 / 0.09x** |   **8.6 / 0.07x** |  **10.1 / 0.08x** |  **98.6 / 0.81x** | **18.3 / 0.15x** |
| Swap 2 rows    |      9.6 |   **6.1 / 0.64x** |   **8.4 / 0.88x** |   **8.7 / 0.91x** |      35.3 / 3.68x |     18.4 / 1.92x |
| Select row     |      7.3 |   **5.5 / 0.75x** |      14.7 / 2.01x |       8.4 / 1.15x |       7.9 / 1.08x |     10.5 / 1.44x |
| Clear          |     10.7 |   **9.1 / 0.85x** |      12.6 / 1.18x |      14.1 / 1.32x |   **8.7 / 0.81x** |     44.2 / 4.13x |

React's `Swap` is the one row that survives the architecture change unchanged: 3.68x here, 2.42x
headless, same cause, and the explanation above applies to both.

</details>

---

## How It Works

```
Vue / Svelte / Solid / Angular / React     thin reconciler / createRenderer per framework
        |  insert / remove / setProp / commit
        v
@symbiote-native/engine (JS)  : translates each call into a command-buffer op. No retained
        |                       tree in JS; one JSI crossing per commit, not per op
        v
SymbioteTree (C++)  : the retained tree, clone-on-write commit, tag-keyed platform rules
        |  createNode / cloneNodeWithNewProps / appendChildToSet / completeRoot
        v
stock react-native : Fabric C++ / JSI / Yoga / RCTFabricSurface       <- never forked
```

The hard part is that Vue, Svelte, Solid and Angular **mutate** nodes in place (`el.setAttribute`),
while Fabric is **persistent**: every change clones the node with new props and atomically commits a
new child set. That translation lives **once**, in the engine, so adapters see only a small mutation
API (`createNode`, `appendChild`, `insertBefore`, `removeChild`, `setProp`, commit) and a
persistence bug is fixed once for every framework.

<details>
<summary>One update end to end, plus events, bootstrap, and what stays stock</summary>

**One update.** Framework reactivity fires, the adapter calls `setProp` / `insert` / `remove` on a
retained node handle, and the JS engine appends an op to the current commit's buffer instead of
touching a tree. On flush the whole buffer crosses into C++ in one JSI call. `SymbioteTree` applies
the ops, clones what changed, builds a new childSet and calls `completeRoot`. Fabric diffs old
against new shadow tree, and native views update.

**Events fall out of the seam rather than being a subsystem.** At `createNode` the adapter passes an
`instanceHandle`, and Fabric hands that same handle back when an event fires. In React it is the
fiber; here it is the retained-tree node. The engine normalizes the raw native event onto a listener
on that node, and the adapter maps its own template syntax (`@click`, `on:click`, `(click)`) onto it.

**Bootstrap.** The native host raises a Fabric surface (`RCTFabricSurface` on iOS) through stock RN's
`AppRegistry`, which mints a `rootTag`. SymbioteNative's entry registers a _runnable_ rather than a
component: instead of mounting React's app, it hands the `rootTag` to `mount(...)` and commits the
initial child set.

**What stays stock.** Fabric C++, JSI, Yoga, the iOS/Android host, `RCTFabricSurface`, native
modules. None of it is forked or patched. The C++ addition above sits _beside_ Fabric as our own code
linked into the app, never as a patch to RN's sources.

</details>

---

## Status

**Stable API, native core rewritten underneath.** Five frameworks drive the same untouched core on
iOS and Android with RN's renderer never in the path. Every primitive (`View`, `Text`, `Image`,
`ScrollView`, `TextInput`, `Pressable`, `Switch`, `Modal`, the `VirtualizedList` family), the
runtime-module layer (`Platform`, `StyleSheet`, `Dimensions`, `Alert`, `Share`), `Animated` on both
the JS and native drivers, the gesture and responder lifecycle, and accessibility all commit through
the engine into Fabric, proven on device.

**What is still catching up:** `@symbiote-native/cli` has just landed and has little mileage on it
yet; the long-tail prop surface keeps widening; Android is at canary parity while iOS stays the
reference surface; Reanimated is the largest remaining gap and is not started.

The bar for "done" is the canary, not a percentage. RN's surface is effectively unbounded, so the
example apps are the working spec and they stay green.

<details>
<summary>Milestones, and what each step proved</summary>

Make **React** the known-good driver first, then add one framework at a time on an already validated
core, so a break in a new adapter isolates to _that adapter_ rather than the native pipe or the
commit engine. The framework axis and the platform axis are independent: each new adapter inherits
the platform axis as it lands.

| #      | Milestone                | What it proves                                                                                                                                                       | Status  |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **M0** | Monorepo scaffold        | pnpm workspaces, engine + react packages, headless harness                                                                                                           | done    |
| **M1** | React canary on iOS      | native pipe, clone-on-write engine, event to recommit                                                                                                                | done    |
| **M2** | React to RN parity       | the canary's full primitive, prop and event surface on the agnostic core, green on iOS + Android                                                                     | done    |
| M2.1   | Primitive surface        | `View`/`Text`/`ScrollView`/`TextInput`/`Modal`/`FlatList` through the engine, on device                                                                              | done    |
| M2.2   | Runtime modules          | `Platform`/`StyleSheet`/`Dimensions`/`Appearance` + imperative `Alert`/`Share`/`Linking`/`Keyboard`                                                                  | done    |
| M2.3   | `Animated`, both drivers | JS + native driver; native offload proven by freezing the JS thread                                                                                                  | done    |
| M2.4   | Third-party native views | `@react-native-community/slider` via runtime ViewConfig derivation, zero SymbioteNative metadata                                                                     | done    |
| M2.5   | Gestures and events      | responder lifecycle, capture to bubble, `Pressable`/`Touchable*`/`PanResponder`, a11y prop layer                                                                     | done    |
| M2.6   | Long-tail prop edges     | continuous hardening as the canary surface widens, never a gate on M2                                                                                                | ongoing |
| **M3** | Vue adapter              | `createRenderer` + nodeOps, first non-React framework, same canary surface                                                                                           | done    |
| M3.1   | Shared component layer   | `VirtualizedList` family and component logic extracted, inherited by every adapter                                                                                   | done    |
| **M4** | Angular adapter          | `Renderer2`/`RendererFactory2` + DOM-less bootstrap, AOT through a Metro-compatible linker                                                                           | done    |
| **M5** | App-ready ecosystem      | the minimal third-party surface a real app needs, built once against the agnostic core                                                                               | ongoing |
| M5.1   | Navigation               | a framework-agnostic navigation core over `react-native-screens`. `react-navigation`'s UI is React-only, so this is a genuine shared component rather than a wrapper | done    |
| M5.2   | Native-module wrappers   | 22 shipped (Clipboard, Haptics, Sensors, Battery, Device and more), autolinked; persistent storage and safe-area edges still open                                    | ongoing |
| M5.3   | Reanimated               | the largest remaining gap, saved for last: a full worklet-driven animation layer                                                                                     | planned |
| **M6** | Svelte adapter           | a DOM shim over stock compiled Svelte output, third non-React framework, full parity                                                                                 | done    |
| **M7** | Solid adapter            | `solid-js/universal`'s `createRenderer`, fourth non-React framework, full parity                                                                                     | done    |
| **M8** | Web _(stretch)_          | the same trees rendered to the web as a default platform target                                                                                                      | maybe   |
| **DX** | `@symbiote-native/cli`   | one command scaffolds a working app, pinning `react-native` at the app root so app code names only `@symbiote-native/*`                                              | done    |

</details>

---

## Testing

SymbioteNative never forks the native core, so a SymbioteNative app **is** a stock React Native app
underneath. **Any tool that hooks RN's internals works unchanged, for every adapter, for free.** We
did not build a test framework; we inherited RN's.

Detox attaches with zero SymbioteNative-specific glue, because to Detox this is just an RN app. One
shared `canary-journeys` spec runs identically across the React, Vue and Svelte canaries, which is
what proves each adapter paints and responds the same way on device.

Alongside it, 87 integration fixtures drive the real C++ engine headlessly, including React's own
Fabric renderer as a baseline arm. A second host build compiles the Android branches, so a
platform-split rule is tested in a build that actually contains it.

Commands, layers and what each one covers: [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## FAQ

**Is this a fork of React Native?** No. `react-native` is consumed as an ordinary dependency and its
native C++/Obj-C++/JNI sources are never touched. Only the JS renderer is replaced.

**Why React first, if the goal is framework independence?** React is a known-good driver. Validating
the native pipe and the commit engine against it first means that when a later adapter breaks, the
failure isolates to _that adapter_ rather than the native stack underneath it.

---

## License

[MIT](./LICENSE).
