# @symbiote-native/vue

## 3.0.1

### Patch Changes

- Updated dependencies [[`3de549b`](https://github.com/OneEyed1366/symbiote-native/commit/3de549b2ab9785c845a1f3acd5626d85d2b9b9e4)]:
  - @symbiote-native/components@3.0.1

## 3.0.0

### Minor Changes

- [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every item here is a place the press family answered differently from `react-native@0.86`, found by
  reading its source.

  Two controls fired backwards. `Switch` called `onValueChange` before `onChange` (`Switch.js:201-207`),
  `TextInput` called `onChangeText` before `onChange` (`TextInput.js:504-506`). Vendor fires the event
  handler first, so an app reading `event.nativeEvent` to accept or reject a value saw it after the
  value had been announced. `_onSelectionChange` had the same inversion (`:522-533`).

  `disabled` was only ever the raw prop. All three touchables resolve `disabled ?? aria-disabled ??
accessibilityState.disabled` before configuring Pressability (`TouchableOpacity.js:186` and siblings;
  Highlight has no `aria` leg, an upstream inconsistency matched rather than fixed). A control disabled
  through `accessibilityState` alone greyed out and kept firing `onPress`.

  The long-press timer is armed at `RESPONDER_GRANT`, so its threshold from touch-down is a flat 500 ms
  instead of 500 ms after press-in settles (`Pressability.js:471-478`). Movement is gated by a separate
  10 px jitter threshold, checked before the retention region (`:502-508`).

  `blockNativeResponder` is new across the family. `onResponderGrant` returns it (`Pressability.js:479`)
  to tell native to stand down, so a parent `ScrollView` cannot steal a claimed gesture mid-drag. We sent
  the default and yielded.

  `touchSoundDisabled` is new too, reaching Pressability as `android_disableSound`. It gates the Android
  release-time `SoundManager.playTouchSound()` (`:749-757`), a call that did not exist here - hence the
  new `SoundManager` engine module.

  `Pressable`'s bare tag commits `collapsable: false` unconditionally (`Pressable.js:340`). `Switch`
  claims the responder on both platforms (`:238-239,288-289`) and builds `accessibilityState` only once
  `disabled` resolves to something (`:235-238`). Both are tag rules in `SymbioteFabricProps.cpp`; the
  adapters gained prop declarations and nothing else.

- [#71](https://github.com/OneEyed1366/symbiote-native/pull/71) [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `@symbiote-native/vue/babel-jsx` now defaults `@vue/babel-plugin-jsx`'s `optimize: true`, generating
  PatchFlags/`dynamicProps` for TSX apps the same way `.vue` SFCs already get from
  `@vue/compiler-sfc`'s template compiler, unconditionally. A stateful list-row component's
  `hasPropsChanged` walk on every patch — measured costing roughly half a re-render's non-engine time
  on a 10%-of-1000 relabel — now skips straight to the flagged dynamic keys instead.

  Verified against the real renderer (`adapters/vue/optimize-flag-safety.test.ts`): a changed prop, a
  conditional branch, a keyed-list reorder, a spread-carried bag, and a stateful child component all
  still recommit correctly with the flag on.

  An app that hits an issue can opt back out: `symbioteVueJsx({ optimize: false })` in its own
  `babel.config.js`.

### Patch Changes

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - State explicitly in the Parity section that the adapter's surface is verified on-device, matching how the React and Svelte READMEs already documented it.

- [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `DEFAULT_END_REACHED_THRESHOLD`, `DEFAULT_START_REACHED_THRESHOLD` and `visiblePercent` are gone from
  `@symbiote-native/components`. The first two were one RN default standing in for another, replaced by
  `DEFAULT_EDGE_REACHED_THRESHOLD_PX`; the third split in two and neither half is the old function.

  `onEndReached` fired two screens early. RN has two defaults here and we conflated them:
  `onEndReachedThresholdOrDefault`'s `?? 2` is a multiple of the visible length, used for render-ahead
  windowing, while the unset-case fallback deciding whether to actually FIRE is a flat 2 pixels
  (`VirtualizedList.js:1567`). An app passing no threshold gets the pixel answer now.

  Viewability precedence was inverted. `itemVisiblePercentThreshold` is a fraction of the CELL,
  `viewAreaCoveragePercentThreshold` a fraction of the VIEWPORT, so a short cell fully on screen clears
  the first easily and can fail the second. Vendor checks the area config first (`ViewabilityHelper.js`);
  we checked the item config. Its `_isEntirelyVisible` shortcut comes along, and a callback shared across
  several `viewabilityConfigCallbackPairs` is now told which config fired.

  Both `keyExtractor` defaults were wrong: the flat one is `item.key ?? item.id ?? String(index)`
  (`VirtualizeUtils.js:248`), and a section's own extractor beats the list-level one
  (`VirtualizedSectionList.js:305`).

  `RefreshControl` sends `setNativeRefreshing` only when `refreshing` did not change under it
  (`:139-158`) - the case that exists to stop the spinner drifting out of sync with the app.

  `Animated.parallel` crashed on a falsy array entry, the shape `cond && timing(...)` produces; vendor
  treats it as already finished (`AnimatedImplementation.js`'s `parallelImpl`). An `AnimatedValueXY` used
  straight as an `event()` mapping target worked only because the generic object walk happened to reach
  `x` and `y` - deliberate now, with a test.

- [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The same vendor read, applied to the view primitives.

  `InputAccessoryView` renders `null` on Android. We committed a real, laid-out `RCTView` and its whole
  subtree there. `VOID_COMPONENT` is the engine primitive for it: where `ANCHOR_COMPONENT` hoists its
  children up in its place, a void node contributes neither itself nor them.

  `Image` gets three vendor rules back. `defaultSource` resolves through `resolveAssetSource` like every
  other source slot (`ImageViewNativeComponent.js:138`), `alt` sets `accessible` unconditionally
  (`Image.android.js:272-273`), and the four load events stay silent on Android until
  `shouldNotifyLoadEvents` is on - vendor raises it whenever any one of them is authored, which is what
  `IMAGE_LOAD_EVENT_NAMES` answers.

  `ImageBackground` carries `importantForAccessibility` down to both of its nodes; vendor destructures it
  out of the spread and reapplies it explicitly (`:67,76,82`).

  `Modal` pinned its container to the left edge always - vendor picks the edge off `I18nManager.isRTL`
  (`Modal.js:372`). `ActivityIndicator` never sent Android `styleAttr` and `indeterminate` (`:100-103`),
  so the spinner took whatever the ViewManager defaulted to. `KeyboardAvoidingView` uses vendor's own
  duration formula, floor included (`:169-179`).

  `TouchableWithoutFeedback` needs `nativeID` to beat `id`, the reverse of every other tag.
  `IHostBehavior.nativeIdWinsOverId` says so once at `createElement` instead of each writer guessing.

- Updated dependencies [[`72eab44`](https://github.com/OneEyed1366/symbiote-native/commit/72eab44031a0bb30cd90ac9d0fbc55de15606e26), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023)]:
  - @symbiote-native/engine@1.0.0
  - @symbiote-native/components@3.0.0

## 2.0.0

### Major Changes

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ActivityIndicator`, `Button`, `ImageBackground`, `TouchableWithoutFeedback`,
  `TouchableNativeFeedback`, `Switch`, `TextInput`, `Pressable`, `TouchableOpacity`,
  `TouchableHighlight` and `ScrollView` are no longer exported as components from
  `@symbiote-native/vue`.

  Vue's SFC and TSX transforms already lower each of these to its intrinsic tag at build time
  (`<view>`, `<pressable>`, `<scroll-view>`, …) whenever the primitive spec in
  `core/components/host-primitives.cjs` allows it — this removes the JS wrapper that only ever ran
  for the elements the compiler could not statically lower. `TouchableNativeFeedback` survives as RN's
  static namespace, re-exported from `@symbiote-native/components`. Every prop type stays exported for
  a component that forwards a bag onward.

  Migration: replace `import { Switch } from '@symbiote-native/vue'` + `<Switch .../>` with
  `<switch .../>` in a template, or the plain-`h()` call with the lowercase tag name — props are
  unchanged.

### Minor Changes

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `@symbiote-native/vue` gains its own `jsx-runtime` module (for `jsxImportSource:
'@symbiote-native/vue'` in Vue-TSX apps), built on the new `ICrossTypedIntrinsics` shape: every
  intrinsic tag types as a loose attribute bag except the ones with a real prop type
  (`IPressableProps`, `IRefreshControlProps`, …), which type-check for real instead of accepting
  anything. `intrinsic-elements.ts` and the `.vue` SFC `GlobalComponents`/Volar table move onto the
  same generic, so a template and a TSX file no longer disagree on what a tag accepts.

  `@symbiote-native/solid`'s existing `jsx-runtime.ts` (it reached this shape first) extends onto the
  same shared generic rather than its own hand-rolled version.

### Patch Changes

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A claimed child can now become the owner's PARENT, which is what an Android RefreshControl is.

  An Android ScrollView holds exactly one child, so a sibling refresh control is an `addViewAt`
  crash — RN inverts the tree there instead of beside-placing like it does on iOS. `claimedChildren`
  carries a mode per name, `beside` or `wrap`, and `ISymbioteNode.wrapper` records the inversion. The
  adapter goes on naming the scroll view for every insert, prop write and command; only the two
  structural entry points know a wrapper is what the tree holds.

  `IHostBehavior.onWrapChange` is where a behavior answers for it. The wrapper is the app's own node,
  so nothing could have given it a payload fold at creation — this is where the scroll view's layout
  style moves up to it and its visual style stays below.

  `splitScrollViewStyle` composes the axis base onto BOTH boxes, as RN does. All five adapters had
  dropped it from the wrapper, so an `AndroidSwipeRefreshLayout` with no explicit user layout style
  lost `flexGrow: 1` and collapsed to its content height inside a flex parent.

  `insertBefore`'s `beforeChild` is typed nullable, which is what its callers always passed.

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Three unrelated Vue fixes landing together:

  - A template ref (`useTemplateRef()`) to a host element came back deep-readonly — Vue's
    `readonly()` wraps any `.value` whose `Object.prototype.toString` reads `"[object Object]"`,
    which is true of a plain `SymbioteNode` class instance. Reads worked, so a commit mirror saw a
    "committed" node, but a write like `setNativeProps` silently no-opped with a dev-only readonly
    warning. The renderer now `markRaw`s the node before handing it back.
  - A listener wired through `onPress`/`onValueChange` runs from the engine's native event dispatch,
    entirely outside anything Vue wraps — a throw inside it skipped `onErrorCaptured` and
    `app.config.errorHandler` and reached Hermes's own top-level handler directly, an unframed
    redbox with no component stack. `patchProp` now wraps a native-event listener through
    `callWithErrorHandling` with the owning component instance, threaded down through `patch`
    exactly as Vue's own DOM renderer does for a native DOM event.
  - `<Teleport>` inside a compiled `.vue` SFC silently stopped re-rendering once mounted.
    `runtime-helpers` used to shadow `vue`'s own `Teleport` with the adapter's guarded
    `../create-portal` wrapper for every `from 'vue'` import — but `@vue/compiler-sfc` recognizes
    the literal tag name `Teleport` as one of Vue's own built-ins at compile time regardless of what
    value it resolves to, and compiles its children with a PROPS-only patch flag. A real
    `defineComponent` under that name then goes through Vue's ordinary `shouldUpdateComponent` check,
    which only re-renders on the props named in that flag and never on a children/slot change — a
    `<Teleport :to="...">` gated by `v-if` rendered once at mount and froze. The real, unwrapped
    `Teleport` now flows through unshadowed for the compiled-SFC path; the guarded wrapper stays
    exported from the adapter's main barrel for hand-built `h(Teleport, ...)` calls (TSX), where no
    such codegen special-case applies.

- Updated dependencies [[`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f)]:
  - @symbiote-native/engine@0.5.0
  - @symbiote-native/components@2.0.0

## 1.0.0

### Minor Changes

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

- [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A lowered element retargets Vue's own template sugar, and three of those retargets destroyed a
  prop before any adapter code ran.

  `v-bind="bag"`, `mergeProps` and a bare `:style="fn"` each reach `@vue/shared`'s `normalizeStyle`,
  which returns `undefined` for a function — so a functional `style` inside a spread was gone before
  the engine could specialise it. The three helpers call `normalizeStyle` by module-internal
  reference, so one override cannot cover the others; all three are now shimmed in
  `runtime-helpers`, scoped to `style` and preserving a top-level callback only. An array containing
  a callback stays out of contract, matching RN's own `Pressable` types.

  `v-model` on a lowered element compiles to the `vModelText` runtime directive whatever the
  primitive is, because Vue picks the directive by element and every lowered tag looks the same to
  it. On `Switch` that stringified the value and the behavior read `String(true)` as off forever;
  the write now branches on the primitive.

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

## 0.5.0

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

## 0.4.0

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

## 0.3.8

### Patch Changes

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

## 0.3.7

### Patch Changes

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

## 0.3.6

### Patch Changes

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

## 0.3.5

### Patch Changes

- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
  - @symbiote-native/engine@0.1.5
  - @symbiote-native/components@0.2.4

## 0.3.4

### Patch Changes

- 090c789: Fix the Metro SFC transformer crashing on a type-only `defineProps<X>()` where `X` is imported from another file (relative or bare-specifier) — `compileScript` had no `fs` access and no registered TypeScript resolver, so it threw "No fs option provided" / "TypeScript is required" instead of resolving the prop type.

## 0.3.3

### Patch Changes

- 706e52f: Fix `scripts/fix-esm-extensions.mjs` baking a literal `/index.js` extension folder-as-module directory imports (`component-names/`, `share/`, `alert/`, `platform/`, `status-bar/`, `accessibility-info/`, `linking/`, ...) that also carry `index.ios.js`/`index.android.js` siblings. Once the specifier is explicit, Metro's platform-extension layering never runs, so every platform silently resolved to the same (iOS-hardcoded, headless-fallback) file — on Android this surfaced as `Can't find ViewManager 'PullToRefreshView' nor 'RCTPullToRefreshView'` and similar wrong-native-name crashes. The script now detects platform-specific siblings and leaves those specifiers extensionless, matching react-native-builder-bob's own accepted approach for the same tension (Node ESM needs explicit extensions; Metro needs them omitted to layer `.ios`/`.android`/`.native`). Known tradeoff, same as bob: a plain headless Node/ESM import reaching one of these folders directly (bypassing Metro) will fail to resolve — nothing in this repo currently does that.
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

- c66082c: Fix relative imports missing file extensions in the published `build/` output, which broke every published package for real Node ESM consumers (Vitest, plain `node`, non-Metro bundlers) — `import('@symbiote-native/vue')` failed outright with `ERR_MODULE_NOT_FOUND`. Metro's own resolver is lenient about missing extensions, which is why this went unnoticed until a published package's compiled output was consumed directly through Node's native ESM loader for the first time.

  The fix runs as a post-build step (`scripts/fix-esm-extensions.mjs`, wired into the root `build` script right after `typecheck`) that rewrites relative import specifiers in the already-compiled `build/**/*.js` files. It does not touch `src/*.ts` — Metro's resolver treats an explicit extension as literal (it only layers `.ios`/`.android`/`.native` suffixes on top, unlike `tsc`/Node's `.js`-maps-to-`.ts` resolution), so adding `.js` extensions directly in the TypeScript source breaks Metro's dev-mode resolution of the unbuilt source. Confirmed by reverting an earlier source-level attempt after it broke the local Vue example apps' bundling.

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
