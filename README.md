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
publishes **37 packages** in all. Beyond the five adapters and the shared core, 28 companion
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

|                    | Whose native layer                   | Frameworks                                | What it costs you                                       |
| ------------------ | ------------------------------------ | ----------------------------------------- | ------------------------------------------------------- |
| **React Native**   | Meta's Fabric / Yoga / Hermes        | React only                                | React lock-in                                           |
| **NativeScript**   | its own runtime and bindings         | JS/TS, Angular, Vue, Solid, Svelte, React | leaving RN's ecosystem for its own                      |
| **Hippy**          | its own C++ DOM and layout engine    | React, Vue                                | leaving RN's ecosystem for Tencent's                    |
| **Lynx**           | its own engine (PrimJS, dual-thread) | React, Vue                                | an 18-month-old ecosystem, mostly hand-written bridging |
| **SymbioteNative** | **stock, unforked React Native**     | React, Vue 3, Angular, Svelte, Solid      | ecosystem packages are wrapped by hand, Angular is slower than stock                 |

The difference is the row you read first. All three alternatives wrote their own native layer, so
picking one means adopting its ecosystem too. As far as we have verified, SymbioteNative is the only
one reusing React Native's own unforked Fabric/JSI/Yoga pipeline as the shared native backend: Meta
keeps maintaining the native half, upstream releases keep arriving, and Detox, the debugger and
native modules work because underneath it really is an RN app.

The price of that bet is the other direction. We stay inside what Fabric can already do, where a
project owning its runtime can change it.

The costs:

