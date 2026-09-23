# @symbiote-native/engine

## 1.2.0

### Minor Changes

- [`b463e81`](https://github.com/OneEyed1366/symbiote-native/commit/b463e81665268cfdb0489b384559079bc0f51109) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Android now behaves as React Native 0.86 does.

  - TextInput's C++ rules run on Android (`AndroidTextInput` was never recognized). Web aliases win over native props; `rows`, `tabIndex`, `readOnly` and `autoComplete` map per platform.
  - ScrollView sends `sendMomentumEvents`, snap-edge defaults, `endFillColor`, and `nestedScrollEnabled` only under a refresh wrap. A press-bearing `<text>` gets Android `accessible` and the `link` role.
  - Colors are signed ints on Android. `DynamicColorIOS` branches are processed, so they paint on iOS. `PlatformColor` builds `{ resource_paths }` on Android.
  - Native modules follow RN: BackHandler is installed at bootstrap (`removeEventListener` is gone, as in RN), plus Alert, AccessibilityInfo, Linking, Share, Settings, ToastAndroid, PermissionsAndroid, Keyboard and Platform.
  - `Image.getSize` returns nothing when given a success callback. Single-object source headers are dropped on Android.
  - New `IHostBehavior.slotValueFor` hook.

- [#83](https://github.com/OneEyed1366/symbiote-native/pull/83) [`15ef569`](https://github.com/OneEyed1366/symbiote-native/commit/15ef5691fab269b55a8eb233a07025c6ef15b384) Thanks [@github-actions](https://github.com/apps/github-actions)! - Report `nodesCreated`, `applyCalls`, `applyMs` and `decodeMs` on `readCommitProfile()`. Creates are issued from C++ and never reach `global.nativeFabricUIManager`, so a JS wrapper over that binding counts zero; the census now comes from the engine's own walk, keyed to the last committed surface. `applyMs` is the whole crossing into C++ and `decodeMs` the part of it that reads the buffer out of JS - the pair that says whether one big crossing is cheaper than ten thousand small ones on a given engine. Reading the profile drains surface telemetry as a result.

- [#83](https://github.com/OneEyed1366/symbiote-native/pull/83) [`2168a5e`](https://github.com/OneEyed1366/symbiote-native/commit/2168a5ed82e161fad5627c678d4c527a7e328fcc) Thanks [@github-actions](https://github.com/apps/github-actions)! - Apply React Native's own `<Text>` and `<TextInput>` accessibility defaults. A text node now commits `accessible: true` and `overflow: 'hidden'`, and a text input commits `accessible: true`, matching `Text.js` and `TextInput.js` - each a fallback an authored value still beats. Text was previously announced differently by VoiceOver and did not clip.

### Patch Changes

- [#83](https://github.com/OneEyed1366/symbiote-native/pull/83) [`15ef569`](https://github.com/OneEyed1366/symbiote-native/commit/15ef5691fab269b55a8eb233a07025c6ef15b384) Thanks [@github-actions](https://github.com/apps/github-actions)! - Report `liveNodes` on `readSurfaceTelemetry()`: how many nodes the native tree holds right now. It is a level rather than a total, so it is not drained on read - which is what lets a test assert the tree gives its nodes back after a surface is cleared.

- [#83](https://github.com/OneEyed1366/symbiote-native/pull/83) [`1b5c9d1`](https://github.com/OneEyed1366/symbiote-native/commit/1b5c9d1cc1abcd90b4e7aed0c1c6c130aeac5d45) Thanks [@github-actions](https://github.com/apps/github-actions)! - Return early from `isSameShallowStyle` when both sides are the same object. Without it a re-pushed hoisted style constant allocates two key arrays and walks them to reach the answer identity already gives, and that is the commonest shape there is - Solid re-pushes on every signal change because it has no diff. Measured on `-O` Hermes: 1.12 us per deduped write down to 0.32, against a 0.84 us buffer write. Nothing observable changes; `pushClassStyle` already caught the republish downstream.

## 1.1.0

### Minor Changes

- [`35fb51c`](https://github.com/OneEyed1366/symbiote-native/commit/35fb51c97edaff5929838863df12d4201885fa2c) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Cut what a removal costs: a narrower teardown walk, a real `firstChildOf`, and a cheaper batch
  boundary.

  `ITreeHost` gains two required members. The type is an internal seam, exported to be read rather
  than implemented outside this repo, so a new required member lands in a minor; both hosts shipped
  here already have them.

  - `firstChildOf` answers with one handle instead of `childrenOf(handle)[0]`. The old spelling read a
    list of N, then N-1, then N-2, so emptying a parent the way `solid-js/universal` does crossed
    N(N+1)/2 handles. A 2 000-row Solid clear went from 435 ms to 35 ms.
  - `teardownSubtreesOf` returns only the nodes a teardown has work for: each root, each node carrying
    an intrinsic tag, and each node between the two. An animated binding is per node and carries no
    tag, so a tree holding one still gets the full walk.
  - `applyOps` reads its four tables with `getObject`/`getArray` rather than the checking pair. The
    batch has one producer and the assert build keeps the checks, so a malformed batch still aborts
    there. Entering the host fell from 5.5 us to 2.8 us, which is what a framework reading the tree
    between mutations pays per read.

  `isTornDown` and `hostBehavior` moved off a `WeakSet` and a `WeakMap` onto the node, so a node with
  no behavior leaves the detach path before two lookups that were never going to find anything.

## 1.0.0

### Major Changes

- [`72eab44`](https://github.com/OneEyed1366/symbiote-native/commit/72eab44031a0bb30cd90ac9d0fbc55de15606e26) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The retained tree is C++ now. JS holds no tree at all and emits a command buffer instead.

  `core/engine/cpp/SymbioteTree.cpp` owns the nodes, the clone-on-write commit and the tag-keyed
  platform rules; `mutation-buffer.ts` is the wire format, and its header is the spec both sides are
  held to.

  Three things went rather than moved. The commit walk over dirty subtrees is gone, because the
  framework names the nodes. Desired-vs-committed diffing is gone, because the framework names the
  operations. `IMirror` is gone - it re-implemented `ShadowNode` in JS, which already carries children
  and props, and existed only because reading it back costs a crossing. So the buffer carries the
  adapter's alphabet instead of Fabric's, and the derivation disappears rather than relocating.

  Reading a node is a function now, not a property: `parentOf`, `childrenOf`, `firstChildOf`,
  `nextSiblingOf`, `componentOf`, `textOf`, `propOf`, `propsOf`, `committedPayloadOf`.

  `ITreeHost` with `setTreeHost` / `treeHost` is how a host gets installed, and `readSurfaceTelemetry`,
  `takePropKeyTally` and `takeNativeDebugLog` are what a test reads back out of it.

### Minor Changes

- [#71](https://github.com/OneEyed1366/symbiote-native/pull/71) [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add the structure seam a COMPOSED host primitive needs: `IHostBehavior.buildStructure` and
  `ISymbioteNode.childHost`.

  `foldPayload` gives a tag its wrapper's prop mapping. Nothing gave it the wrapper's composition, so
  a primitive built from more than one node — ScrollView is a scroll view wrapping a content view —
  could not become a tag at all, whatever its props did.

  A behavior may now build its own internal subtree once at attach and return the node the app's
  children belong under. `appendChild` / `insertBefore` / `removeChild` redirect there, so an adapter
  keeps naming the owner and never learns a slot exists — the same relationship a browser's `<video>`
  has with its UA shadow tree.

  `IHostBehavior.slotProps` is the prop twin: owner prop name -> slot prop name, applied in
  `routeProp` and gated on the same field, so an app writes `contentContainerStyle` on the ScrollView
  and it lands as the content node's `style`. A pure rename — precedence belongs to a `payloadFold`,
  because the two orders are opposite (the scroll node's base style goes UNDER the app's, the
  content node's `flexDirection: 'row'` goes OVER it).

  Also lands `registerScrollViewBehavior()` in `@symbiote-native/components`, the first consumer: it
  builds the same two nodes and composes the same two style arrays every adapter's wrapper does. It
  is exported but called by nothing — `scroll-view` is the tag the wrappers already emit and they
  build their own content node, so a global registration would double-nest every existing ScrollView.
  Making the engine the single owner of the content node is the next step.

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

- [#71](https://github.com/OneEyed1366/symbiote-native/pull/71) [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `scrollTo`, `scrollToEnd` and `flashScrollIndicators` are now methods on `ISymbioteNode`, beside
  `focus` / `blur` / `measure`.

  A `<scroll-view>` hands the app its engine node, with no wrapper to build an imperative handle
  from — so anything the wrapper's handle offered has to be reachable from the node, or the public
  surface silently shrinks the day the primitive stops being a component.

  `buildScrollViewHandle` keeps its signature and now delegates to those methods instead of
  dispatching its own commands. The defaults (`x`/`y` 0, `animated` true) live in one place, so a ref
  and a tag cannot disagree about what `scrollTo()` with no argument means.

- [#71](https://github.com/OneEyed1366/symbiote-native/pull/71) [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Two engine seams a composed host primitive needs, and ScrollView's prop half wired onto them.

  `IHostBehavior.slotDerived` names owner props the internal slot's payload is computed from, so a
  write to one marks the slot dirty. `markPropsDirty` bubbles up, so without it a derived slot value
  is correct at mount and frozen forever after. Read past `setProp`'s identity guard, so a re-render
  writing an unchanged value still costs nothing.

  `IHostBehavior.onOwnedListenerChange` fires when the app wires or unwires an owned listener — never
  on the fresh closure a framework hands over each render. `afterCommit` cannot serve this: a listener
  change moves no Fabric prop, so the commit after it is a no-op and post-commit hooks are skipped.

  A `<scroll-view>` now resolves `decelerationRate` to the platform friction constant, turns off
  content-cell flattening for `maintainVisibleContentPosition` / `snapToAlignment`, and synthesizes
  `onContentSizeChange` from its content view's layout — installing that gated `onLayout` only when
  the app passed a handler, as RN and every wrapper do.

- [#71](https://github.com/OneEyed1366/symbiote-native/pull/71) [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A `<scroll-view>` can now pin a `<sticky-header>` child, the last piece a composed host primitive
  needed before its wrapper could be deleted.

  RN's sticky header is JS-built (`ScrollViewStickyHeader`), not a native concept — a plain view
  carrying `zIndex` and an animated `translateY` computed from scroll offset against the header's own
  measured layout. `registerScrollViewBehavior`'s owner now tracks sticky-header children through the
  new `sticky` claim mode, and `core/components/src/behaviors/scroll-view/sticky.ts` runs the
  offset/pin math that every wrapper used to duplicate. `<sticky-header>` and its Fabric name join the
  platform-invariant tables in `component-names/{index.ios,index.android,shared}.ts`.

  Angular's `babel-register-composed.cjs` picks up the new tag.

## 0.5.0

### Minor Changes

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

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `IHostBehavior.claimedChildren` keeps a named child on the owner instead of redirecting it into the
  internal slot, and places it before that slot.

  A ScrollView's RefreshControl is a sibling of the content view rather than one of its children, and
  RN renders `{refreshControl}{contentContainer}` in that order. Claims are keyed by the child's
  Fabric component name: a claim is only consulted for children of one owner, so the name is
  unambiguous there and no node has to carry its intrinsic tag.

  `insertBefore` and `removeChild` read the same rule, so an adapter that names the owner both places
  a claimed child correctly and can take it away again.

  Android is not this shape and is not covered: there the refresh control wraps the scroll view, which
  needs a node above the owner rather than beside its slot.

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add the structure seam a COMPOSED host primitive needs: `IHostBehavior.buildStructure` and
  `ISymbioteNode.childHost`.

  `foldPayload` gave a lowered primitive its wrapper's prop mapping. Nothing gave it the wrapper's
  composition, so a primitive built from more than one node — ScrollView is a scroll view wrapping a
  content view — could not be lowered at all, whatever its props did.

  A behavior may now build its own internal subtree once at attach and return the node the app's
  children belong under. `appendChild` / `insertBefore` / `removeChild` redirect there, so an adapter
  keeps naming the owner and never learns a slot exists — the same relationship a browser's `<video>`
  has with its UA shadow tree.

  `IHostBehavior.slotProps` is the prop twin: owner prop name -> slot prop name, applied in
  `routeProp` and gated on the same field, so an app writes `contentContainerStyle` on the ScrollView
  and it lands as the content node's `style`. A pure rename — precedence belongs to a `payloadFold`,
  because the two orders are opposite (the scroll node's base style goes UNDER the app's, the
  content node's `flexDirection: 'row'` goes OVER it).

  Also lands `registerScrollViewBehavior()` in `@symbiote-native/components`, the first consumer: it
  builds the same two nodes and composes the same two style arrays every adapter's wrapper does. It
  is exported but called by nothing — `symbiote-scroll-view` is the tag the wrappers already emit and
  they build their own content node, so a global registration would double-nest every existing
  ScrollView. Splitting the wrapper and lowered tags — the `symbiote-text-input` /
  `symbiote-text-input-managed` precedent — is the next step.

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `scrollTo`, `scrollToEnd` and `flashScrollIndicators` are now methods on `ISymbioteNode`, beside
  `focus` / `blur` / `measure`.

  A lowered ScrollView hands the app its engine node, with no wrapper to build an imperative handle
  from — so anything the wrapper's handle offered has to be reachable from the node, or the public
  surface silently shrinks the day the primitive stops being a component.

  `buildScrollViewHandle` keeps its signature and now delegates to those methods instead of
  dispatching its own commands. The defaults (`x`/`y` 0, `animated` true) live in one place, so a ref
  and a tag cannot disagree about what `scrollTo()` with no argument means.

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Two engine seams a composed host primitive needs, and ScrollView's prop half wired onto them.

  `IHostBehavior.slotDerived` names owner props the internal slot's payload is computed from, so a
  write to one marks the slot dirty. `markPropsDirty` bubbles up, so without it a derived slot value
  is correct at mount and frozen forever after. Read past `setProp`'s identity guard, so a re-render
  writing an unchanged value still costs nothing.

  `IHostBehavior.onOwnedListenerChange` fires when the app wires or unwires an owned listener — never
  on the fresh closure a framework hands over each render. `afterCommit` cannot serve this: a listener
  change moves no Fabric prop, so the commit after it is a no-op and post-commit hooks are skipped.

  A lowered ScrollView now resolves `decelerationRate` to the platform friction constant, turns off
  content-cell flattening for `maintainVisibleContentPosition` / `snapToAlignment`, and synthesizes
  `onContentSizeChange` from its content view's layout — installing that gated `onLayout` only when
  the app passed a handler, as RN and every wrapper do.

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A lowered ScrollView can now pin a `<sticky-header>` child, the last piece a composed host
  primitive needed before its wrapper could be deleted.

  RN's sticky header is JS-built (`ScrollViewStickyHeader`), not a native concept — a plain view
  carrying `zIndex` and an animated `translateY` computed from scroll offset against the header's own
  measured layout. `registerScrollViewBehavior`'s owner now tracks sticky-header children through the
  new `sticky` claim mode, and `core/components/src/behaviors/scroll-view/sticky.ts` runs the
  offset/pin math that every wrapper used to duplicate. `<sticky-header>` and its Fabric name join the
  platform-invariant tables in `component-names/{index.ios,index.android,shared}.ts`.

  Angular's `babel-register-composed.cjs` picks up the new tag for its host-primitive lowering pass.

### Patch Changes

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `afterCommit` now drains on every commit path, and host behaviors are swept when a surface goes
  away.

  The targeted commit path (a single node's props recomputed outside a full tree walk) skipped the
  `afterCommit` queue entirely, so a behavior relying on it to run post-commit work saw it fire only
  after a full commit. A no-op commit — nothing actually changed, `completeRoot` never called — left
  the same queue undrained rather than cleared, and a surface torn down mid-flight leaked whatever
  host behaviors it had attached instead of sweeping them. See
  `.claude/rules/unmount-does-not-sweep-host-behaviors.md` for the failure this closes.

## 0.4.0

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

### Patch Changes

- [#64](https://github.com/OneEyed1366/symbiote-native/pull/64) [`fd70625`](https://github.com/OneEyed1366/symbiote-native/commit/fd70625deff7d13c29a8606259a44f30249e040f) Thanks [@mustafa0x](https://github.com/mustafa0x)! - Bridge headless-task registrations into React Native's callable AppRegistry, including tasks
  registered before adapter bootstrap attaches the host.

- [#61](https://github.com/OneEyed1366/symbiote-native/pull/61) [`6e6df80`](https://github.com/OneEyed1366/symbiote-native/commit/6e6df80861f25d146c2b0d7c4837346dc0a86b16) Thanks [@mustafa0x](https://github.com/mustafa0x)! - Keep synthesized presses scoped to their owning target: additional fingers inside one owner
  share one lifecycle, while unrelated targets remain independently pressable until their own final lift.

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
