# @symbiote-native/engine

## 0.3.0

### Minor Changes

- 3acd869: Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
  component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
  companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
  census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
  landing alongside it) build on.

## 0.2.0

### Minor Changes

- 388c353: Make a partial `:global(...)` work inside a larger selector. `:global()` is the escape hatch for
  reaching markup a scoped style block does not own, and reaching into part of a descendant chain
  (`.card :global(.legacy-widget) span`) is its main use, not an edge case - but only a whole-selector
  wrapper was ever unwrapped. Anything else fell through the parser's guards and registered nothing.

  The wrapper is now erased wherever it sits, and its payload participates exactly as if written bare,
  following Svelte's per-part semantics rather than Vue's. Vue's `pluginScoped` replaces the WHOLE
  complex selector with the wrapper's contents, so `.card :global(.reset)` would collapse to a
  stylesheet-wide `.reset` and throw the `.card` half away - a scoped rule silently leaking globally,
  the opposite of what `<style scoped>` promises. One registry serves every adapter here, so the
  conservative reading wins.

  New export `globalClassTokensIn`, the token-level twin of the existing key-level
  `globalClassNamesIn`: it answers which MARKUP token stays unsuffixed, where the older function
  answers which registered key is global. Both the Vue SFC transformer and the Svelte scoped-style
  preprocessor consume it, so a token from a `:global()` payload is no longer scope-mangled while the
  rest of its selector is correctly scoped.

  `globalClassNamesIn` was rewritten to walk the parser's own tokenizer instead of matching text, and
  now returns a key only when every token in the selector came from a payload. Without that, a fully
  global COMPOUND selector (`:global(.btn.primary)`) would have regressed the moment token exemption
  landed: its key would have stayed suffixed while its tokens went exempt, leaving the rule dead. It
  also drops a false positive where `.reset { }` beside `.card :global(.reset) { }` unscoped the
  file's own rule.

  Fixes a latent tokenizer bug found alongside: a descendant chain link collected only its first
  class, so `.card .btn.primary` registered as `cardBtn` - a key no element carrying all three classes
  resolves to.

  The runtime half now meets the build-time one. Both halves of a partial `:global()` were correct on
  their own and still could not find each other: the two are suffixed by DIFFERENT rules - the
  registered key as a whole (`cardLegacy__<scope>`, because the rule still only applies where the
  file's own `.card` does), the markup token not at all (`legacy`, because that is what the escape
  hatch means). The engine's compound lookup rebuilds a scoped key by factoring the shared suffix out
  of the element's tokens, and it gave up the moment any token had none - which is every partial
  `:global()`, and every class handed down from a parent component. It now treats an unscoped token as
  contributing its own name and no scope, so the one scope present is still factorable. Two tokens
  carrying DIFFERENT suffixes still do not resolve: no rule legitimately spans two components.

  That widening is real and deliberate: a fully-scoped `.card.reset` collapses to the same key a
  `.card :global(.reset)` does, so an element carrying a foreign `reset` now matches a rule its author
  scoped to their own. The key format cannot tell the two apart - separating them needs a registry
  indexed by token set, with per-token scope, which is a larger change than this fix. Recorded in
  `scoped-conformance.test.ts` beside the behavior it comes with.

