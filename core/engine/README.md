# @symbiote-native/engine

The package at the bottom of [SymbioteNative](../../README.md) that every framework adapter
(`@symbiote-native/react`, `@symbiote-native/vue`, `@symbiote-native/angular`, …) drives, and the
only place the mutation→clone-on-write translation into React Native's Fabric exists. **The
retained tree itself lives in C++ now**, in `cpp/SymbioteTree.cpp`, reached through this package's
`src/` — a node handle returned to JS is a thin reference into that native tree, not a JS object
holding the tree's state.

An adapter still mutates a node cheaply (`appendChild` / `setProp` / `removeChild` …), but each
call now appends an op to the current commit's buffer instead of touching a tree directly. On
commit, the whole buffer crosses into C++ in **one** JSI call; `SymbioteTree` applies the ops
against the retained tree, clones only what changed, resolves the platform-parity rules keyed on
each node's Fabric tag (`cpp/SymbioteFabricProps.cpp` — RN's own component-level behavior, like
`Pressable`'s `disabled` fold or a `<Text>`'s default `ellipsizeMode`, ported once instead of per
adapter), and calls into Fabric's C++ `UIManager` directly to commit — the persistent,
clone-on-write dance Fabric requires, done **once**, for every framework, with one crossing per
commit instead of one per mutation.

> New to SymbioteNative? The [root README](../../README.md) has the architecture and the one fact it
> rests on — React is just _one client_ of `nativeFabricUIManager`. This package is what sits
> between every adapter and that native slot.

---

## Who calls this, directly vs. indirectly

**Most consumers never import this package by name.** An app written against
`@symbiote-native/react`/`@symbiote-native/vue`/`@symbiote-native/angular` never calls `createElement` or
`setProp` itself — the adapter's reconciler does that on the app's behalf. You reach for
`@symbiote-native/engine` directly only when:

- you are **writing or debugging a framework adapter** (a `react-reconciler` host config, a Vue
  `createRenderer`, an Angular `Renderer2`) — this is its primary audience;
- you need one of the **framework-agnostic runtime modules** it re-exports (`Platform`,
  `StyleSheet`, `Dimensions`, `Alert`, `Animated`, …) — every adapter re-exports these verbatim, so
  most apps still reach them through `@symbiote-native/react` etc., not this package.

The mutation API below is intentionally low-level and closely mirrors Fabric's own persistent
semantics — it is an internal seam, not an app-facing API.

### Install

Most apps get this transitively, through an adapter (`@symbiote-native/react`,
`@symbiote-native/vue`, `@symbiote-native/angular` all depend on it). Writing or debugging an
adapter yourself:

```bash
npm install @symbiote-native/engine
```

---

## The mutation API — `core/engine/src/node.ts`

The entire surface a renderer seam drives:

```ts
import {
  createElement,
  createRawText,
  createAnchor,
  appendChild,
  insertBefore,
  removeChild,
  routeProp,
  setEventListener,
  setProp,
  setText,
} from '@symbiote-native/engine';

const node = createElement('RCTView'); // component IS the Fabric view name
const text = createRawText('Hello');
appendChild(node, text);
routeProp(node, 'onPress', () => {}); // ← the flat-bag entry point (React/Vue/Solid):
//   decides event-vs-prop via the ViewConfig,
//   NOT by the "onX" naming convention
```

`routeProp` is the one call a flat-bag adapter should route every prop through — a **structural**
adapter (Angular's `Renderer2.listen`, Svelte's `addEventListener`) already knows the event name
and calls `setEventListener` directly instead.

### Committing — `SymbioteSurface`

```ts
import { createSurface } from '@symbiote-native/engine';

const surface = createSurface(rootTag);
surface.appendChild(root, node);
surface.commit(); // synchronous — for a framework that already batches (React)
// surface.requestCommit(); // microtask-coalesced — for reactive frameworks (Vue/Svelte/Angular)
```

Every imperative call in the bridge below (`dispatchViewCommand`, `measure`, `setNativeProps`, …)
is gated on the node having actually committed — see `whenCommitted` for wiring a native call
before a tag is guaranteed to exist.

---

## What else it exports

- **The imperative/native bridge** — `dispatchViewCommand`, `measure` / `measureInWindow` /
  `measureLayout`, `getNativeTag`, `getNativeNode`, `setNativeProps`, `sendAccessibilityEvent`,
  `whenCommitted`, `toPublicInstance` (the `ref` handle every adapter grafts onto a host node).
