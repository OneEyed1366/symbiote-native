<div align="center">

<img src="./assets/logo.svg" width="96" height="96" alt="SymbioteNative logo">

# SymbioteNative

### Want React Native's stack, but you don't write React? Today you can't.

**Stable** · iOS + Android · React + Vue + Angular + Svelte + Solid · one native core, N framework adapters

[**Docs**](https://docs.symbiote-native.dev) · [Why SymbioteNative](#why-not-nativescript-lynx-or-just-react-native) · [Benchmarks](#how-fast-against-stock-react-native) · [Architecture](#how-it-works) · [Testing](#testing) · [Milestones](#milestones) · [React adapter](./adapters/react) · [Vue adapter](./adapters/vue) · [Angular adapter](./adapters/angular) · [Svelte adapter](./adapters/svelte) · [Solid adapter](./adapters/solid)

</div>

---

## The Problem

React Native gives you a genuinely good native stack: Fabric's C++ shadow tree, Yoga layout, JSI,
the iOS/Android host, Hermes, and thousands of npm packages that assume all of it. But that stack
only takes orders from **React**.

You can of course ship a native app in Vue or Svelte today, through NativeScript, Hippy or Lynx.
What you cannot do is ship it on _this_ stack. Each of those runs its own native layer, so
choosing one means leaving React Native's ecosystem behind and picking up a smaller one.

That lock is not a property of the stack, though. React is **not** privileged inside React Native's renderer. Fabric exposes a
framework-agnostic, JSI-bound mutation API, `global.nativeFabricUIManager`, and React's renderer is
just one client of it. All of React's glue lives in a single file, `ReactFiberConfigFabric.js`.
"Removing React" means: stop calling that file, call the slot from your own renderer instead.

SymbioteNative turns React Native's **internals** — Fabric's C++ shadow tree, Yoga layout,
Hermes, JSI — into a **universal native rendering layer**. It extracts that engine, puts a
tiny seam in front of it, and lets **any** UI framework drive real native views through it.
The rendering layer is React Native's; React the framework is just one client. One native
core, N thin adapters.

> The shape is a shared retained tree plus a thin per-framework reconciler — the same pattern
> that already drives a terminal layout engine across five UI frameworks, retargeted here from
> ANSI terminal output to native iOS/Android views. The tree itself lives in C++ now (it did not
> always — see [How It Works](#how-it-works)); every framework still talks to it through the same
> four-call mutation API.

---

## Why Not NativeScript, Lynx, or Just React Native?

Every existing answer to "native UI without React lock-in" forces a trade this project
doesn't. The demand is real - Tencent's Hippy and ByteDance's Lynx both ship multi-framework
native UI at real production scale - but each option gives up something structural:

|                      | Native layer                                                                                                | Frameworks                                                                                                                                                                                                             | Native-module ecosystem                                               | The trade you make                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **React Native**     | Fabric / Yoga / Hermes, the most battle-tested stack, maintained by Meta                                    | React only                                                                                                                                                                                                             | Thousands of packages: payments, maps, analytics are an `npm install` | React lock-in                                                                                |
| **NativeScript**     | Its own runtime + bindings, maintained by nstudio (core last commit Aug 14, 2026, releases every 2-4 weeks) | Angular active (`@nativescript/angular` 21.0.0, Jan 2026); Vue quiet since `3.0.2` in Oct 2025; Svelte's community fork stalled since Dec 2025, and the original `svelte-native` package hasn't shipped since Nov 2024 | Its own, real but a fraction of RN's                                  | Leave RN's ecosystem, and framework support quality varies sharply by which one you pick     |
| **Hippy** (Tencent)  | Its own C++ DOM + its own Flex layout engine, maintained by Tencent                                         | React and Vue, both officially supported, shipping in QQ, QQ Music, and Tencent News (releases through Aug 2025)                                                                                                       | Its own, real production scale but a separate ecosystem from RN's     | Leave RN's ecosystem for Tencent's, solid Vue support but on their roadmap                   |
| **Lynx** (ByteDance) | Its own new engine (PrimJS, dual-thread), launched March 2025                                               | ReactLynx is the only framework that actually ships; Vue support is an unfinished community prototype                                                                                                                  | Minimal, most integrations mean hand-written native bridging          | A year-old ecosystem, and "framework-agnostic" is still a roadmap item, not what ships today |
| **SymbioteNative**   | **Stock, unforked React Native**, Meta keeps maintaining it, you keep upstream merges                       | React, Vue 3, Angular, Svelte, Solid all shipping today                                                                                                                                                                | RN's own, inherited at the native-view level                          | Beta; `@symbiote-native/cli new` scaffolds new apps, wiring into an existing one is still manual   |

NativeScript and Hippy each prove multi-framework native UI works at real scale, carrying
their own native runtime alone. Lynx, a year into its own new engine, still ships React
only. SymbioteNative is, as far as we've verified, the only one of these reusing React
Native's own unforked Fabric/JSI/Yoga pipeline as the shared native backend - everyone
else wrote their native layer from scratch. Different bet, not automatically a bigger
one: it buys Meta's maintenance and the existing RN ecosystem, at the cost of staying
inside what Fabric can already do. And because the native core is never forked, every
tool that hooks RN's internals - Detox, the debugger, native modules - works unchanged
across every adapter (see [Testing](#testing)).

One honest caveat: a third-party RN package's _JS component_ is React-only by nature (it
calls hooks internally), so non-React adapters reach third-party _native views_ through
thin wrappers like [`@symbiote-native/slider`](./packages/slider) — the native view is
framework-agnostic, the React wrapper around it is not.

---

## How Fast, Against Stock React Native

The table above calls this a different bet. This is what the bet costs — because a renderer that
frees you from React is worth nothing if it makes the app slower than the one you already had.

So every example app carries a **Benchmark** screen, and one app in this repo — `examples/bare-rn`
— is plain React Native 0.86 driven by **React's own Fabric renderer**, with a port of that same
screen. That is the baseline, and it holds zero `@symbiote-native/*` dependencies on purpose: being
untouched by this project is the only thing it is for.

### What is measured

The [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) (krausest)
operation list, the same one web frameworks are ranked with: create 1 000 rows, replace all, update
every 10th, select, swap, remove, append 1 000, clear. Each row builds **ten native views** —
three `View`, three `Text`, three raw text nodes and a `TextInput` — so a run commits a
10 001-node tree.

### How the comparison is kept honest

- **Read the counters before the milliseconds.** Two columns whose `createNode` or prop-key counts
  differ are not one workload, and the ms are meaningless. This caught a real error: an early run
  read 1.31x against stock purely because the stock app had not been rebuilt after the row gained
  its `TextInput`, so it was measuring nine nodes against ten.
- **Release builds only.** The same comparison read 13% _faster_ in Debug and 30% slower in
  Release — the sign flips, because Debug inflates JS-bound and native-bound work by different
  factors.
- **Same simulator, back to back.** Two builds a day apart drifted 4% on `Create` and 6x on
  `Clear` with no code change, so the ~4% `Create` drift is the noise floor and the small-ms rows
  (`Select`, `Swap`, `Clear`) carry no verdict from a single run.
- **All-mounted, not virtualized.** The virtualized column compares RN's own `FlatList` against
  our port of it — two implementations, not two renderers.

### The numbers

iOS 26.5 simulator, Release, 1 000 rows, all mounted. Lower is better; the ratio is ours over
stock, so **below 1.00 means faster than stock React Native**. Bold marks a row we win.

> **These numbers are the last full on-device measurement, taken on the JS-engine architecture
> that shipped in earlier npm releases.** The retained tree has since moved into C++ (this is now what ships —
> see [How It Works](#how-it-works)), which changes this table; a fresh on-device run for the C++
> engine hasn't happened yet. The best available read on the new engine is the headless comparison
> [below](#the-c-engine-headless-so-far), which is a real measurement but not this same device table.

| Operation      | stock RN |             Solid |            Svelte |               Vue |             React |          Angular |
| -------------- | -------: | ----------------: | ----------------: | ----------------: | ----------------: | ---------------: |
| Create 1 000   |    257.3 | **195.7 · 0.76x** | **205.0 · 0.80x** | **228.7 · 0.89x** |     264.7 · 1.03x |    367.2 · 1.43x |
| Replace all    |    256.3 | **229.3 · 0.89x** | **214.0 · 0.83x** | **238.1 · 0.93x** |     266.3 · 1.04x |    460.2 · 1.80x |
| Append 1 000   |    415.0 | **204.3 · 0.49x** | **223.1 · 0.54x** | **229.0 · 0.55x** | **390.2 · 0.94x** |    438.2 · 1.06x |
| Partial update |     33.6 |  **11.8 · 0.35x** |  **15.4 · 0.46x** |  **19.2 · 0.57x** |  **26.1 · 0.78x** |     39.1 · 1.16x |
| Remove row     |    121.4 |  **10.4 · 0.09x** |   **8.6 · 0.07x** |  **10.1 · 0.08x** |  **98.6 · 0.81x** | **18.3 · 0.15x** |
| Swap 2 rows    |      9.6 |   **6.1 · 0.64x** |   **8.4 · 0.88x** |   **8.7 · 0.91x** |      35.3 · 3.68x |     18.4 · 1.92x |
| Select row     |      7.3 |   **5.5 · 0.75x** |      14.7 · 2.01x |       8.4 · 1.15x |       7.9 · 1.08x |     10.5 · 1.44x |
| Clear          |     10.7 |   **9.1 · 0.85x** |      12.6 · 1.18x |      14.1 · 1.32x |   **8.7 · 0.81x** |     44.2 · 4.13x |

### The C++ engine, headless, so far

The retained tree moved out of JavaScript and into C++: adapters build a command buffer and
`SymbioteTree` applies it against the tree on the native side, once per commit instead of once
per mutation. **This is the architecture that ships now** — the table above is what it replaced.
It moves the numbers, and not in one direction: measured headless, create-shaped operations got
_more_ expensive while update-shaped operations got _much_ cheaper.

The same eight operations, the same 1 000-row screen, run headless through all six renderers in one
sitting (ms; ratio is ours / stock — JavaScriptCore, not Hermes, a test host rather than a real
Fabric pipeline, so read this as the columns compared to each other on one ruler, not as a stand-in
for the device table above):

| 1 000 rows | stock RN | React |   Vue | Solid | Svelte | Angular |
| ---------- | -------: | ----: | ----: | ----: | -----: | ------: |
| Create     |     93.4 | 114.4 | 131.7 |  99.9 |  114.9 |   253.9 |
| Replace    |    101.5 | 117.2 | 152.8 | 110.9 |  127.1 |   283.2 |
| Partial    |     11.3 |  10.4 |  12.3 |   7.3 |    8.2 |    10.2 |
| Select     |     12.9 |  13.8 |  12.9 |  15.4 |   11.8 |    19.3 |
| Swap       |     15.5 |  22.4 |   5.1 |   5.5 |    5.0 |     8.3 |
| Remove     |     16.8 |   4.1 |   4.5 |   8.2 |    4.4 |     8.0 |
| Append     |    122.5 | 117.0 | 142.0 | 105.9 |  121.1 |   271.3 |
| Clear      |     10.0 |  11.1 |  41.0 | 409.1 |   19.1 |    44.1 |

`Create` and `Append` are the two rows every adapter regressed on against this same headless
baseline taken on the old JS engine — moving the retained tree to C++ did not, by itself, pay for
the crossing it removed. `Swap` and `Remove` moved the other way for every non-React adapter,
2-4x over where they stood before. Solid's `Clear` at 409.1ms is a known, reproduced outlier
still under investigation; the engine itself accounts for about 3% of that number.

Until a fresh on-device run exists, don't read either table as "the current benchmark" on its
own — the device table above is accurate for a release that no longer ships, and the headless
table above is accurate for what ships now but isn't the same instrument.

---

## How It Works

```
Vue · Svelte · Solid · Angular · React     thin reconciler / createRenderer per framework
        │  insert / remove / setProp / commit
        ▼
@symbiote-native/engine (JS)  : translates each call into a command-buffer op — no retained
        │                       tree in JS; one JSI crossing per commit, not per op
        ▼
SymbioteTree (C++)  : the retained tree, clone-on-write commit, tag-keyed platform rules
        │  createNode · cloneNodeWithNewProps · appendChildToSet · completeRoot
        ▼
stock react-native : Fabric C++ · JSI · Yoga · RCTFabricSurface       ← never forked
```

The hard part is that Vue/Svelte/Solid/Angular **mutate** nodes in place
(`el.setAttribute`), while Fabric is **persistent** — every change clones the node with
new props and atomically commits a new child set. That mutation→clone-on-write translation
lives **once**, in the engine — adapters see only a four-call mutation API, and a persistence
bug is fixed once, for every framework. **It used to live in TypeScript; it now lives in C++**
(`SymbioteTree.cpp`), reached from JS through one buffered crossing per commit instead of one
call per mutation. Same seam adapters talk to, cheaper on the other side of it.

<details>
<summary><b>Details</b> — data flow, tag rules, events, bootstrap, what stays stock</summary>

**One update.** Framework reactivity fires → the adapter calls `engine.setProp / insert /
remove` on a retained node handle → the JS engine appends an op to the current commit's
buffer instead of touching a tree itself → on flush, the whole buffer crosses into C++ in one
JSI call → `SymbioteTree` applies the ops against the retained tree, clones the nodes that
changed, builds a new childSet, and calls `completeRoot(rootTag, childSet)` → Fabric C++
diffs old vs new shadow tree → native views update.

What each framework needs in the build differs, and the CLI writes it for you:

| Framework                     | Package                    | What it adds to the build                                                                                                                                                 |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [React](./adapters/react)     | `@symbiote-native/react`   | nothing, plain Metro                                                                                                                                                      |
| [Vue 3](./adapters/vue)       | `@symbiote-native/vue`     | its `babel-jsx` pair for TSX; a Metro transformer as well for `.vue` SFCs                                                                                                 |
| [Angular](./adapters/angular) | `@symbiote-native/angular` | the most wiring of the five: `ngc --watch` beside Metro, its `metro-config`, and its `babel-linker` plus `babel-register-composed`. Needs `@angular/core` >= 20, zoneless |
| [Svelte](./adapters/svelte)   | `@symbiote-native/svelte`  | a Metro transformer for `.svelte`                                                                                                                                         |
| [Solid](./adapters/solid)     | `@symbiote-native/solid`   | its `babel-preset` listed **last** in Metro's presets                                                                                                                     |

**Bootstrap.** The native host raises a Fabric surface (`RCTFabricSurface` on iOS) via stock
RN's `AppRegistry`, which mints a `rootTag`. SymbioteNative's entry registers a _runnable_ (not a
component): instead of mounting React's app, it hands the `rootTag` to `mount(...)` and commits
the initial child set.

**What stays stock RN.** Fabric C++, JSI, Yoga, the iOS/Android host, `RCTFabricSurface`,
native modules. None of it is forked or patched — `react-native` is an ordinary dependency.
The only thing SymbioteNative replaces is the JS renderer, and the C++ addition above sits
beside Fabric, not inside it — it is our own code linked into the app, never a patch to RN's
sources.

</details>

---

## See It Work

The _same_ native app — same `@symbiote-native/engine`, same stock Fabric core — driven by five different
frameworks on the iOS simulator. React Native's own renderer is never in the path of any of them:

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

The smallest slice is a tap→increment counter. The app is ordinary React (or Vue) — it just
writes the native primitives as plain intrinsic tags, no import needed:

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

That tree paints real native views, and the tap re-commits through `@symbiote-native/engine` into Fabric.
The entry seam (a low-level _runnable_, not a component), the full canary, and how to run each one
live in the per-adapter READMEs:

- **[`adapters/react`](./adapters/react)** — `@symbiote-native/react`, the reference adapter (full RN surface, iOS + Android).
- **[`adapters/vue`](./adapters/vue)** — `@symbiote-native/vue`, Vue 3 on the same core (`examples/vue-tsx`, `examples/vue-sfc`).
- **[`adapters/angular`](./adapters/angular)** — `@symbiote-native/angular`, `Renderer2`/`RendererFactory2` on the same core (`examples/angular`).
- **[`adapters/svelte`](./adapters/svelte)** — `@symbiote-native/svelte`, a DOM shim over stock compiled Svelte output on the same core (`examples/svelte`).
- **[`adapters/solid`](./adapters/solid)** — `@symbiote-native/solid`, `solid-js/universal`'s `createRenderer` on the same core (`examples/solid`).

---

## Try It In Your Own App

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

# Vue 3
npm install @symbiote-native/vue react-native vue

# Angular (>=20, for stable zoneless change detection)
npm install @symbiote-native/angular react-native @angular/core
- **Angular is the slowest of the five.** 1.62x stock on a create-shaped row where Solid is 1.04x.
  The numbers and what is responsible for them are [below](#how-fast-against-stock-react-native).
- **Ecosystem packages are wrapped by hand, one at a time.** The _native view_ comes for free,
  through the same ViewConfig path as our own primitives, with zero SymbioteNative metadata. The JS
  surface around it does not, because a library's own component body is React internally. So each
  package gets a thin agnostic wrapper written here: no native code, no forking, a few hundred
  lines. Cheap per package, but manual, so the covered surface grows one library at a time.

# Svelte
npm install @symbiote-native/svelte react-native svelte

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

- **[`adapters/react`](./adapters/react)** — plain Metro, no extra build step.
- **[`adapters/vue`](./adapters/vue)** — TSX needs nothing extra; SFC adds a Metro transformer for `.vue` files.
- **[`adapters/angular`](./adapters/angular)** — needs `ngc --watch` running alongside Metro (AOT compiles separately from Metro).
- **[`adapters/svelte`](./adapters/svelte)** — adds a Metro transformer for `.svelte` files, same recipe as Vue SFC.
- **[`adapters/solid`](./adapters/solid)** — needs `@symbiote-native/solid/babel-preset` listed last in Metro's Babel presets, so it claims the JSX before the RN preset's own React-JSX transform does.

Beyond the five adapters, **27 companion packages** are also on npm, installed the same way —
one framework-agnostic core each, reachable from every adapter it lists in its own `exports`:
navigation ([`@symbiote-native/navigation`](./packages/navigation), a native stack navigator over
`react-native-screens`), third-party native views
([`@symbiote-native/slider`](./packages/slider), [`@symbiote-native/splash-screen`](./packages/splash-screen)),
the Android host-shim package ([`@symbiote-native/android`](./packages/android)), the Expo-module
autolinker ([`@symbiote-native/expo-modules-link`](./packages/expo-modules-link), a postinstall
script that registers whichever Expo-wrapper packages below are installed), and Expo-module
wrappers covering device/sensor/permission APIs — application, battery, brightness, cellular,
clipboard, crypto, device, haptics, keep-awake, local-auth, localization, network,
screen-orientation, secure-store, sensors, sharing, sms, standard-web-crypto, store-review,
system-ui, tracking-transparency, and web-browser, each under `packages/<name>` with its own
README and full per-adapter usage examples.

---

## Status

> [!NOTE]
> **Stable API, native core rewritten underneath.** The thesis is proven _five times over_: React Native's
> renderer is extracted, and **five** frameworks — React, Vue 3, Angular, Svelte, and Solid — drive
> the same untouched framework-agnostic core on iOS + Android, with RN's own renderer never in the path.
> Every adapter ships to npm at `2.0.0` (the shared core packages under it version independently),
> so you can add one to an existing RN app today — see [Try It In Your Own App](#try-it-in-your-own-app). All five run
> on device and are on the landing-page switcher, in day-to-day use. What's still catching up: the long-tail prop surface keeps widening, automated
> device coverage is just coming online, and `@symbiote-native/cli` covers **new** apps
> (`npx @symbiote-native/cli new`) but not yet wiring into an **existing** one — `add` still follows
> the example apps rather than one command. iOS stays the reference surface; Android is at canary
> parity.

**Proven on device, both platforms, RN's renderer never in the path:** every primitive
(`View` / `Text` / `Image` / `ScrollView` / `TextInput` / `Pressable` / `Switch` / `Modal` / the
`VirtualizedList` family / …), the runtime-module layer (`Platform` / `StyleSheet` / `Dimensions` /
`Alert` / `Share` / …), `Animated` on **both** the JS and native drivers, the gesture/responder
lifecycle, accessibility, and RN's JS style processors — all committing through `@symbiote-native/engine`
into Fabric. Each adapter's full surface and what's verified where lives in its README:
[**React →**](./adapters/react) · [**Vue →**](./adapters/vue) · [**Angular →**](./adapters/angular) ·
[**Svelte →**](./adapters/svelte) · [**Solid →**](./adapters/solid).

**The bar for "done" is the canary, not a percentage.** The example apps are the working spec —
they exercise the real surface and run green on an iOS simulator and an Android emulator. RN's own
surface is effectively unbounded; rather than chase a parity figure, the canary defines the
contract and stays green. **In progress:** widening the long-tail prop surface and bringing Android
fully level with the iOS reference.

---

## Testing

SymbioteNative never forks the native core, so a SymbioteNative app **is** a stock React Native app underneath.
That has a quiet payoff: **any tool that hooks RN's internals works on SymbioteNative unchanged — for every
adapter, for free.** We didn't build a test framework; we inherited RN's. The same lever that lets a
non-React renderer drive Fabric lets RN's testing, debugging, and native-module ecosystem come along
without per-framework reinvention.

- **Headless — Vitest + `node:test`.** Colocated TypeScript unit + smoke tests drive the engine
  against a fake `nativeFabricUIManager` slot (`installFabric`) and read committed Fabric props
  back — the real commit path, no simulator, mirroring RN's own Fantom approach. Native ESM/CJS
  tooling tests (the publish-output rewriter and app linker) run through Node's built-in runner.
  `pnpm test` at the workspace root runs both layers; `pnpm test:vitest` and `pnpm test:node` narrow
  one layer while developing.
- **On-device — `Detox`.** End-to-end user-journey tests run against the real app on a
  simulator/emulator. One `canary-journeys` spec is mirrored across `examples/react`,
  `examples/vue-tsx`, `examples/vue-sfc`, and `examples/svelte` — the _same_ journeys, proving each
  adapter paints and responds identically on device. `examples/angular` has its own Detox harness
  but not this shared spec yet; `examples/solid` has no Detox harness yet.
  Detox attaches with zero SymbioteNative-specific glue, because to Detox
  it is just an RN app (`e2e:build:ios` / `e2e:test:ios`, and the `android` equivalents).

The lever is the same as the renderer's: stay on RN's internals, and the whole RN ecosystem —
testing, debugging, native modules — is yours across every framework. Per-adapter commands live in
each adapter's README.

---

## Milestones

Make **React** the known-good driver first — cover its RN surface on the agnostic core, canary as
spec — then add one framework at a time on an already-validated core, so a break in a new adapter
isolates to _that adapter_, not the native pipe or the commit engine. The **framework** axis
(React → Vue → Angular → Svelte → Solid) and the **platform** axis (iOS, Android) are independent:
React already drives both platforms, and each new adapter inherits the platform axis as it lands.

Five frameworks now drive the core (React, Vue, Angular, Svelte, Solid) — the _breadth_ bet is
proven. What they still lack is _depth_: a real app needs more than primitives and a canary,
starting with navigation. That's why **M5 keeps running alongside adapter work** — porting the
minimal third-party-library surface a real app can't ship without is as urgent a proof as a new
framework adapter.

| #      | Milestone                                        | What it proves                                                                                                                                                                                                                                                                                                                                        | Status     |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **M0** | Monorepo scaffold                                | pnpm workspaces, `engine` + `react` packages, headless harness                                                                                                                                                                                                                                                                                        | ✅ done    |
| **M1** | React canary on iOS                              | native pipe, clone-on-write engine, and event→recommit                                                                                                                                                                                                                                                                                                | ✅ done    |
| **M2** | **React → React Native parity (canary surface)** | the canary's full primitive + prop + event surface on the agnostic core — green on iOS + Android                                                                                                                                                                                                                                                      | ✅ done    |
| ↳ M2.1 | Primitive surface                                | `View`/`Text`/`ScrollView`/`TextInput`/`Modal`/`FlatList`/… all driven through the engine, on device                                                                                                                                                                                                                                                  | ✅ done    |
| ↳ M2.2 | Runtime modules                                  | `Platform`/`StyleSheet`/`Dimensions`/`Appearance`/`AppState` + imperative `Alert`/`ActionSheetIOS`/`Share`/`Linking`/`Vibration`/`Keyboard`/`StatusBar`                                                                                                                                                                                               | ✅ done    |
| ↳ M2.3 | `Animated`, both drivers                         | JS + native driver (`ValueXY`/tracking/`diffClamp`); native offload proven by a JS-thread freeze                                                                                                                                                                                                                                                      | ✅ done    |
| ↳ M2.4 | Third-party native views                         | `@react-native-community/slider` via runtime ViewConfig derivation — zero SymbioteNative metadata                                                                                                                                                                                                                                                     | ✅ done    |
| ↳ M2.5 | Gestures & events                                | responder lifecycle, capture→bubble phases, `Pressable`/`Touchable*`/`PanResponder`, a11y prop layer                                                                                                                                                                                                                                                  | ✅ done    |
| ↳ M2.6 | Long-tail prop edges                             | continuous hardening of remaining components and per-prop edges as the canary surface widens — not a gate on M2                                                                                                                                                                                                                                       | 🔁 ongoing |
| **M3** | **Vue adapter**                                  | `createRenderer` + nodeOps on the validated core — first non-React framework, same canary surface                                                                                                                                                                                                                                                     | ✅ done    |
| ↳ M3.1 | Vue canary parity                                | `examples/vue-tsx` (TSX) + `examples/vue-sfc` (SFC) render the React canary's surface, minus React-only third-party components                                                                                                                                                                                                                        | ✅ done    |
| ↳ M3.2 | Shared component layer                           | `VirtualizedList` family + component logic extracted to `@symbiote-native/components`, inherited by React **and** Vue                                                                                                                                                                                                                                 | ✅ done    |
| ↳ M3.3 | Test harness per adapter                         | colocated `vitest` (headless, fake Fabric slot) + `Detox` e2e mirrored across all three example apps                                                                                                                                                                                                                                                  | ✅ done    |
| **M4** | Angular adapter                                  | `Renderer2`/`RendererFactory2` + DOM-less bootstrap on the validated core — second non-React framework, full canary component parity, on the live framework switcher                                                                                                                                                                                  | ✅ done    |
| **M5** | **App-ready ecosystem**                          | the minimal third-party surface a real app needs, built once against the agnostic core (like `@symbiote-native/slider`) rather than ported per-framework — navigation shipped, next targeting package-surface parity with Expo's SDK                                                                                                                  | 🔁 ongoing |
| ↳ M5.1 | Navigation                                       | a framework-agnostic navigation core (stack/tab/drawer state + `react-native-screens` prop folds) in `@symbiote-native/navigation`, with a thin per-adapter screen/lifecycle bridge — the `react-navigation` UI itself is React-only (`<third_party_rn_packages_are_react_only>`), so this couldn't be a wrapper, it's a genuine new shared component | ✅ done    |
| ↳ M5.2 | Small native-module wrappers                     | one-dependency proxy packages closing the gap against Expo's package set one module at a time (same recipe as `@symbiote-native/slider`/`@symbiote-native/splash-screen`) — 22 shipped (Clipboard, Haptics, Sensors, Battery, Device, and more), autolinked through `@symbiote-native/expo-modules-link`; lingering primitive-level gaps remain (persistent storage, safe-area edges beyond `SafeAreaView`) | 🔁 ongoing |
| ↳ M5.3 | Reanimated                                       | the largest remaining gap, saved for last — a full worklet-driven animation layer                                                                                                                                                                                                                                                                     | ⏳ planned |
| **M6** | **Svelte adapter**                               | a DOM-shim adapter over stock compiled Svelte output driving the engine's mutation API — third non-React framework, full component parity                                                                                                                                                                                                             | ✅ done    |
| **M7** | Solid adapter                                    | `solid-js/universal`'s `createRenderer` on the validated core, fourth non-React framework with full component parity (`createPortal`/`createTunnel`/`Animated`/`AppRegistry`), running on device and on the landing-page switcher                                                                                                                     | ✅ done    |
| **M8** | Web _(stretch)_                                  | the same trees rendered to the web as a default platform target                                                                                                                                                                                                                                                                                       | 💭 maybe   |
| **DX** | `@symbiote-native/cli` scaffolder                     | pins `react-native` + `react` at the app root so your app code imports only `@symbiote-native/*`, never `react-native`                                                                                                                                                                                                                                | 🔶 beta   |

**End goal:** each framework — Vue, Angular, Svelte, Solid, React — can render native iOS and
Android apps the same way React Native does today, off one untouched native core, **with
package-surface parity against Expo's SDK to actually build one.** Web as a default platform
target is a possible later pass.

Each adapter is built in layers (static paint → reactive update → event) so a break is
localizable.

---

## Repository Layout

```
core/
  engine/      @symbiote-native/engine     — JS command-buffer shim over the C++ retained tree
               (cpp/)                      — SymbioteTree: the retained tree + clone-on-write commit + tag-keyed platform rules + events
  components/  @symbiote-native/components  — framework-agnostic component logic (state + render), shared by every adapter
adapters/
  react/       @symbiote-native/react      — react-reconciler host config (mutation mode) + primitives
  vue/         @symbiote-native/vue         — @vue/runtime-core createRenderer + nodeOps over the engine
  angular/     @symbiote-native/angular    — Renderer2/RendererFactory2 + DOM-less bootstrap over the engine
  svelte/      @symbiote-native/svelte     — DOM shim over stock compiled Svelte output over the engine
  solid/       @symbiote-native/solid      — solid-js/universal createRenderer over the engine
packages/
  android/     @symbiote-native/android    — autolinked native host shims (keyboard, settings) for Android
  navigation/  @symbiote-native/navigation — native stack/tab/drawer navigator over react-native-screens
  slider/      @symbiote-native/slider     — third-party native-view wrapper (React + Vue + Angular + Svelte + Solid builds)
examples/
  react/       stock RN 0.86 app driven by @symbiote-native/react (the reference canary)
  vue-tsx/     the same canary in Vue 3, authored in TSX
  vue-sfc/     the same canary in Vue 3, authored in single-file components
  angular/     the same canary in Angular, standalone components
  svelte/      the same canary in Svelte
  solid/       the same canary in Solid
```

Tests are **colocated** next to the code they cover (`*.test.ts(x)` for `vitest`, `e2e/` per
example app for `Detox`) rather than gathered in one directory.

---

## Develop

Requires Node ≥ 22.13, pnpm 11, and [watchman](https://facebook.github.io/watchman/docs/install)
(macOS: `brew install watchman`) — without it, Metro's fallback file watcher opens one OS file
handle per watched directory and reliably crashes with `EMFILE: too many open files` once it's
watching a monorepo this size.

```bash
pnpm install
pnpm typecheck           # tsc --build across the workspace
pnpm test                # all headless suites: Vitest + native ESM/CJS node:test files
pnpm test:vitest         # engine/adapter tests against the fake Fabric slot only
pnpm test:node           # release-tool and native-linker node:test suites only
DEBUG=1 pnpm test        # all headless suites, with diagnostic logs on
```

To build and run a canary on a simulator/emulator — and the Detox e2e journeys — follow the
per-adapter README. Each `examples/*` is a stock React Native 0.86 app driven by SymbioteNative, and the
steps are identical bar the directory:

- **[adapters/react →](./adapters/react)** — `examples/react` (the reference)
- **[adapters/vue →](./adapters/vue)** — `examples/vue-tsx`, `examples/vue-sfc`
- **[adapters/angular →](./adapters/angular)** — `examples/angular`
- **[adapters/svelte →](./adapters/svelte)** — `examples/svelte`
- **[adapters/solid →](./adapters/solid)** — `examples/solid`

> **A note on logs.** All diagnostics go through `dlog` / `isDebug` from `@symbiote-native/engine`,
> off by default, gated by `DEBUG` (each example's `index.js` mirrors it onto
> `globalThis.__SYMBIOTE_DEBUG__` once at start, so changing it needs a fresh Metro
> `--reset-cache`, not a rebuild). They are an asset — never deleted, only added.

---

## Design Decisions

A few invariants hold the architecture together. Changing any of them is a deliberate
decision, not a drift:

- **The native core is never forked.** `react-native` is a dependency; only the JS renderer
  is replaced.
- **All clone-on-write lives in the engine's C++ tree (`SymbioteTree.cpp`).** Adapters never
  reimplement the persistence dance, and neither does the platform-parity layer — a rule keyed
  on a node's Fabric tag runs once for every adapter, not once per adapter.
- **Adapters stay thin.** Layout, commit batching, event normalization, and ViewConfig
  handling all live in the engine.
- **Layout is stock Yoga.** Taffy is out of scope — touching the C++ layout node
  turns "free RN upstream merges" into a permanent fork tax for an unmeasured
  benchmark win.

---

## FAQ

**Is this a fork of React Native?** No. `react-native` is consumed as an ordinary dependency;
its native C++/Obj-C++/JNI sources are never touched. SymbioteNative replaces only the JS renderer.

**How is this different from NativeScript or Lynx?** Both answer "native UI without React
lock-in" by maintaining their _own_ native layer — NativeScript its runtime and bindings, Lynx a
whole new engine — which means their own (much smaller) ecosystems. SymbioteNative keeps stock React
Native underneath, so Meta maintains the native layer and the RN ecosystem comes along. The full
comparison is [above](#why-not-nativescript-lynx-or-just-react-native).

**Why React first if the goal is framework independence?** React is a known-good driver. Using
it to validate the native pipe and the commit engine first means that when Vue/Svelte/Solid/
Angular break, the failure isolates to _that adapter_ — not the native stack underneath it.

**Can I use it today?** The packages are on npm — you can `npm install @symbiote-native/react` (or
`vue` / `angular` / `svelte` / `solid`) into an existing RN app today, see [Try It In Your Own
App](#try-it-in-your-own-app). It's still beta, but the API is settled — `npx @symbiote-native/cli new`
scaffolds a fresh app; wiring into an existing one (`add`) isn't automated yet, so Metro/CocoaPods
wiring there follows the example apps rather than one command. The thesis is proven —
**five** frameworks (React, Vue 3, Angular, Svelte, and Solid) drive the agnostic core on iOS + Android with RN's renderer
never in the path. You can read the architecture, run the `vitest` suite and the `Detox` journeys,
drive any of the five canaries, and follow the milestones.

**Do I have to write tests from scratch?** No — and that's a feature of the design. Because a
SymbioteNative app is a stock RN app underneath, RN's testing tools apply unchanged: a headless `vitest`
harness against a fake Fabric slot and on-device `Detox` journeys, both already wired across every
example app. See [Testing](#testing).

---

## License

[MIT](./LICENSE).
