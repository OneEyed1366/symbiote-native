# @symbiote-native/engine

## 1.7.0

### Minor Changes

- [#96](https://github.com/OneEyed1366/symbiote-native/pull/96) [`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `getShadowNodeWrapper(node)` returns the `ShadowNodeWrapper` that Fabric-level native libraries such
  as Reanimated take for a view. `getFamilyGeneration(node)` changes when a reparent re-creates the
  node's Fabric family, which stales every native registry keyed by family.

  Both read the new `shadowNodeWrapperOf` / `familyGeneration` members of the native pod and answer
  `undefined` against an older pod. The wrapper is a snapshot that pins the revision it was made from:
  hold it only while the node is bound.

  Three registries let a package that animates nodes take part in prop and style publication:
  `registerPropClaim` takes a prop out of the payload, `registerStyleClaim` takes style keys
  (`animation*`, `transition*`) out of the published style and hands them over, and
  `registerStyleHandleClaim` recognises an animated style handle in `style`, publishes its starting
  values with the node's first publish only and binds it to the node. `settleNodeStyle(node, values)`
  keeps the values an animation settled on over the node's style across later publishes.
  `bindToNode(node, attach)` runs `attach` once the node has committed and again after a commit that
  re-created its family, and lets go of what it set up when the node leaves the tree. None of them
  costs an app that registers nothing more than a length read.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` (`create*` on Solid, `inject*` on Angular), and `AnimatedValueXY` / `AnimatedColor` now take RN's `config` with `useNativeDriver`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `aria-label`, `aria-labelledby`, `aria-live`, `aria-hidden` and `role` now win over their explicit `accessibility*` twins, as in RN's `View`. `Text` resolves a negative `numberOfLines` to 0, maps style `userSelect` to `selectable` and `verticalAlign` to `textAlignVertical`, and folds `disabled` into `accessibilityState`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every adapter exports RN's `NativeModules`, `Networking`, `LogBox`, `DevMenu`, `Touchable`, `PushNotificationIOS`, `NativeComponentRegistry`, `requireNativeComponent`, `codegenNativeComponent`, `codegenNativeCommands` and `registerCallableModule`, forwarded to RN's own module by `bootstrapHost`. A new `<layout-conformance>` tag carries `experimental_LayoutConformance`. React adds `unstable_batchedUpdates`, `usePressability`, `unstable_NativeText` and `unstable_NativeView`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - RN's `DeviceEventEmitter`, `NativeAppEventEmitter`, `NativeEventEmitter`, `Easing`, `Systrace`, `DevSettings`, `ReactNativeVersion`, `UTFSequence`, `TurboModuleRegistry` and `UIManager` are exported from every adapter, and React adds `RootTagContext`. `UIManager` forwards to RN's own module, handed over by `bootstrapHost`. `getEnforcingNativeModule` raises RN's `getEnforcing` text.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `StatusBar` keeps RN's props stack: nested bars compose, unmounting restores the bar below, native is updated once per frame with only what changed, and Android re-sends style and color like RN. Adds `showHideTransition`, `pushStackEntry` / `popStackEntry` / `replaceStackEntry`, and the cross-platform setter warnings. `applyStatusBarProps` is replaced by `createStatusBarEntry` in `@symbiote-native/engine`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A string child of `<text-input>` is its content, as in React Native (`<TextInput>hello</TextInput>`), instead of throwing "must be rendered inside a <text>". A host behavior opts in with `acceptsTextChildren`.

### Patch Changes

- [#96](https://github.com/OneEyed1366/symbiote-native/pull/96) [`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A child list that only changes order now dirties the parent's layout, so the new order reaches the screen. A style handle that a framework flattens into one record with the plain keys is now bound as well.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ActionSheetIOS` is React Native's own module forwarded through the host.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Alert`, `Share` and `ActionSheetIOS` are React Native's own modules forwarded through the host.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `AppState` is React Native's own module forwarded through the host.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Appearance` and `AppState` are React Native's own modules, `useColorScheme` of React is RN's hook and `colorScheme` can be `undefined` as in RN.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Dimensions`, `PixelRatio` and `I18nManager` are React Native's own modules forwarded through the host, `Dimensions.get` throws for an unknown key as in RN.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The engine barrel exports `Alert`, `Share`, `Dimensions`, `Appearance` and the other device modules from the react-native host. `NativeEventEmitter` builds RN's own class and `DeviceEventEmitter` is RN's bus, so `setDeviceEventSource`, `installDeviceEventHub` and the `deviceEventSource` bootstrap option are gone.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The engine files that stay ported carry a `TODO(rn-port)` that says why, and the colour keys of the style table are pinned against RN's.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The react-native host exposes `DeviceEventEmitter`, `NativeEventEmitter` and the other RN modules the engine forwards to, and `invariant` is the `invariant` package.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `InteractionManager`, `DevSettings` and `Systrace` are React Native's own modules forwarded through the host.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `LayoutAnimation` is React Native's own module forwarded through the host, a config without `duration` is accepted as in RN.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `android_ripple` and `TouchableNativeFeedback.Ripple` accept any colour value, a `PlatformColor` among them, and `android_ripple` takes `alpha`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `AccessibilityInfo` rejects with the module names RN 0.86 uses (`NativeAccessibilityManagerIOS is not available` for `isGrayscaleEnabled` and `isInvertColorsEnabled` on iOS, `NativeAccessibilityInfoAndroid is not available` for `isReduceMotionEnabled` on Android).

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every view accepts `onKeyDown`, `onKeyUp` and their `Capture` twins, the key events RN added to the Android base view config in 0.84. They bubble like `onKeyPress` and carry `key`, `code` and the four modifier flags. Native sends them only when the app enables key events, so on iOS they stay silent. Before, the props were not registered as events and landed in the view's props unread.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `accessibilityRole="tabbar"` no longer crashes an Android mount. The role is in RN's public union but Android's role enum has no entry for it, so stock 0.86.0 throws `Invalid accessibility role value: tabbar`. The engine drops it on Android and leaves it on iOS.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `RefreshControl` `titleColor`, `progressBackgroundColor` and `colors` now reach native as colours. Before, a string stayed a string and native painted nothing. The colour props RN types as `ColorValue` accept a `PlatformColor` here too: `RefreshControl` (`tintColor`, `titleColor`, `colors`, `progressBackgroundColor`), `TouchableHighlight` `underlayColor`, `Switch` `thumbColor` and `ios_backgroundColor`, `Button` `color`, `ActivityIndicator` `color`, `Modal` `backdropColor` (Vue dropped it before), `ScrollView` `endFillColor`, `InputAccessoryView` `backgroundColor`, `Image` `tintColor` (Angular dropped it before). `isProcessableColor` is exported from the engine.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - An `Image` whose `source` carries a `width` and `height` takes them as its default size, ahead of the `width` and `height` props, as `source.width ?? props.width` does in RN. Before, `source={{ uri, width: 64, height: 64 }}` without a style committed no size and laid out as 0 by 0.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Image` takes `resizeMode="none"` and `resizeMultiplier` as RN does, and an image `source` types `headers`, `method`, `body`, `cache` and `bundle`. Angular's `Animated.Image` dropped `resizeMode="none"` and `resizeMultiplier` before; `image-shared.ts` is split into the input list, the prop fold and the component base, and the fold is table-driven.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A drag on the selection handles of an iOS `TextInput` keeps the gesture. The engine now negotiates `onSelectionChangeShouldSetResponder` (and its capture twin) on a selection change while a touch is down, as RN's responder plugin does, and the iOS `TextInput` claims it. Android never did.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Linking` is React Native's own module forwarded through the host.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `AccessibilityInfo` on iOS rejects like RN when the native module or getter is missing, with RN's message for each query, instead of resolving `false`. `isAccessibilityServiceEnabled` rejects on iOS, and Android `isReduceMotionEnabled` rejects with RN's text.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `AccessibilityInfo.addEventListener` listens on the device event bus without pinging the native module's observe counters, as React Native does; on Android that module has none, so the subscription drew two console warnings.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Animated` interpolation sends RN's native config: `deg` and `rad` output values become radians, colors become processed numbers with `outputType: 'color'`, and a `PlatformColor` range is marked `platform_color`. A `PlatformColor` output range now interpolates to the closest color and warns, as in RN. Output strings with different non-numeric parts (`20deg` and `30rad`) throw when the interpolation is created. `new Animated.Value(0, { useNativeDriver: true })` makes the value native, `stopAnimation(cb)` on a native value hands `cb` the value native holds, and detaching a native value saves it first. Animated values nested in plain objects and arrays inside any prop (not only `style`) are tracked and rasterized. `Animated.event` maps any argument and any shape of the event (`event([null, { state: { foo: value } }])`, `AnimatedValueXY`), not just `nativeEvent` of the first argument; the native driver still takes `nativeEvent` of the first argument only. `Animated.timing`, `spring` and `decay` accept `AnimatedValueXY` and `AnimatedColor` and animate each channel, so a vector can track another vector. Starting any animation stops tracking. `AnimatedColor` takes and sets a `PlatformColor`, has `resetAnimation`, and a color change flushes bound props once. `AnimatedProps` takes an update callback. An animation without `useNativeDriver` warns, a JS-driven animation over a value already moved to native throws at `start()`, `JSON.stringify` of an animated node gives its value, and `translate: [x, y]` inside a transform tracks animated values in the array. `IAnimation.start` takes one object instead of five positional arguments. `Animated.event` checks the event against its mapping once in a dev build (`Event has less arguments than mapping`, `Bad mapping of event key ...`), warns without options or without `useNativeDriver`, and a native event outside `nativeEvent` throws on attach. A native `Animated.loop` over `decay` runs the iterations in native. Dev builds log a native style, transform or interpolation property the native animated module does not support. Every adapter's `Animated` now comes from one shared driver set and gains `Animated.Interpolation`, `Animated.Node`, `Animated.Event` and `Animated.attachNativeEvent`; the reduced-motion mock accepts `AnimatedValueXY` and `AnimatedColor`. `StyleSheet.flatten` returns `undefined` for a non-object and the same object for a single style, and overwriting a style preprocessor warns.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Native `Animated` calls are queued and flushed from one `setImmediate` between `startOperationBatch` and `finishOperationBatch` when RN's `cxxNativeAnimatedEnabled` flag is on, as RN's `NativeAnimatedHelper` does, so the C++ animated module runs them. With `useSharedAnimatedBackend` on, a native-driven view is also connected to its shadow node family, which the shared backend needs to find it. The end callback of a native animation now receives the whole native result, `{ finished, value, offset }`, not just `{ finished }`. An `Animated` component is never flattened (`collapsable: false`), so a view animated only by layout props keeps a native view to bind to.

  A re-render that leaves the animated nodes of a component's props unchanged keeps its `AnimatedProps` leaf bound to the native view instead of rebuilding it, as RN's `createAnimatedPropsMemoHook` does, and the leaf takes the new static props. The React `Animated` wrapper keeps one ref callback across renders.

  `PanResponder` grant no longer advances the accounted-for move time or the active-touch count when the event carries a touch history, as RN's `onResponderGrant`: an idle second finger now joins the first moved frame, and the first frame's velocity counts from zero.

  A `Text` with `onPress`, `onLongPress` or `onStartShouldSetResponder` now runs the press machine as RN's `usePressability` does: the press rect and `pressRetentionOffset`, the responder claim, and the iOS highlight (`isHighlighted`, off with `suppressHighlighting`). The behavior attaches when the first such listener is written, so plain text pays nothing.

  `Image` warns about an empty `source.uri`, and on Android throws RN's error when `defaultSource` and `loadingIndicatorSource` are both set.

  A nested pressable answers a press alone, as RN's single responder does: the outer one no longer gets `onPress`, `onPressIn` or `onPressOut` for a touch on the inner one, and it still presses when the inner one is disabled. The prop types of `TextInput`, `Text`, `ScrollView` and styles gained the RN props that were missing (logical `margin` / `padding` / `inset`, `outline*`, `boxSizing`, and the native-only props of the three components); Svelte's prop-name list follows.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `AppRegistry` accepts `setRootViewStyleProvider` and `setComponentProviderInstrumentationHook`, and `runApplication` / `setSurfaceProps` take RN's `displayMode`. There is no `AppContainer` here, so they are logged and not applied, but a library written against RN's typings no longer meets a `TypeError`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `AppRegistry` follows RN: `runApplication` throws RN's invariant for an unknown key, `setSurfaceProps` and `registerConfig` exist, a headless task warns on a repeated key, and only a `HeadlessJsTaskError` asks native for a retry.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `BackHandler` no longer pings the `DeviceEventManager` observe counters on subscribe and unsubscribe. RN listens for `hardwareBackPress` on the device bus directly.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A click now reaches a view and a pressable. `onClick` works on any view, and a click event (the accessibility activation) presses a `Pressable`, `Touchable*` and `Button` like RN's Pressability: ignored while disabled, ignored when it carries a `pointerType`, and left to the nested pressable it was aimed at.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `DeviceEventEmitter.addListener` and `NativeEventEmitter.addListener` throw RN's `TypeError` for a listener that is not a function, instead of failing later on the first emit.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every adapter exports `EventEmitter`, the class `react-native` exposes, as the engine's re-export of React Native's own.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Image` carries RN's defaults: `resizeMode` is `cover` unless the prop, the style or `objectFit` says otherwise (`objectFit` wins, then the prop, then the style) and the base style is `overflow: hidden`. Before, an image with no `resizeMode` fell back to the native `stretch`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Image` reads a `srcSet` entry the way RN does: entries are cut on a single space, the second token is the scale and any further tokens are ignored. A double space gives an empty scale and skips the entry, and an empty `srcSet` is one source with an empty uri at 1x.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Image.prefetchWithMetadata(url, queryRootName, rootTag?, callback?)` is added to the Image statics, as in RN. On iOS it passes the query root and a root tag (0 when absent) to native and falls back to `prefetch` when the host lacks the call, on Android it is `prefetch` and reports the request id.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - An `Image` with no source commits one empty source, as React Native does, and an unsupported or empty `srcSet` warns.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `InteractionManager.runAfterInteractions` reports a task that throws a non-`Error` value as `new Error(String(value))`, as React Native does, instead of a fixed message.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `LayoutAnimation.configureNext` times a config without `duration` as `0 + 17` ms, as React Native does, and `duration` is optional in the config type.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `LayoutConformance` replaces the app style with `display: contents`, as RN does, instead of merging the two. The rule now lives in the engine's C++ tag rules, so no adapter pays a JS fold for it.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Linking.addEventListener` on Android no longer logs two missing-counter warnings, and `Appearance.getColorScheme()` returns `'unspecified'` after a reset when native has no system scheme, as in React Native.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Dimensions.get` throws `No dimension set for key X` for an unknown key and `Dimensions.addEventListener` throws for any event but `change`, as in RN. `Alert` on iOS drops a trailing button with empty `text` like RN, and on Android reports a native dialog error through `console.warn`. `Vibration` on iOS ignores a number while a pattern runs, no longer calls the unimplemented native `cancel`, and throws for a pattern that is neither number nor array. `Linking` uses RN's URL validation messages. `ActionSheetIOS` runs its tint colors through `processColor`, validates arguments like RN and throws when `ActionSheetManager` is missing.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `NativeEventEmitter` calls a listener with every argument of an emit, as React Native does, not only the first.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `NativeEventEmitter` warns with RN's text when the module it is given has no `addListener` or `removeListeners`, exposes `listenerCount`, and calls a listener with the `context` it was added with.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A `<text>` nested in another `<text>` no longer gets `allowFontScaling`, `ellipsizeMode` and `accessible` defaults, as in React Native. The inner `allowFontScaling: true` used to override an outer `allowFontScaling={false}`. A pressable text now sends `isPressable` and `isHighlighted` up front.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `AppState` and `Keyboard` hand their native module to the event emitter on iOS only, and `Settings` listens on the device bus directly, as RN does. A JS listener on a native-driven `Animated.Value` now pings the iOS module's observe counters, without which iOS native never sent `onAnimatedValueUpdate`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A parent whose only change is its child list no longer reaches the platform as an `Update`. The commit handed Fabric an empty props object, which re-parsed the props and swapped the props pointer, so every insert or remove under a view also updated the view itself.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `role` reaches the native layer as it is, the way React Native 0.86 sends it, instead of being rewritten into `accessibilityRole`. A role outside the old 28-name table (`dialog`, `tooltip`) is no longer sent as an invalid `accessibilityRole`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `scrollTo` sends a `NaN` offset to native as 0, as React Native does, and `scrollToEnd` animates unless `animated` is exactly `false`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ScrollView` calls `onKeyboardWillShow`, `onKeyboardWillHide`, `onKeyboardDidShow` and `onKeyboardDidHide` with the keyboard event, as React Native does, on every adapter.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ScrollView` gains `experimental_endDraggingSensitivityMultiplier` on every adapter, treats a null `snapToInterval` / `snapToOffsets` as absent when resolving `pagingEnabled`, and lets the app's `contentContainerStyle` override the horizontal row direction, as RN's render does.

  `ScrollView` gains `stickyHeaderHiddenOnScroll`: a pinned header slides out by its own height on a downward scroll and comes back as far as the scroll returns, built from `Animated.diffClamp` over the scroll delta as in RN's `ScrollViewStickyHeader`. The pin now rebuilds when the flag flips, and `FlatList`, `SectionList` and `VirtualizedList` forward the prop to their scroll view.

  `onContentSizeChange` now fires on every layout of the content view, as in RN, instead of only when the size changed. The `didContentSizeChange` helper and the `IContentSize` type are gone from `@symbiote-native/components`.

  A `ScrollView` ref now carries the rest of RN's imperative surface: `getScrollResponder`, `getScrollableNode`, `getNativeScrollRef`, `getInnerViewRef`, `getInnerViewNode`, `scrollResponderZoomTo` and `scrollResponderScrollNativeHandleToKeyboard`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Settings.set` no longer fires `watchKeys` callbacks for the app's own write, as in RN (native ignores updates it caused, only an external `settingsUpdated` fires them), and `watchKeys` throws `keys should be a string or array of strings` for anything else. `InteractionManager` is RN 0.86's stub: tasks run on the next `setImmediate`, `createInteractionHandle` returns `-1` and blocks nothing, events never fire, a task error is thrown from a timer instead of rejecting the promise, and the `done` method is gone. `PanResponder.create` treats a `null` callback like a missing one instead of calling it. `LayoutAnimation.configureNext` races the native callback against a `duration + 17` ms timer, so `onAnimationDidEnd` fires even when native never answers, is a no-op when `Platform.isDisableAnimations` is set, and gains `setEnabled`; `checkConfig` logs through `console.error`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `StyleSheet.setStyleAttributePreprocessor` now rewrites the style a node publishes, as RN applies it to the native payload. Before, only `StyleSheet.flatten` ran it. With no preprocessor registered the publish path is unchanged.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `StyleSheet.create` freezes each style entry in a dev bundle, as React Native does, so a mutation of a created style fails where it is made.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A `Text` below a `View` below a `Text` is a paragraph again, as in RN, where `View` ends the text context. It used to commit as virtual text, which has no view of its own and never painted.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `TextInput` matches RN on three points. iOS sends `selectionColor` alone, without `cursorColor` and `selectionHandleColor`, while Android still coalesces the three. Under `Platform.isTesting` the caret is hidden whatever `caretHidden` the app wrote. On Android a `value` together with children throws RN's "Cannot specify both value and children." when the child is inserted.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `TextInput` follows RN where it differed. A numeric `fontWeight` on a `Text` or `TextInput` reaches native as a string, `verticalAlign` on a `TextInput` becomes `textAlignVertical`, and an iOS multiline input without its own vertical padding gets RN's 5pt top inset.

  The ref now behaves like RN's: `isFocused()` reads the app-wide focus tracker, so it is true right after `focus()` and false as soon as another input takes focus, `setSelection()` sends a null text instead of echoing the current one, and `clear()` no longer moves the mirror of the native text. It also answers `getNativeRef()`, the native node.

  `TextInputState` (RN's `TextInput.State`: `focusTextInput`, `blurTextInput`, `currentlyFocusedInput`) is exported from every adapter.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ITextStyle` types `userSelect` and `verticalAlign`, as RN's `TextStyle` does. The Text rule already mapped them onto `selectable` and `textAlignVertical`, but an app could not write either in a typed style.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A `<text>` inside `<touchable-without-feedback>` or `<touchable-native-feedback>` is pressable as in React Native: it sends `isPressable` and is announced as a link unless it is disabled or has a role.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The touchables stop mapping aria aliases RN's renders never read. `TouchableOpacity` and `TouchableHighlight` ignore `role` and `aria-labelledby`, and the highlight also ignores the aria state aliases. `TouchableWithoutFeedback` and `TouchableNativeFeedback` do not map `role` or `aria-labelledby` onto the child, and `TouchableWithoutFeedback` ignores `aria-label`.

  `Image` drops the aria aliases RN's render never reads and applies `aria-hidden` the way each platform does: iOS turns `accessible` off, Android sets `importantForAccessibility`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A lone `aria-busy`, `aria-checked`, `aria-selected`, `aria-expanded` or `aria-disabled` on a view now reaches Android: the fold used to write `null` for the other `accessibilityState` fields and Fabric dropped the whole state. `aria-value*` gets the same fix. A plain view maps `tabIndex` to `focusable` as `View.js` does.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `onTouchStart`, `onTouchMove`, `onTouchEnd`, `onTouchCancel` and the `Capture` twin of every bubbling event (`onFocusCapture`, `onBlurCapture`, `onClickCapture`, `onPressCapture`, `onChangeCapture`...) now reach an ancestor, as in React Native; they were never delivered.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `PermissionsAndroid` is React Native's own module forwarded through the host.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Dimensions`, `PixelRatio`, `I18nManager`, `Appearance`, `AppState`, `Settings`, `BackHandler`, `Alert`, `Linking`, `Vibration`, `Share`, `ToastAndroid`, `ActionSheetIOS`, `PermissionsAndroid`, `InteractionManager` and `LayoutAnimation` are React Native's own modules, forwarded through the host `bootstrapHost` hands over, instead of hand-written ports. They now behave exactly as in RN: `Dimensions.get` throws for an unknown key, `Settings` warns and does nothing off iOS, `useColorScheme` can answer `undefined`, `ToastAndroid` throws without its native module and reports RN's gravity constants, `LayoutAnimation.setEnabled` does nothing as in RN. `bootstrapHost` loads RN's `BackHandler` so an Android app without a handler still exits on back, and the `react-native` module is handed to the engine when `@symbiote-native/*/bootstrap` is imported, so a `Dimensions.get('window')` at the top of an app file works. `DevSettings`, `Systrace`, `UTFSequence`, `ReactNativeVersion` and `SpringConfig` are RN's too, and `resolveAssetSource` is RN's function instead of a bootstrap copy. `processAspectRatio` and `processFontVariant` call RN's own functions. `@symbiote-native/components` now depends on `@react-native/virtualized-lists`: `CellRenderMask` and the list window math (`VirtualizeUtils`) are RN's own, and the window follows RN's `fixVirtualizeListCollapseWindowSize` flag. `DeviceEventEmitter` is RN's `RCTDeviceEventEmitter` and `NativeEventEmitter` builds RN's own class when it gets a module, so observe counters and listener errors follow RN. The React `useColorScheme` is RN's own hook. Breaking: `setDeviceEventSource`, `installDeviceEventHub` and the `deviceEventSource` bootstrap option are gone, and `invariant` comes from the `invariant` package.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Settings` and `BackHandler` are React Native's own modules forwarded through the host, `Settings` warns and does nothing off iOS.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Share` are React Native's own modules forwarded through the host.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ReactNativeVersion`, `UTFSequence`, `SpringConfig` and the `StyleSheet` helpers are React Native's own, `processAspectRatio` and `processFontVariant` call RN's functions.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Vibration` and `ToastAndroid` are React Native's own modules forwarded through the host, `ToastAndroid` throws without its native module.

- [#96](https://github.com/OneEyed1366/symbiote-native/pull/96) [`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The engine exports `IStyleClaims`, an open slot a package merges its own style object into, so `style` on every tag can take it.

## 1.6.0

### Minor Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Export the hook factories the Expo wrapper packages are built on: `createPermissionHook`, `createResourceHook` and `createEventValueHook` on React, Vue, Svelte and Solid, and `createResourceHook`, `createEventValueHook`, `PermissionsServiceBase` and `connectWatchedSignal` on Angular. The shared logic lives once in `@symbiote-native/engine` (`createPermissionApi`, `createResourceController` and friends). Angular also exports `AccessibilityInputsBase`, `NativeViewBase` and `anchorStyleProp`, which the slider now builds on, and splits its list components into smaller files without changing their API.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add the `checkbox` primitive, a port of `expo-checkbox` on every adapter: a pressable box with a checkmark image, `value`, `color`, `disabled` and `onValueChange`, styled by a tag rule in the engine so all adapters commit the same payload.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/live-photo`: `LivePhotoView` with `startPlayback` and `stopPlayback` on React, Vue, Svelte, Solid and Angular, and a `--live-photo` layer in the CLI. The engine gains `defineExpoViewMethods` for calling the functions of an Expo native view, and Angular's `DescriptorOutlet` exposes the host node it painted as `rootNode`.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `useEvent` and `useEventListener` (the `expo` package's hooks) to every adapter, for any emitter such as a native module or a shared object: React, Vue and Solid export them, Svelte has `@symbiote-native/svelte/runes/use-event`, Angular has `injectEvent` and `injectEventListener`. The engine gains `bindEventListener`, which they share.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/video`: the player (`useVideoPlayer` / `injectVideoPlayer`, `createVideoPlayer`), `VideoView` with fullscreen and Picture in Picture functions, `VideoAirPlayButton`, thumbnails and the video cache functions on React, Vue, Svelte, Solid and Angular, and a `--video` layer in the CLI. The engine gains `createJsonKeyedResourceController` (audio now takes it from there), and React, Vue, Solid and Svelte gain a helper that builds a component over a package's native view controller (`useNativeViewController` and `defineNativeViewComponent`).

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `getBoundingClientRect(node, includeTransform)`: a synchronous layout read from the committed Fabric tree, `undefined` for an uncommitted node.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `styleOfProps` to the engine: the class and the inline style of a props bag in one list. `LinearGradient` on Android now rounds its native layer by a radius from a CSS class, and `Image` reads `resizeMode`, the Android background and the SF Symbol keys from a class, as it already did from `style`. `ImageBackground` gives `className` to its wrapping view, and `Image` takes a `VideoThumbnail` as a source. `VideoView`, `VideoAirPlayButton` and `AppleAuthenticationButton` accept `className` in React.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A host behavior answers its events through one shared dispatch instead of installing a closure per
  name, and TouchableOpacity builds its fade runtime on the first press rather than at attach. Per
  thousand items: pressable 2 559 -> 1 263 KB, touchable-opacity 6 992 -> 3 584, button 7 259 ->
  4 068, text-input 5 167 -> 3 824.

### Patch Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/blur`: `BlurView` and `BlurTargetView` on React, Vue, Svelte, Solid and Angular, and a `--blur` layer in the CLI. The adapters gain shared bridges for native wrappers that take children (`DescriptorHost` on Angular and Svelte, a children argument on the Solid and Vue bridges), `hostNodeOf` on Angular and `hostInstance` on the Svelte native-view bridge. The engine accepts a view name in `expoViewManagerName` and warns when a static template tag cannot match it.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/glass-effect`: `GlassView`, `GlassContainer`, `isLiquidGlassAvailable` and `isGlassEffectAPIAvailable` on React, Vue, Svelte, Solid and Angular, and a `--glass-effect` layer in the CLI. The engine gains `defineExpoNativeView` and `defineExpoNativeViews` for packages that register Expo native views, and the Solid adapter gains `defineDescriptorComponent`.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A node whose create op is still in the batch no longer forces a full drain to the host when a behavior marks its props dirty: the host has never heard of it, so the mark is a no-op. Per item, `touchable-without-feedback` 3 158 -> 1 386 B and `touchable-opacity` 3 271 -> 1 499 B; the other tags are unmoved.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `ClipboardPasteButton` (iOS) and `ContactAccessButton` on every adapter. The Expo view-manager name and lazy view registration move into `@symbiote-native/engine` (`expoViewManagerName`, `tryRegisterNativeView`), and Angular gets `NativeViewBase` for native-view components plus `connectWatchedSignal` for signal-backed services.

## 1.5.0

### Minor Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Export the hook factories the Expo wrapper packages are built on: `createPermissionHook`, `createResourceHook` and `createEventValueHook` on React, Vue, Svelte and Solid, and `createResourceHook`, `createEventValueHook`, `PermissionsServiceBase` and `connectWatchedSignal` on Angular. The shared logic lives once in `@symbiote-native/engine` (`createPermissionApi`, `createResourceController` and friends). Angular also exports `AccessibilityInputsBase`, `NativeViewBase` and `anchorStyleProp`, which the slider now builds on, and splits its list components into smaller files without changing their API.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `getBoundingClientRect(node, includeTransform)`: a synchronous layout read from the committed Fabric tree, `undefined` for an uncommitted node.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A host behavior answers its events through one shared dispatch instead of installing a closure per
  name, and TouchableOpacity builds its fade runtime on the first press rather than at attach. Per
  thousand items: pressable 2 559 -> 1 263 KB, touchable-opacity 6 992 -> 3 584, button 7 259 ->
  4 068, text-input 5 167 -> 3 824.

### Patch Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A node whose create op is still in the batch no longer forces a full drain to the host when a behavior marks its props dirty: the host has never heard of it, so the mark is a no-op. Per item, `touchable-without-feedback` 3 158 -> 1 386 B and `touchable-opacity` 3 271 -> 1 499 B; the other tags are unmoved.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `ClipboardPasteButton` (iOS) and `ContactAccessButton` on every adapter. The Expo view-manager name and lazy view registration move into `@symbiote-native/engine` (`expoViewManagerName`, `tryRegisterNativeView`), and Angular gets `NativeViewBase` for native-view components plus `connectWatchedSignal` for signal-backed services.

## 1.4.0

### Minor Changes

- [`bb26a15`](https://github.com/OneEyed1366/symbiote-native/commit/bb26a15d87bf55ac43895b6ab4acd53fcd7436da) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `getBoundingClientRect(node, includeTransform)`: a synchronous layout read from the committed Fabric tree, `undefined` for an uncommitted node.

- [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A host behavior answers its events through one shared dispatch instead of installing a closure per
  name, and TouchableOpacity builds its fade runtime on the first press rather than at attach. Per
  thousand items: pressable 2 559 -> 1 263 KB, touchable-opacity 6 992 -> 3 584, button 7 259 ->
  4 068, text-input 5 167 -> 3 824.

### Patch Changes

- [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A node whose create op is still in the batch no longer forces a full drain to the host when a behavior marks its props dirty: the host has never heard of it, so the mark is a no-op. Per item, `touchable-without-feedback` 3 158 -> 1 386 B and `touchable-opacity` 3 271 -> 1 499 B; the other tags are unmoved.

## 1.3.1

### Patch Changes

- [`e3530d5`](https://github.com/OneEyed1366/symbiote-native/commit/e3530d570f066c90d3bbfd62a95b2ccbae8431a8) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `c17d33f1` added `setAssetSourceResolver`/`resolveAssetSource` and wired them into
  `bootstrapHost` (`@symbiote-native/components`) with no changeset for `@symbiote-native/engine`
  itself. `@symbiote-native/components@3.1.1` published the next day already calling the new
  export, but `@symbiote-native/engine` stayed on the already-published `1.3.0` and never
  re-shipped - every consumer's `bootstrapHost()` crashes with `TypeError: undefined is not a
function` (`setAssetSourceResolver` resolves to `undefined`). This changeset bumps
  `@symbiote-native/engine` so the existing code actually gets published.

- [`99fdbbb`](https://github.com/OneEyed1366/symbiote-native/commit/99fdbbb54b72d5d06cfd95fbf0d82f2d9fe17a6a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Force a clean republish of every publishable package. `engine@1.3.0`/`components@3.1.1` proved a
  missing changeset on a producer package can leave its published tarball silently behind its own
  source (see the `symbiote-release-publishing` skill's changeset-skips-callee gap) with no CI
  signal. A blanket patch here is the cheap way to rule out the same gap sitting anywhere else:
  every package rebuilds and republishes from current HEAD, and `updateInternalDependencies: patch`
  bumps every internal `workspace:*`/`workspace:^` pin along with it.

## 1.3.0

### Minor Changes

- [`1e8cd62`](https://github.com/OneEyed1366/symbiote-native/commit/1e8cd62387caded852fbb8e14c04b3195fc2c516) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Ship the Android parity release. Engine 1.2.0 and adapters 3.0.1 were already taken on npm, so the previous release skipped these packages.

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