- 388c353: Stop the React adapter from swallowing render errors. `createContainer` takes three error
  callbacks and all three were `noop`: a throw anywhere in render made the reconciler abandon the
  commit, so nothing painted - and nothing was logged either. The app showed a blank screen with an
  empty console, which reads as "the renderer is broken" rather than "your component threw". It cost
  this repo a workaround already: a test that needed to prove a throw had to wrap the tree in an
  error boundary, because `mount()` itself reported nothing.

  All three now route to the host: uncaught (no boundary), caught (a boundary handled it, which
  decides what the USER sees, not whether the developer hears about it), and recovered. React's own
  defaults do the same thing - `reportGlobalError` / `console.error` in ReactFiberErrorLogger - and
  React Native wraps them again to reach the redbox.

  The fourth callback, `onDefaultTransitionIndicator`, stays a no-op on purpose. RN's own renderer
  says why in as many words: "Native doesn't have a default indicator."

  New engine export `reportUncaughtError(error, { origin, componentStack })`, the shared seam for
  any adapter that catches something its framework would otherwise have surfaced itself. It reaches
  `global.ErrorUtils` on a native host - the documented global RN's own
  `Libraries/vendor/core/ErrorUtils.js` is a one-line re-export of, so no deep import into RN's
  internals - and falls back to `console.error` anywhere else. Exactly one channel, never both: RN
  routes `console.error` into LogBox too, and upstream suppresses its own log for that same reason.
  A thrown non-Error is wrapped so the reporter still gets a message and a stack, and the component
  stack is attached the way LogBox reads it.

  This is deliberately not the `dlog` channel. `dlog` is DEBUG-gated and therefore the developer's;
  an error that blanked the screen has to reach the app whether or not anyone turned diagnostics on.

- 388c353: Move the AnimatedProps leaf lifecycle into the engine, where it should always have lived. Building
  a leaf from the current props, swapping it into the value graph new-before-old, binding it to the
  committed node, going native, rebinding native event props - none of that is framework-specific,
  and yet it was written four times, once per adapter. They drifted, which is the whole reason this
  is a changeset and not a refactor.

  Only the Svelte copy ever grew a rebuild guard, after a day of on-device debugging: without it,
  every scroll-driven passthrough tick tore down and reconnected a brand-new native node even though
  nothing animated-relevant had changed, and a reconnect landing exactly when scrolling stopped left
  the view frozen at its post-reset default. The other three copies each look like they have an
  equivalent and do not. React's `useMemo(() => new AnimatedProps(rest), [rest])` reads like the same
  reference check but never was one - `rest` comes out of a rest-destructure, so the dependency is a
  fresh object on every render. Vue's `pendingLeaf === null` answers "has render run yet", not "did
  anything change". Angular had nothing at all.

  New engine export `createAnimatedLeafLifecycle(label)`. All four adapters now drive it and supply
  only what is genuinely theirs: WHEN to reconcile (an effect, `onUpdated`, `ngOnChanges`, a
  `$effect`) and HOW to resolve the host node. Angular additionally keeps its `whenCommitted`
  deferral, which its batched zoneless change detection requires.

  The guard compares props per key by IDENTITY against a stored SNAPSHOT, never against the caller's
  own object. That distinction is load-bearing rather than defensive: a caller may legitimately hand
  back the same object every update and mutate what its keys resolve to (Svelte's rest proxy does
  exactly this), so storing the reference would compare it with itself, read the same current values
  through both sides, and conclude nothing ever changes. The rebuild would then be skipped forever
  and a rebuilt interpolation would never reach the native graph - on device, a sticky header that
  ignores scrolling entirely.

  It is also gated on the leaf already being native, and that gate points the other way: before the
  first native connection reconcile must run on every call, because that cadence is what wires a
  rebuilt interpolation into the shared value's children. Skipping there strands the new node, its
  listener never fires, and the debounce that would have promoted the chain to native never settles.

  Only the NATIVE half of a reconcile is deferrable, via an optional `scheduleNativeBind` callback -
  Angular passes `bind => whenCommitted(node, bind)` because its batched zoneless change detection has
  no committed Fabric tag at `ngAfterViewInit`. Building the leaf and attaching it to the value graph
  is always synchronous, and that split is load-bearing rather than tidy: a deferred build sits behind
  a canceller the next reconcile drops, so a component reconciling faster than it commits attaches
  nothing at all and a sticky header's rebuilt interpolation never reaches the graph.

  Behavior is unchanged for React, Vue and Svelte beyond the guard the first two never had. No public
  component API moves.

### Patch Changes