- **Angular is slower than stock**: 1.15x stock on a create-shaped row where Solid is 0.72x.
  Most of what is left is Angular's own per-component machinery rather than the adapter. The numbers
  are [below](#how-fast-against-stock-react-native).
- **Ecosystem packages are wrapped by hand, one at a time.** The _native view_ comes for free,
  through the same ViewConfig path as our own primitives, with zero SymbioteNative metadata. The JS
  surface around it does not, because a library's own component body is React internally. So each
  package gets a thin agnostic wrapper written here: no native code, no forking, a few hundred
  lines. Cheap per package, but manual, so the covered surface grows one library at a time.

Their multi-framework support is real and current, not a claim we are discounting: NativeScript
maintains five live flavors, Hippy ships React in QQ and Tencent News, and Vue Lynx has its own docs
site and about half of Lynx's usage. The row that differs is whose native layer runs underneath.

The wrapping cost has one mechanism behind it: a library's JS component calls React hooks in its own
body, so under a non-React adapter the dispatcher is null and it throws. The _native view_ is
unaffected. [`@symbiote-native/slider`](./packages/slider) is the reference shape for reaching one
without importing the library's React component.

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

Freeing you from React is worth nothing if the app gets slower. `examples/bare-rn` is plain React
Native 0.86 on React's own Fabric renderer, carrying a port of the same benchmark screen and zero
`@symbiote-native/*` dependencies. Being untouched by this project is the only thing it is for.

The workload is the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
operation list. Each row builds ten native views (three `View`, three `Text`, three raw text nodes, a
`TextInput`), so a run commits just over 10 000 nodes: 10 002 for stock, 10 003 for an adapter, which
mounts a container view of its own.

### On a device

iPhone 17 / iOS 26.5 simulator, Release, 2026-09-22. Best of three to five runs per column, minimum
taken. Ratio is ours over stock.

| 1 000 rows | stock RN |          React |           Vue |         Solid |        Svelte |       Angular |
| ---------- | -------: | -------------: | ------------: | ------------: | ------------: | ------------: |
| Create     |    278.1 |  228.1 / 0.82x | 231.4 / 0.83x | 201.3 / 0.72x | 200.8 / 0.72x | 320.3 / 1.15x |
| Replace    |    289.0 |  252.6 / 0.87x | 254.6 / 0.88x | 218.7 / 0.76x | 268.5 / 0.93x | 351.5 / 1.22x |
| Partial    |     33.2 |   20.2 / 0.61x |  15.5 / 0.47x |  10.7 / 0.32x |  14.2 / 0.43x |  23.5 / 0.71x |
| Select     |     10.8 |    5.9 / 0.55x |   4.8 / 0.44x |   5.5 / 0.51x |   8.4 / 0.78x |  15.3 / 1.42x |
| Swap       |     10.7 |   27.8 / 2.60x |   7.4 / 0.69x |   5.4 / 0.50x |   7.0 / 0.65x |  17.9 / 1.67x |
| Remove     |    126.3 |   36.4 / 0.29x |   6.3 / 0.05x |   9.3 / 0.07x |   7.5 / 0.06x |  19.2 / 0.15x |
| Append     |    398.0 |  292.8 / 0.74x | 252.4 / 0.63x | 203.7 / 0.51x | 197.6 / 0.50x | 336.8 / 0.85x |
| Clear      |     10.8 |   13.9 / 1.29x |  11.7 / 1.08x |  11.8 / 1.09x |  10.6 / 0.98x |  39.9 / 3.69x |

`Remove` is where the architecture is worth the most: one row out of a thousand costs stock 126.3 ms
against 6.3-19.2 for an adapter. The reason is a node count, not a millisecond. A persistent renderer
hands Fabric a rebuilt path, so it re-lays out ~7 000 Yoga nodes where we replace one slot and it
re-lays out ~1 000.

Angular is the one adapter above stock, and it is Angular rather than the adapter: its row is a live
component instance (an LView, a DI scope, two `EventEmitter`s, ~81 us each) where the other four lower
to an intrinsic tag. A simulator charges more for exactly that.

React's `Swap` is the mutation-mode tax. We drive React's reconciler in mutation mode against stock's
persistent mode, deliberately, so the clone-on-write path cannot be quietly skipped. The engine is
3.3 ms of that row and not one prop write crosses; ~15 ms is React's own mutation commit with a host
config doing nothing. No other adapter pays it.

Only the React column stops its clock where stock does, in a `useLayoutEffect`. The other four stop in
the engine's post-commit hook one phase earlier, because Vue, Svelte, Solid and Angular commit on a
microtask and no React phase means anything to them. React prices that phase at 6.6 ms of its own
`Create`, so read those four as a floor.

**The single JSI crossing holds up on hardware.** Our commit carries a 12 000-entry `Int32Array` that
C++ walks element by element; stock's is ten thousand calls carrying scalars. If reading that buffer
were the expensive half, decode would dominate the crossing. It is 1.8% of it, against 8% on
JavaScriptCore, and a step stays at one crossing rather than fragmenting into one per mutation.

### Headless

`bench:itest` Release on Hermes as `hermesc -O` bytecode, the engine and the compiler a release app
ships. Best of three, one arm per run, one sitting, 2026-09-22. Stock is React's own Fabric renderer
in the same harness driving React Native's own `<View>` and `<Text>`.

| 1 000 rows | stock RN |         React |           Vue |         Solid |        Svelte |       Angular |
| ---------- | -------: | ------------: | ------------: | ------------: | ------------: | ------------: |
| Create     |    125.2 | 102.2 / 0.82x | 100.9 / 0.81x |  78.3 / 0.63x |  89.3 / 0.71x | 113.0 / 0.90x |
| Replace    |    137.1 | 111.7 / 0.81x | 122.6 / 0.89x |  91.7 / 0.67x | 123.7 / 0.90x | 123.1 / 0.90x |
| Partial    |     18.7 |   8.6 / 0.46x |   8.3 / 0.44x |   6.5 / 0.35x |   7.1 / 0.38x |   6.1 / 0.33x |
| Select     |     11.7 |  12.0 / 1.03x |  12.6 / 1.08x |  15.7 / 1.34x |  11.9 / 1.02x |  11.1 / 0.95x |
| Swap       |     13.6 |  22.5 / 1.65x |   4.6 / 0.34x |   6.1 / 0.45x |   4.8 / 0.35x |   4.3 / 0.32x |
| Remove     |     15.7 |   5.0 / 0.32x |   4.8 / 0.31x |   7.2 / 0.46x |   3.9 / 0.25x |   4.0 / 0.25x |
| Append     |    137.1 | 122.5 / 0.89x | 116.9 / 0.85x | 105.7 / 0.77x | 108.1 / 0.79x | 131.8 / 0.96x |
| Clear      |     16.2 |  12.2 / 0.75x |  15.3 / 0.94x |  16.0 / 0.99x |  15.9 / 0.98x |  23.1 / 1.43x |

The headless ruler transfers to hardware for four of the five adapters: React 0.82 to 0.82 on `Create`,
Vue 0.81 to 0.83, Svelte 0.71 to 0.72, Solid 0.63 to 0.72. Angular is the one that does not (0.90 to
1.15), which is what a component instance per row costs once a real pipeline is underneath it.

`Clear` is each framework disposing 2 000 component instances; our engine is 3-5 ms of it. `Select` is
flat across all six because it is Fabric's: a layout-dirty style change on one row re-lays out the
whole tree, for stock's renderer exactly as for ours.

No column carries an exemption. Every arm writes the same props and commits the same tree, and each
row asserts that before it reads a millisecond.

### How it is kept honest

- **Counters before milliseconds.** Two columns whose node or prop-key counts differ are not one
  workload. This has caught a stock app not rebuilt after the row gained a node, and an adapter whose
  "win" was a step that committed nothing.
- **Release only.** The same comparison read 13% _faster_ in Debug and 30% slower in Release. The sign
  of the headline metric flips.
- **One ruler, one sitting, minimum of N.** Timing noise only ever adds, so the minimum is the reading
  and a mean carries every interruption into the ratio.

Both tables have been corrected more than once, always by finding the ruler wrong rather than the
code: a JavaScriptCore harness for an engine that ships Hermes, a harness that skipped Hermes's
optimizer, a stock column built from Fabric view names instead of the components a real app renders,
and two benchmark screens stopping their clocks a React phase apart. The method above is what those
cost.

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

**Angular is the slowest adapter, and on a device it is the only one slower than stock** (1.15x on a
thousand-row create, 3.69x on `Clear`; the other four run 0.72-0.83x). The cost is Angular's own, not
the adapter's: a row component instance is about 81 us in LViews, DI scopes and `EventEmitter`s,
measured against the identical row inlined, and `Clear` is Angular tearing 2 000 of them down while
the engine's share of that step is 2.4-3.8 ms on every adapter alike.

The bar for "done" is the canary, not a percentage. RN's surface is effectively unbounded, so the
example apps are the working spec and they stay green.

---

## Testing

SymbioteNative never forks the native core, so a SymbioteNative app **is** a stock React Native app
underneath. **Any tool that hooks RN's internals works unchanged, for every adapter, for free.** We
did not build a test framework; we inherited RN's.

Detox attaches with zero SymbioteNative-specific glue, because to Detox this is just an RN app. One
shared `canary-journeys` spec runs identically across the React, Vue and Svelte canaries, which is
what proves each adapter paints and responds the same way on device.

Alongside it, 93 integration fixtures drive the real C++ engine headlessly, including React's own
Fabric renderer as a baseline arm. A second host build compiles the Android branches, so a
platform-split rule is tested in a build that actually contains it.

Commands, layers and what each one covers: [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

[MIT](./LICENSE).
