# @symbiote-native/angular

## 1.0.0

### Minor Changes

- [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `createPortal` now delivers content INSIDE the target host, matching React and Vue.

  A `ViewContainerRef` anchors at its host element and `createEmbeddedView` inserts after that
  anchor, so `<View portalOutlet>` made the ported content the host's SIBLING — an app's overlay
  could not lay it out, because the node was never in the overlay.

  The outlet marker therefore goes on an `<ng-container>` inside the target:

  ```html
  <View class="overlay-host">
    <ng-container portalOutlet #overlayHost="portalOutlet"></ng-container>
  </View>
  ```

  `PortalOutletDirective` throws when the marker sits on a real element instead, since the wrong
  placement otherwise commits a divergent tree with nothing to detect it.

- [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Angular gains the lowering pipeline, and three renderer fixes it uncovered.

  Lowering runs as a Metro source pre-pass, `@symbiote-native/angular/metro-transformer`, rather
  than as a Babel plugin. Angular's linker reads an inline template by slicing the file's source
  text at the AST node's byte range, so a `template` rewritten in the AST is invisible to it while
  the same plugin's `dependencies` edit lands — half-applied lowering, which leaves tags matching
  nothing. Point `metro.config.js` at the new transformer and drop the plugin from
  `babel.config.js`.

  Fixed alongside it, all three independent of lowering:

  - `id` never folded to `nativeID` on any Angular path, so `<View id="x">` reached Fabric with a
    key no ViewConfig declares and the native ID was silently lost. Both that fold and `Text`'s RN
    defaults now run in the renderer, which covers the wrapper, the lowered element and a host tag
    hand-written in adapter source alike.
  - An array-composed `[style]` crashed inside Angular's own styling engine
    (`prop.indexOf is not a function`) and the throw landed in a zoneless change-detection tick with
    nothing catching it, so the retry re-fired forever. Arrays are flattened before the binding.
  - `[(value)]` on `Switch` and `TextInput` lowers as written, instead of forcing an app to spell
    the two-way binding some other way.

  Accessibility events are no longer forwarded eagerly. `accessibilityTap`, `magicTap`,
  `accessibilityEscape` and `accessibilityAction` fire only when a boolean prop reaches the payload,
  so an unconditional template binding lit the gate on every instance whether or not anything
  subscribed. Components now answer their own gate, and a wrapper declares demand for its template
  through DI so the cascade `Button -> TouchableOpacity -> Pressable` still works.

  Renderer hot-path diagnostics are behind `isDebug()`. Nine sites built a template string on every
  `createElement`, `appendChild`, `insertBefore`, `removeChild` and `setValue` in a Release build
  that emits none of them, plus a closure per removed node: Create -5.5%, Append -10.7%,
  Clear -25.5%.

- [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Host primitives compile to intrinsic tags instead of framework components.

  `View`, `Text`, `Image`, `SafeAreaView`, `InputAccessoryView`, `Switch`, `TextInput` and
  `Pressable` are lowered at build time on Vue, Svelte, Solid and Angular, so a screen no longer
  allocates a component instance, a props proxy, an anchor node or an LView per primitive. The
  import and the call site are unchanged — which primitive is internally a tag is invisible to an
  app.

  What moved down with them:

  - The state each primitive needs is an engine host behavior keyed on its tag, not a framework
    lifecycle. Press, switch, text-input, image and input-accessory-view all register one.
  - The prop folds a wrapper used to perform run on the payload instead — `id` to `nativeID`,
    `Text`'s `ellipsizeMode`/`allowFontScaling` defaults, `TextInput`'s `inputMode`/`readOnly`/
    `enterKeyHint`, `Pressable`'s `disabled` accessibility state and its Android ripple. A lowered
    element commits the same payload as its wrapper; `core/test-utils`' equivalence oracle asserts
    it per primitive.
  - The `aria-*`/`role` fold resolves in the engine, so it reaches every path rather than the
    fourteen component bodies that used to carry it.
  - A functional `style={({pressed}) => …}` is specialised into a resting/active pair at build time,
    so the idiom the ecosystem writes lowers as authored. A CSS `:active` rule is not required.

  A transform refuses where lowering would change what an app can observe: a spread on a stateful
  primitive, a render-prop child, an instance-bound directive, a runtime value choosing the
  intrinsic. All five transforms answer one shared fixture table, so a divergence is a failing row
  rather than a device-only surprise.

  React keeps its wrappers — it has no build-time analysis, and host and composite are both fibers —
  and exports the same names.

  Measured on an iOS 26.5 simulator, Release, 1 000 rows of 10 native views, against stock React
  Native 0.86 on React's own Fabric renderer: Solid is under stock on all eight benchmark rows,
  Svelte and Vue on six of eight. Create is 0.76x/0.80x/0.89x and Append 0.49x/0.54x/0.55x for
  Solid/Svelte/Vue.

### Patch Changes

- [#59](https://github.com/OneEyed1366/symbiote-native/pull/59) [`2d34a11`](https://github.com/OneEyed1366/symbiote-native/commit/2d34a115848c1062f0ae7f67840f0e81df1f754c) Thanks [@mustafa0x](https://github.com/mustafa0x)! - Derive internal peer compatibility from the current workspace package versions so packed
  manifests reject older engine and adapter releases that do not provide the APIs they import.

- [#62](https://github.com/OneEyed1366/symbiote-native/pull/62) [`093144d`](https://github.com/OneEyed1366/symbiote-native/commit/093144d13bc3278353388e4b38ec904bf541f881) Thanks [@mustafa0x](https://github.com/mustafa0x)! - Match React Native Pressability's delayed activation, retention-region re-entry, 130 ms plain
  Pressable active-duration floor, Touchable zero-floor override, and timer cleanup on framework
  teardown across all five adapters.
- Updated dependencies [[`2d34a11`](https://github.com/OneEyed1366/symbiote-native/commit/2d34a115848c1062f0ae7f67840f0e81df1f754c), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`fd70625`](https://github.com/OneEyed1366/symbiote-native/commit/fd70625deff7d13c29a8606259a44f30249e040f), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`093144d`](https://github.com/OneEyed1366/symbiote-native/commit/093144d13bc3278353388e4b38ec904bf541f881), [`6e6df80`](https://github.com/OneEyed1366/symbiote-native/commit/6e6df80861f25d146c2b0d7c4837346dc0a86b16)]:
  - @symbiote-native/components@1.0.0
  - @symbiote-native/css-parser@0.5.0
  - @symbiote-native/engine@0.4.0

## 0.8.0

### Minor Changes

- 3acd869: Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
  component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
  companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
  census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
  landing alongside it) build on.

### Patch Changes

- Updated dependencies [3acd869]
  - @symbiote-native/components@0.5.0
  - @symbiote-native/css-parser@0.4.0

## 0.7.0

### Minor Changes

- 388c353: Close 22 gaps in the adapters' public barrels. About half of each adapter's surface is names
  re-exported verbatim from `@symbiote-native/engine` and `@symbiote-native/components`, and nothing
  enforced that the four lists agreed, so they drifted apart. A missing re-export is not a type
  error, so `tsc` never saw it — it only surfaced when an app tried to import a name and its
  framework's package turned out not to have it.

  Newly reachable per adapter: React gains `setColorProcessor`, `setDeviceEventSource`, `dlog`,
  `isDebug`, `ISymbioteNode`, `IRootTag`, `IKeyboardEvent`, `IKeyboardMetrics` and ten
  component-detail types; Vue gains `setDeviceEventSource` and five types; Angular gains eleven
  engine types and eleven component types. `ITextInputProps` stays deliberately per-adapter, since
  React and Vue declare their own over the shared agnostic base and Angular takes props as
  `@Input()`s.

  `tests/adapter-barrel-parity.test.ts` now enforces this and compares its known-gap list for
  equality, so adding a shared name to one barrel without the rest fails with the adapters named,
  and closing a gap without deleting its entry fails too — the list cannot rot into an allowlist.

  Also removes 31 passthrough stub files (`src/modules/x.ts` containing nothing but a re-export from
  the engine). They were internal, so no import path changes: a pure passthrough belongs in the
  barrel itself.

- 388c353: Correct `Modal`'s `onOrientationChange` signature, which promised a payload it never delivered. The
  engine registers every `onX` listener as `(event: ISymbioteEvent) => handler(event)`, so a handler
  always receives the full wrapper. `onShow` / `onRequestClose` / `onDismiss` never noticed because
  they declare no argument, but `onOrientationChange` was typed against the unwrapped payload - a
  caller following the type read `event.orientation` and got `undefined` forever, while the value sat
  at `event.nativeEvent.orientation`.

  The handler is now typed `(event: ISymbioteEvent) => void` on every adapter, matching every other
  payload-carrying event in the codebase (`onLayout`, `onAccessibilityAction`, the press and scroll
  handlers), each of which narrows at the read site. `IModalOrientationChangeEvent` stays exported and
  is now documented as what it truthfully describes: the `nativeEvent` payload shape, not the handler
  argument.

  Code reading `event.orientation` will now fail to compile rather than silently receive `undefined`.
  Read `event.nativeEvent.orientation` instead.

  Angular additionally stops normalizing the event into `{ orientation }` - a divergence from the
  other three adapters that also swallowed the event entirely when the payload was not one of the two
  values it recognized.

### Patch Changes

- 388c353: Fix Angular sticky headers that render in the right place and never move.

  `stickyHeaderIndices` is an ordinary `@Input`, so it can arrive AFTER the first change-detection
  pass - which is what any app deriving it from data rather than writing a literal in the template
  does. The native scroll-value attach ran only from `ngAfterViewInit`, which fires once, and returns
  early while the indices are still empty. It was never retried, so the scroll offset never reached
  the AnimatedValue and every header's interpolation sat at its resting value forever.

  What made this read as "the feature is on but broken" rather than "the feature is off": the
  projection half self-heals. The wrapper is still created, around the right child, with the right
  z-index - so the header appears exactly where it belongs and simply does not track scroll. Nothing
  logs, nothing throws.

  `attachSticky()` now also runs from `ngOnChanges`, and is idempotent: it records the
  `(sticky enabled, host node)` pair the current attach was made for and returns when neither
  changed, so driving it from every input change does not churn the native scroll event. The pair is
  recorded even when the node is not resolved yet, so the next call - which will see a real node -
  still reads as a change.

  React, Vue and Svelte never had this hole: all three re-run the same attach from a reactive effect
  keyed on the same condition, so a late `stickyHeaderIndices` self-heals there.

- 80ed828: Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
  `default` export condition resolves back into it, which also swept in every `*.test.ts` beside
  those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
  excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.
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

- 388c353: Keep sticky headers correct when a cell is force-rendered. `VirtualizedList` can render a cell
  outside the normal virtualization flow — to satisfy `initialScrollIndex`, or to keep a focused row
  mounted — and the sticky-header reducer treated those cells as if they had arrived through the
  usual windowing path. The tracked header index then disagreed with what was actually mounted, and
  the wrong section header stuck (or none did) until the next ordinary scroll correction.

  The reducer now distinguishes force-rendered cells from windowed ones, and each adapter's
  `VirtualizedList` reports them as such.

- Updated dependencies [388c353]
- Updated dependencies [388c353]
- Updated dependencies [388c353]
- Updated dependencies [388c353]
  - @symbiote-native/css-parser@0.3.0
  - @symbiote-native/components@0.4.0

## 0.6.2

### Patch Changes

- 80ed828: Stop publishing co-located test files. These packages ship `src/` because the Angular entry's
  `default` export condition resolves back into it, which also swept in every `*.test.ts` beside
  those sources — 24% of tracking-transparency's unpacked size, 11% of web-browser's. `files` now
  excludes the `.test.`/`.spec.`/`.detox.` suffixes, and an eslint rule keeps them out.

## 0.6.1

### Patch Changes

- 465c9e8: Clean the ngc output dir before every Angular build, and move the anchor-host registry into a leaf module.

  Composed Angular components (app screens mounted via `NgComponentOutlet`, and statically-tagged
  navigation components like `Stack`) rendered blank on iOS / redboxed on Android
  (`Can't find ViewManager '<selector>'`) under the `.examples/angular` workspace harness, while the
  freshly-built npm/canary `examples/angular` worked. Root cause: `ngc -p` never deletes orphaned outputs,
  so after the renderer moved `src/renderer.ts` → `src/renderer/index.ts` the stale `build/angular/renderer.js`
  lingered and — because a file shadows a folder in Node/Metro resolution — was loaded instead of
  `build/angular/renderer/index.js`. It carried its own inline `ANCHOR_HOST_COMPONENTS` Set, so the bundle had
  two registry modules: `registerComposedComponent` wrote one, `createElement` read the stale other, and every
  composed selector fell through to a raw native view name.

  Every Angular-shipping package (`@symbiote-native/angular`, `@symbiote-native/slider`,
  `@symbiote-native/navigation`, `@symbiote-native/splash-screen`) now runs `rm -rf build` before `ngc`, so a
  stale output can never shadow the current one again. The anchor-host registry
  (`ANCHOR_HOST_COMPONENTS` + `registerComposedComponent` + `isAnchorHostComponent`) also moved out of
  `renderer/index.ts` into a dependency-free leaf module `anchor-host-registry.ts`, reached by a single relative
  import route, as cheap cycle-safety hygiene. Public API unchanged.

- 465c9e8: Extract two triplicated component machines into shared, framework-agnostic logic in
  `@symbiote-native/components`, completing the enriched three-layer split for the last two
  components that still re-implemented decision logic per adapter.

  Touchable: the TouchableOpacity press-scheduling machine (delayPressIn defer, early-release
  flush, activatedAt tracking, min-press-duration hold) and the TouchableHighlight underlay
  gating were re-implemented line-for-line in React, Vue, and Angular. They now live once as
  `createTouchableFeedbackRuntime` + `createTouchableFeedbackHandlers` (clock and scheduler
  injected, so the machine is testable and timer globals stay out of core) and
  `highlightPressedStyle`. Each adapter keeps only the `Animated.timing` opacity call, injected
  via `activate`/`deactivate`.

  ScrollView sticky headers: the per-header effect state machine (zero-swallow gate,
  rebuild-interpolation-on-input-change, debounce pick, cross-talk feed-forward) was hand-written
  in every adapter, and twice in Angular (component plus projection wrapper). It is now one
  `reduceSticky(state, action, inputs)` enriched reducer plus a `resolveScrollForwarding` decision
  helper that absorbs the onScroll branch, throttle defaults, inverted-height capture, and the
  collapsableChildren predicate. Angular's projection wrapper collapses to a thin effect-runner
  over the same reducer. Adapters keep only effect execution: the debounce timer, the
  interpolate/listener wiring, and the re-render trigger.

  Adapter prop surfaces and runtime behavior are unchanged; the rewrite is structural.

- 465c9e8: Extract the VirtualizedList orchestration into a shared, framework-agnostic `reduceList` state
  machine in `@symbiote-native/components`. Every list adapter (React, Vue, Angular) previously
  re-implemented the same after-commit effect skeleton — window recompute, `onEndReached`/
  `onStartReached` gating, viewability, batch fill, `maintainVisibleContentPosition`, the imperative
  scrolls — in its own reactive dialect, so the decision predicates (`last === count - 1`,
  `first === 0`, the batch-fill catch-up test, the viewability guards) lived three times and could
  drift. That logic is now one pure `reduceList(state, action) -> { state, effects }`; each adapter
  only maps native events to actions, holds one state cell, and executes the returned effects. Adds
  `reduceList`, `createInitialListState`, and `listEffectSignature` (plus their types) to the public
  `@symbiote-native/components` surface. Adapter prop surfaces and runtime behavior are unchanged —
  the rewrite is structural.
- Updated dependencies [465c9e8]
- Updated dependencies [465c9e8]
  - @symbiote-native/components@0.3.0

## 0.6.0

### Minor Changes

- ad17e8f: Add `@symbiote-native/angular/babel-register-composed`, a Babel plugin (composes into Metro's `babel.config.js`, ahead of `babel-linker`) that reads `selector` off every compiled `ɵɵngDeclareComponent(...)` and auto-calls `registerComposedComponent` for every composed component in the bundle, skipping the closed set of real Fabric intrinsics. Makes manual `registerComposedComponent(...)` calls at each composed component's own definition unnecessary going forward — `ANCHOR_HOST_COMPONENTS` no longer needs a hand-maintained entry for every new composed component, adapter-owned, third-party, or app-authored.

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- a2cadf6: Extract `AnimatedImage`'s ~100 lines of duplicated leaf-lifecycle orchestration (`reconcile`/`bindNode`/`attachEvents`/`detachEvents`) — copy-pasted from `AnimatedComponentBase` because `AnimatedImage` must extend `ImageBase` instead — into a shared `AnimatedLeafBinder` (composition instead of inheritance). Both classes now hold one as a field and delegate to it; no behavior change.
- 09feeb9: Fix Angular's `AnimatedScrollView` never applying `ScrollView`'s base style (`overflow: 'scroll'` + per-axis `flexDirection`) - its bespoke template built props by hand instead of going through `selectScrollIntrinsics`, so on iOS Fabric never clipped the scroll view's content to its own frame (Android was unaffected since its native `ViewGroup` clips regardless of the style prop). The inner content view now also gets `contentStyle` from the same intrinsics selection, mirroring the real `ScrollView`'s `contentProps` getter.
- 6010442: Fix `symbiote-angular-dev.cjs` spawning `ngc --watch` against a tsconfig whose `angularCompilerOptions.basePath` chokidar recursively watches — previously the project root, a sibling of `ios`/`android`'s tens of thousands of generated files, crashing with `EMFILE: too many open files, watch`. The script now resolves the real tsconfig's `basePath` and, if it's relative, writes a throwaway absolute-basePath override config into the app's own `build/` directory before spawning watch mode — `@angular/compiler-cli`'s incremental-recompile path throws `TS500: ... path is not absolute` otherwise on the second file change onward, even though the cold compile tolerates a relative `basePath` fine.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- 56ef0d9: Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
  `LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
  into a package's tarball at pack/publish time when the package has none of its own — confirmed
  against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
  `package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
  own license check was missing on all eleven packages.
- Updated dependencies [39bcaaf]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [56ef0d9]
  - @symbiote-native/css-parser@0.2.3
  - @symbiote-native/engine@0.1.7
  - @symbiote-native/components@0.2.6

## 0.5.0

### Minor Changes

- ad17e8f: Add `@symbiote-native/angular/babel-register-composed`, a Babel plugin (composes into Metro's `babel.config.js`, ahead of `babel-linker`) that reads `selector` off every compiled `ɵɵngDeclareComponent(...)` and auto-calls `registerComposedComponent` for every composed component in the bundle, skipping the closed set of real Fabric intrinsics. Makes manual `registerComposedComponent(...)` calls at each composed component's own definition unnecessary going forward — `ANCHOR_HOST_COMPONENTS` no longer needs a hand-maintained entry for every new composed component, adapter-owned, third-party, or app-authored.

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- a2cadf6: Extract `AnimatedImage`'s ~100 lines of duplicated leaf-lifecycle orchestration (`reconcile`/`bindNode`/`attachEvents`/`detachEvents`) — copy-pasted from `AnimatedComponentBase` because `AnimatedImage` must extend `ImageBase` instead — into a shared `AnimatedLeafBinder` (composition instead of inheritance). Both classes now hold one as a field and delegate to it; no behavior change.
- 09feeb9: Fix Angular's `AnimatedScrollView` never applying `ScrollView`'s base style (`overflow: 'scroll'` + per-axis `flexDirection`) - its bespoke template built props by hand instead of going through `selectScrollIntrinsics`, so on iOS Fabric never clipped the scroll view's content to its own frame (Android was unaffected since its native `ViewGroup` clips regardless of the style prop). The inner content view now also gets `contentStyle` from the same intrinsics selection, mirroring the real `ScrollView`'s `contentProps` getter.
- 6010442: Fix `symbiote-angular-dev.cjs` spawning `ngc --watch` against a tsconfig whose `angularCompilerOptions.basePath` chokidar recursively watches — previously the project root, a sibling of `ios`/`android`'s tens of thousands of generated files, crashing with `EMFILE: too many open files, watch`. The script now resolves the real tsconfig's `basePath` and, if it's relative, writes a throwaway absolute-basePath override config into the app's own `build/` directory before spawning watch mode — `@angular/compiler-cli`'s incremental-recompile path throws `TS500: ... path is not absolute` otherwise on the second file change onward, even though the cold compile tolerates a relative `basePath` fine.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- Updated dependencies [39bcaaf]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
  - @symbiote-native/css-parser@0.2.2
  - @symbiote-native/engine@0.1.6
  - @symbiote-native/components@0.2.5

## 0.4.0

### Minor Changes

- ad17e8f: Add `@symbiote-native/angular/babel-register-composed`, a Babel plugin (composes into Metro's `babel.config.js`, ahead of `babel-linker`) that reads `selector` off every compiled `ɵɵngDeclareComponent(...)` and auto-calls `registerComposedComponent` for every composed component in the bundle, skipping the closed set of real Fabric intrinsics. Makes manual `registerComposedComponent(...)` calls at each composed component's own definition unnecessary going forward — `ANCHOR_HOST_COMPONENTS` no longer needs a hand-maintained entry for every new composed component, adapter-owned, third-party, or app-authored.

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- a2cadf6: Extract `AnimatedImage`'s ~100 lines of duplicated leaf-lifecycle orchestration (`reconcile`/`bindNode`/`attachEvents`/`detachEvents`) — copy-pasted from `AnimatedComponentBase` because `AnimatedImage` must extend `ImageBase` instead — into a shared `AnimatedLeafBinder` (composition instead of inheritance). Both classes now hold one as a field and delegate to it; no behavior change.
- 09feeb9: Fix Angular's `AnimatedScrollView` never applying `ScrollView`'s base style (`overflow: 'scroll'` + per-axis `flexDirection`) - its bespoke template built props by hand instead of going through `selectScrollIntrinsics`, so on iOS Fabric never clipped the scroll view's content to its own frame (Android was unaffected since its native `ViewGroup` clips regardless of the style prop). The inner content view now also gets `contentStyle` from the same intrinsics selection, mirroring the real `ScrollView`'s `contentProps` getter.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
  - @symbiote-native/engine@0.1.5
  - @symbiote-native/components@0.2.4

## 0.3.3

### Patch Changes

- Updated dependencies [706e52f]
  - @symbiote-native/components@0.2.3
  - @symbiote-native/engine@0.1.4

## 0.3.2

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.
- Updated dependencies [46a4f27]
  - @symbiote-native/components@0.2.2
  - @symbiote-native/css-parser@0.2.1
  - @symbiote-native/engine@0.1.3

## 0.3.1

### Patch Changes

- 204901b: Fix `tsconfig.angular.base.json` to extend `@react-native/typescript-config` (now a real dependency of this package), restoring RN-specific compiler settings that were dropped when this base config was first packaged. The AOT build itself already worked without them, but consumers extending this base config for their own tsconfig lost the RN TypeScript baseline every React Native + Angular app needs.
- Updated dependencies [c66082c]
  - @symbiote-native/engine@0.1.2
  - @symbiote-native/components@0.2.1

## 0.3.0

### Minor Changes

- b0f2568: Package Metro/Babel/tsconfig build tooling that previously only lived in the example apps, so a consuming app no longer copies files out of this repo to use these adapters.

  - `@symbiote-native/css-parser`'s `createCssMetroTransformer()` now resolves `@react-native/metro-babel-transformer` itself (a real dependency of this package) instead of requiring the caller to pass it in.
  - `@symbiote-native/vue` ships its `.vue` SFC Metro transformer as `./metro-vue-transformer` (previously only a copy-pasted file in `examples/vue-sfc`).
  - `@symbiote-native/angular` ships `./babel-linker` (wraps `@angular/compiler-cli/linker/babel`), `./tsconfig.angular.base.json` (a base config for a consumer's own `tsconfig.angular.json` to extend), `./metro-config`'s `withSymbioteAngularMetroConfig` (CSS sourceExts + the ngc-outDir style-import redirect), and a `symbiote-angular-dev` bin (a cross-platform replacement for the old per-app `dev-with-watch.sh`, running `ngc --watch` alongside `react-native start`).

### Patch Changes

- Updated dependencies [b0f2568]
  - @symbiote-native/css-parser@0.2.0

## 0.2.0

### Minor Changes

- ab42ee8: Add a zero-config host bootstrap (`bootstrapHost` in `@symbiote-native/components`, plus `registerApp` / `createApp` / `bootstrapApplication` per adapter) that wires the native-host seams and AppRegistry in one call, collapsing the manual per-app wiring every canary previously repeated.

### Patch Changes

- Updated dependencies [ab42ee8]
  - @symbiote-native/components@0.2.0

## 0.1.1

### Patch Changes

- Update package descriptions to the SymbioteNative brand name.
- Updated dependencies
  - @symbiote-native/engine@0.1.1
  - @symbiote-native/components@0.1.1
  - @symbiote-native/css-parser@0.1.1

## 0.1.0

### Minor Changes

- First public release under the @symbiote-native npm scope.

### Patch Changes

- Updated dependencies
  - @symbiote-native/engine@0.1.0
  - @symbiote-native/components@0.1.0
  - @symbiote-native/css-parser@0.1.0