- 388c353: Fix `.interpolate()` throwing `interpolation factory not registered` in release builds only.
  `AnimatedInterpolation` lived in its own module whose load-time side effect registered the factory
  `AnimatedNode.interpolate()` needs. Metro enables `inlineRequires` for production only, which moves
  a `require()` down to the first place its binding is used as a value, and a barrel's re-export
  compiles to a lazy getter. Nothing ever named `AnimatedInterpolation` as a value — adapters only
  type it, and `verbatimModuleSyntax` erases that — so the module never evaluated and the
  registration never ran. Development builds were fine, `tsc` saw nothing, and the code was present
  in the bundle, just never executed.

  `AnimatedInterpolation` now lives in `animated/graph.ts` beside the base class it extends, and
  `interpolate()` constructs it directly, so there is no registration left to skip. Colour handling
  moves to `animated/rgba.ts` alongside it. A load-time registration test guards the pattern.

- 388c353: Fix compound selectors (`.card.featured`) under a scoped `<style>` block. The parser emitted the
  compound rule as a replacement for the single-class rules it built on instead of a layer over
  them, so an element carrying both classes lost everything `.card` alone had declared and kept only
  what `.card.featured` restated. Unscoped stylesheets were unaffected, which is why this survived:
  the scope-suffixed class name is what pushed the rule down the wrong path.

  The engine's style registry resolves the layered form correctly for every adapter, so the fix
  lands identically through React's `className`, Vue's `class`/`:class`, Angular's
  `class`/`[ngClass]`, and Svelte's `class` — verified against a compound-class demo now present on
  every canary.

- 388c353: Four unrelated defects, each small and each previously invisible in tests.

  **`keep-awake` leaked a listener across teardown.** Activation is async and nothing guarded the
  window: a consumer that unmounted before it resolved still got a listener registered afterwards,
  attached to something gone, with nothing left to remove it. React was half-clean - it had the
  unmount guard but discarded the subscription, so a listener attached during a NORMAL mount was
  never removed either. A shared attachment helper now refuses to attach after release and removes
  anything that already landed; all four adapters use it.

  **`clipboard.hasStringAsync` threw synchronously** where its eight siblings reject. It was declared
  `function`, not `async`, so the `UnavailabilityError` escaped at the call site before a promise
  existed - `hasStringAsync().catch(handler)` never reached the handler. (Upstream expo has the same
  split at `Clipboard.ts:57`; diverging here because a guard that fires differently from every other
  method in one API is a trap, not a wart.)

  **`AnimatedValue.resetAnimation` reset only the JS side.** The native graph keeps its own copy of
  the value, so a native-driven node stayed wherever the animation stopped while JS believed it had
  been reset - visible on device, invisible to every JS-driven test. `setValue` already pushed for
  this reason; RN pushes here too.

  **Vue's `setElementText` built an invalid Fabric tree in silence.** `insert()` throws when a raw
  text lands under a non-`<Text>` parent, but Vue routes an element's single string child through
  `setElementText`, which had no such check - so the same invalid tree the array path rejects was
  accepted quietly. It now enforces the same invariant. Only reachable from a hand-written `h()` on a
  raw intrinsic; the `View` wrapper passes children as slots and already hit the guard.

  **Svelte's web-only-construct guard missed namespace imports.** It inspected named import
  specifiers, which a namespace import has none of, so `import * as R from 'svelte/reactivity'`
  carried the banned `MediaQuery` straight through - a browser-only API that answers `false` to every
  query on a native host, indistinguishable from a legitimate no. A namespace import of a module with
  banned members is now refused, since the preprocessor cannot tell statically which members it
  reaches.

## 0.1.7

### Patch Changes