- **Runtime modules**, framework-agnostic, re-exported by every adapter: `Platform`,
  `StyleSheet` (+ `computeHairlineWidth`), `Dimensions`, `PixelRatio`, `Appearance`, `AppState`,
  `Keyboard`, `AccessibilityInfo`, `BackHandler`, `PermissionsAndroid`, `LayoutAnimation`,
  `InteractionManager`, `PanResponder`, `StatusBar`, and the imperative modules `Alert`, `Share`,
  `ActionSheetIOS`, `Linking`, `Vibration`, `ToastAndroid`, `Settings`, `I18nManager`.
- **Host behaviors** (`registerHostBehavior` / `IHostBehavior` / `hasHostBehaviors` /
  `clearHostBehaviors` / `appListenerFor` / `setBehaviorListener` / `requestCommitFor`) — the
  registry that lets a primitive's state machine live directly on the engine node instead of inside
  a framework component, so `pressable`/`switch`/`text-input`/`image` are bare intrinsic tags.
  `@symbiote-native/components` registers its behaviors against this seam; the engine never imports
  them back.
- **`Animated`** — both the JS and native driver (`timing` / `spring` / `decay` / `loop` /
  `ValueXY` / tracking / `diffClamp` / `Easing`), including the native-event attachment path
  (`attachNativeEvent`, `AnimatedEvent`).
- **The style pipeline** — `flattenStyle`, the CSS-style processors RN itself runs in JS
  (`processBoxShadow`, `processFilter`, `processTransform`, `processTransformOrigin`,
  `processAspectRatio`, `processFontVariant`, `processBackgroundImage`), and the runtime
  **class-name registry** (`registerRules` / `resolveClassName` / `renameClassTokens`) that
  `@symbiote-native/css-parser`'s build-time output resolves against — shared by every adapter's
  `class` / `className` / `addClass` prop path.
- **`AppRegistry` core** (`createAppRegistry`) — registry bookkeeping + headless-task plumbing;
  each adapter supplies only its own `runnableFor`.
- **`dlog` / `isDebug`** — the diagnostic-logging seam every adapter and this package route
  through, gated by the `DEBUG` env var, never a bare `console.log`.

## What it does NOT do

- It does not know about React, Vue, Angular, JSX, templates, or reactivity — an adapter maps its
  own framework idioms onto this API, never the other way around.
- The JS side (`src/`) does not touch Fabric, JSI, or Yoga directly — it only builds the
  command buffer and hands it to `SymbioteTree` in one crossing. That C++ tree is the layer
  that actually calls Fabric's `UIManager` (`createNode` / `cloneNodeWithNewProps` /
  `appendChildToSet` / `completeRoot`), the same framework-agnostic seam React's own renderer
  uses further up, from JS, through `nativeFabricUIManager`.
- It is not a component library — visual components (Switch, Modal, the lists, …) live in
  [`@symbiote-native/components`](../components), built on top of this package's `Descriptor`-free
  mutation API.

## Related packages

- [`@symbiote-native/components`](../components) — the framework-agnostic component layer (state +
  render), built on this engine.
- [`@symbiote-native/react`](../../adapters/react) / [`@symbiote-native/vue`](../../adapters/vue) /
  [`@symbiote-native/angular`](../../adapters/angular) — the framework adapters that drive this API.
- [`@symbiote-native/css-parser`](../css-parser) — compiles CSS into the style objects this package's
  `style-registry` resolves at runtime.

## Test it

```bash
pnpm test              # vitest, from the workspace root — headless, against a fake Fabric slot
DEBUG=1 pnpm test       # same, with diagnostic logs on
```

That covers the JS side (`src/`) against a fake `nativeFabricUIManager`. `SymbioteTree` itself
(`cpp/`) has its own test tiers, run from the workspace root:

```bash
pnpm test:cpp           # gtest unit tests over SymbioteTree, asserts on — the build every PR runs
pnpm test:itest         # the JS-driven correctness suite (core/engine/cpp/tests/js/*.itest.ts*),
                         # a real six-adapter integration harness against the C++ tree, asserts on
pnpm bench:itest        # the same itest harness, Release build (NDEBUG + -O) — for timings, never asserts
pnpm test:android       # test:itest built with -DSYMBIOTE_PLATFORM_ANDROID=ON, for the #ifdef ANDROID rules
```

Never read `test:itest`'s timings — that build has asserts on and is measurably slower than what
ships; use `bench:itest` for anything you intend to quote a millisecond from.