- 1791d13: Consolidate `Animated`'s duplicated boilerplate: `interpolate()` now has a single real implementation on `AnimatedNode` (`graph.ts`), injected into `interpolation-node.ts` via a registered factory, removing seven duplicate overrides across `value.ts`/`operators.ts`/etc. `AnimatedAddition`/`Subtraction`/`Multiplication`/`Division` now share a private `AnimatedBinaryOp` base for their `__attach`/`__detach`/`__makeNative` wiring instead of each reimplementing it. No behavior change. Existing tests pass unmodified, with added coverage for the shared boilerplate itself.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- 1791d13: Fix `LayoutAnimation`'s `resolveUIManager` carrying a dead fallback native-module name (`'FabricUIManager'`) that can never resolve on a real device: RN never registers a TurboModule under that name. It now mirrors React Native's actual two-mechanism resolution: read `globalThis.nativeFabricUIManager`'s layout-animation capability directly first (Fabric's JSI global slot, not a TurboModule), then fall back to the single correctly-named `getNativeModule('UIManager')`.
- 1791d13: Extract a shared `type-guards.ts` (`isRecord`/`isBoolean`/`isNumber`/`isString`) out of roughly twenty independently-reimplemented copies scattered across the engine, standardizing on the stricter, array-excluding `isRecord` definition. No call site's runtime behavior changes - no input previously relied on the looser, array-permissive check.
- 1791d13: Split `commit.ts` into three modules by responsibility: `platform-color.ts` (color processing), `fabric-props.ts` (generic Fabric-prop translation), and `commit.ts` itself (reconciler + imperative instance API). Also breaks the real `commit.ts <-> process-*` dependency cycle by having `process-box-shadow`/`process-filter`/`process-background-image` import `processColor` from `platform-color.ts` directly, and consolidates the `ActionSheetManager` native-module contract so `share/index.ios.ts` imports it from `action-sheet-ios/index.ts` instead of redeclaring it. No behavior change.
- 56ef0d9: Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
  `LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
  into a package's tarball at pack/publish time when the package has none of its own — confirmed
  against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
  `package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
  own license check was missing on all eleven packages.

## 0.1.6

### Patch Changes

- 1791d13: Consolidate `Animated`'s duplicated boilerplate: `interpolate()` now has a single real implementation on `AnimatedNode` (`graph.ts`), injected into `interpolation-node.ts` via a registered factory, removing seven duplicate overrides across `value.ts`/`operators.ts`/etc. `AnimatedAddition`/`Subtraction`/`Multiplication`/`Division` now share a private `AnimatedBinaryOp` base for their `__attach`/`__detach`/`__makeNative` wiring instead of each reimplementing it. No behavior change. Existing tests pass unmodified, with added coverage for the shared boilerplate itself.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- 1791d13: Fix `LayoutAnimation`'s `resolveUIManager` carrying a dead fallback native-module name (`'FabricUIManager'`) that can never resolve on a real device: RN never registers a TurboModule under that name. It now mirrors React Native's actual two-mechanism resolution: read `globalThis.nativeFabricUIManager`'s layout-animation capability directly first (Fabric's JSI global slot, not a TurboModule), then fall back to the single correctly-named `getNativeModule('UIManager')`.
- 1791d13: Extract a shared `type-guards.ts` (`isRecord`/`isBoolean`/`isNumber`/`isString`) out of roughly twenty independently-reimplemented copies scattered across the engine, standardizing on the stricter, array-excluding `isRecord` definition. No call site's runtime behavior changes - no input previously relied on the looser, array-permissive check.
- 1791d13: Split `commit.ts` into three modules by responsibility: `platform-color.ts` (color processing), `fabric-props.ts` (generic Fabric-prop translation), and `commit.ts` itself (reconciler + imperative instance API). Also breaks the real `commit.ts <-> process-*` dependency cycle by having `process-box-shadow`/`process-filter`/`process-background-image` import `processColor` from `platform-color.ts` directly, and consolidates the `ActionSheetManager` native-module contract so `share/index.ios.ts` imports it from `action-sheet-ios/index.ts` instead of redeclaring it. No behavior change.

## 0.1.5

### Patch Changes

- 1791d13: Consolidate `Animated`'s duplicated boilerplate: `interpolate()` now has a single real implementation on `AnimatedNode` (`graph.ts`), injected into `interpolation-node.ts` via a registered factory, removing seven duplicate overrides across `value.ts`/`operators.ts`/etc. `AnimatedAddition`/`Subtraction`/`Multiplication`/`Division` now share a private `AnimatedBinaryOp` base for their `__attach`/`__detach`/`__makeNative` wiring instead of each reimplementing it. No behavior change. Existing tests pass unmodified, with added coverage for the shared boilerplate itself.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- 1791d13: Fix `LayoutAnimation`'s `resolveUIManager` carrying a dead fallback native-module name (`'FabricUIManager'`) that can never resolve on a real device: RN never registers a TurboModule under that name. It now mirrors React Native's actual two-mechanism resolution: read `globalThis.nativeFabricUIManager`'s layout-animation capability directly first (Fabric's JSI global slot, not a TurboModule), then fall back to the single correctly-named `getNativeModule('UIManager')`.
- 1791d13: Extract a shared `type-guards.ts` (`isRecord`/`isBoolean`/`isNumber`/`isString`) out of roughly twenty independently-reimplemented copies scattered across the engine, standardizing on the stricter, array-excluding `isRecord` definition. No call site's runtime behavior changes - no input previously relied on the looser, array-permissive check.
- 1791d13: Split `commit.ts` into three modules by responsibility: `platform-color.ts` (color processing), `fabric-props.ts` (generic Fabric-prop translation), and `commit.ts` itself (reconciler + imperative instance API). Also breaks the real `commit.ts <-> process-*` dependency cycle by having `process-box-shadow`/`process-filter`/`process-background-image` import `processColor` from `platform-color.ts` directly, and consolidates the `ActionSheetManager` native-module contract so `share/index.ios.ts` imports it from `action-sheet-ios/index.ts` instead of redeclaring it. No behavior change.

## 0.1.4

### Patch Changes

- 706e52f: Fix `scripts/fix-esm-extensions.mjs` baking a literal `/index.js` extension folder-as-module directory imports (`component-names/`, `share/`, `alert/`, `platform/`, `status-bar/`, `accessibility-info/`, `linking/`, ...) that also carry `index.ios.js`/`index.android.js` siblings. Once the specifier is explicit, Metro's platform-extension layering never runs, so every platform silently resolved to the same (iOS-hardcoded, headless-fallback) file — on Android this surfaced as `Can't find ViewManager 'PullToRefreshView' nor 'RCTPullToRefreshView'` and similar wrong-native-name crashes. The script now detects platform-specific siblings and leaves those specifiers extensionless, matching react-native-builder-bob's own accepted approach for the same tension (Node ESM needs explicit extensions; Metro needs them omitted to layer `.ios`/`.android`/`.native`). Known tradeoff, same as bob: a plain headless Node/ESM import reaching one of these folders directly (bypassing Metro) will fail to resolve — nothing in this repo currently does that.

## 0.1.3

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.

## 0.1.2

### Patch Changes

- c66082c: Fix relative imports missing file extensions in the published `build/` output, which broke every published package for real Node ESM consumers (Vitest, plain `node`, non-Metro bundlers) — `import('@symbiote-native/vue')` failed outright with `ERR_MODULE_NOT_FOUND`. Metro's own resolver is lenient about missing extensions, which is why this went unnoticed until a published package's compiled output was consumed directly through Node's native ESM loader for the first time.

  The fix runs as a post-build step (`scripts/fix-esm-extensions.mjs`, wired into the root `build` script right after `typecheck`) that rewrites relative import specifiers in the already-compiled `build/**/*.js` files. It does not touch `src/*.ts` — Metro's resolver treats an explicit extension as literal (it only layers `.ios`/`.android`/`.native` suffixes on top, unlike `tsc`/Node's `.js`-maps-to-`.ts` resolution), so adding `.js` extensions directly in the TypeScript source breaks Metro's dev-mode resolution of the unbuilt source. Confirmed by reverting an earlier source-level attempt after it broke the local Vue example apps' bundling.

## 0.1.1

### Patch Changes

- Update package descriptions to the SymbioteNative brand name.

## 0.1.0

### Minor Changes

- First public release under the @symbiote-native npm scope.
