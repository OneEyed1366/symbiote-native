# @symbiote-native/solid

## 3.3.0

### Minor Changes

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` (`create*` on Solid, `inject*` on Angular), and `AnimatedValueXY` / `AnimatedColor` now take RN's `config` with `useNativeDriver`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList` and `VirtualizedList` take RN's `ListItemComponent` (`listItemComponent` on Vue, Svelte and Angular), a component that draws a cell from `item`, `index` and `separators`. It wins over the item renderer and warns when both are given, a cell with neither throws like RN. The list handle's `getNativeScrollRef()` is the scroll's host ref, so it has `measure`, `measureLayout` and `measureInWindow`. `Button` falls back to `accessibilityLabel` for an empty `aria-label`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every adapter exports RN's `NativeModules`, `Networking`, `LogBox`, `DevMenu`, `Touchable`, `PushNotificationIOS`, `NativeComponentRegistry`, `requireNativeComponent`, `codegenNativeComponent`, `codegenNativeCommands` and `registerCallableModule`, forwarded to RN's own module by `bootstrapHost`. A new `<layout-conformance>` tag carries `experimental_LayoutConformance`. React adds `unstable_batchedUpdates`, `usePressability`, `unstable_NativeText` and `unstable_NativeView`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - RN's `DeviceEventEmitter`, `NativeAppEventEmitter`, `NativeEventEmitter`, `Easing`, `Systrace`, `DevSettings`, `ReactNativeVersion`, `UTFSequence`, `TurboModuleRegistry` and `UIManager` are exported from every adapter, and React adds `RootTagContext`. `UIManager` forwards to RN's own module, handed over by `bootstrapHost`. `getEnforcingNativeModule` raises RN's `getEnforcing` text.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `StatusBar` keeps RN's props stack: nested bars compose, unmounting restores the bar below, native is updated once per frame with only what changed, and Android re-sends style and color like RN. Adds `showHideTransition`, `pushStackEntry` / `popStackEntry` / `replaceStackEntry`, and the cross-platform setter warnings. `applyStatusBarProps` is replaced by `createStatusBarEntry` in `@symbiote-native/engine`.

### Patch Changes

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `setDeviceEventSource` is no longer exported, the device bus is RN's own.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Appearance` and `AppState` are React Native's own modules, `useColorScheme` of React is RN's hook and `colorScheme` can be `undefined` as in RN.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `RefreshControl` `titleColor`, `progressBackgroundColor` and `colors` now reach native as colours. Before, a string stayed a string and native painted nothing. The colour props RN types as `ColorValue` accept a `PlatformColor` here too: `RefreshControl` (`tintColor`, `titleColor`, `colors`, `progressBackgroundColor`), `TouchableHighlight` `underlayColor`, `Switch` `thumbColor` and `ios_backgroundColor`, `Button` `color`, `ActivityIndicator` `color`, `Modal` `backdropColor` (Vue dropped it before), `ScrollView` `endFillColor`, `InputAccessoryView` `backgroundColor`, `Image` `tintColor` (Angular dropped it before). `isProcessableColor` is exported from the engine.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `AppRegistry` follows RN: `runApplication` throws RN's invariant for an unknown key, `setSurfaceProps` and `registerConfig` exist, a headless task warns on a repeated key, and only a `HeadlessJsTaskError` asks native for a retry.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList`, `SectionList` and `VirtualizedList` take RN's `CellRendererComponent` (React and Solid `CellRendererComponent`, Vue `cellRendererComponent`, Svelte `cellRenderer` snippet, Angular `<ng-template vListCell>`): it replaces the view around each cell and receives the cell key, index, item, style and the layout and focus handlers.

  The view around each cell of a horizontal list now lays out as a row, so the separator sits beside the item as in RN, and an inverted list's cell reverses its direction before flipping back.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList`, `SectionList` and `VirtualizedList` take `disableVirtualization`, as RN does: the window stays anchored at the first cell, grows by `maxToRenderPerBatch` once the end is within `onEndReachedThreshold`, and no spacer stands in for the cells not yet mounted.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every adapter exports `EventEmitter`, the class `react-native` exposes, as the engine's re-export of React Native's own.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList` takes `data` the way RN does: `null`, a number or an object with no length is an empty list, and any array-like object is read by index. React threw on `null` while rendering, and Vue turned an array-like into an empty list.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Image.prefetchWithMetadata(url, queryRootName, rootTag?, callback?)` is added to the Image statics, as in RN. On iOS it passes the query root and a root tag (0 when absent) to native and falls back to `prefetch` when the host lacks the call, on Android it is `prefetch` and reports the request id.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList`, `SectionList`, `VirtualizedList` and `VirtualizedSectionList` take `innerViewRef` and hand it to their `ScrollView`, as RN does through `...props`. The prop is typed on every adapter, and Svelte and Angular forward it by hand.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `maintainVisibleContentPosition` on the windowed lists follows RN. When items are added or removed above the anchor, the render window moves with the anchor key, so the rows native anchors on stay mounted and native does the scroll adjustment. The list no longer sends its own compensating `scrollTo` or autoscroll after a prepend.

  `computeMvcpAdjustment` and its types are no longer exported from `@symbiote-native/components`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A horizontal `VirtualizedList`, `FlatList`, `SectionList` and `VirtualizedSectionList` follow `I18nManager.isRTL` as RN does: offsets count from the right edge, so a scroll event at `x = 0` is the end of the data, a cell's position and an imperative scroll are converted at the native boundary, and `scrollToOffset` before the content is laid out warns and scrolls nowhere. The lists now take the scroll view's `onContentSizeChange` to learn the content length and still call the app's own handler, and `onEndReached` / `onStartReached` now measure against that real content length (a footer or padding counts), as RN does, instead of the sum of the cells.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `VirtualizedList`, `FlatList`, `SectionList` and `VirtualizedSectionList` handles gain `getScrollRef()`, RN's accessor for the node the list scrolls by. It answers the scroll view node, or the host view of a nested list that renders as a plain view, and null until the list commits.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList`, `SectionList`, `VirtualizedList` and `VirtualizedSectionList` handles get RN's `setNativeProps`, which writes the props onto the list's scroll view.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The header, footer and empty slots of `VirtualizedList`, `FlatList` and `SectionList` follow RN on an inverted list: each wrapper carries the counter-flip, so the slot reads upright instead of upside down.

  `ListHeaderComponentStyle` and `ListFooterComponentStyle` are new props on the three lists, applied to the header and footer wrapper (Vue, Svelte and Angular spell them `listHeaderComponentStyle` and `listFooterComponentStyle`).

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ScrollView` takes RN's `innerViewRef`: a callback that receives the content view after the first commit, `null` when the scroll view goes away, and `null` then the node again when the callback is swapped.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ScrollView` gains `experimental_endDraggingSensitivityMultiplier` on every adapter, treats a null `snapToInterval` / `snapToOffsets` as absent when resolving `pagingEnabled`, and lets the app's `contentContainerStyle` override the horizontal row direction, as RN's render does.

  `ScrollView` gains `stickyHeaderHiddenOnScroll`: a pinned header slides out by its own height on a downward scroll and comes back as far as the scroll returns, built from `Animated.diffClamp` over the scroll delta as in RN's `ScrollViewStickyHeader`. The pin now rebuilds when the flag flips, and `FlatList`, `SectionList` and `VirtualizedList` forward the prop to their scroll view.

  `onContentSizeChange` now fires on every layout of the content view, as in RN, instead of only when the size changed. The `didContentSizeChange` helper and the `IContentSize` type are gone from `@symbiote-native/components`.

  A `ScrollView` ref now carries the rest of RN's imperative surface: `getScrollResponder`, `getScrollableNode`, `getNativeScrollRef`, `getInnerViewRef`, `getInnerViewNode`, `scrollResponderZoomTo` and `scrollResponderScrollNativeHandleToKeyboard`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `SectionList` and `VirtualizedSectionList` take `horizontal` like RN's `VirtualizedListProps`. React, Vue and Solid already passed it through untyped, now it is typed there, and Svelte and Angular forward it to the inner list.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `SectionList` and `VirtualizedSectionList` paint separators the way RN does, inside the item cell. The section separator sits before a section's first item and after its last, the item separator only between two items of one section, and no separator is drawn next to a section header or footer. Separator components get `leadingItem`, `trailingItem`, `section`, `leadingSection` and `trailingSection`, and `highlight()` / `updateProps()` reach the neighbouring cell's separator.

  A section can bring its own item render and item separator, which beat the list's. With a section separator set, flat indices now match RN's, so `getItemLayout` needs no per-boundary correction.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `<text-input>` types `children` on React and Solid, and `ref` on React. A string child was already the input's text at runtime, but a typed app could not write `<text-input>hello</text-input>`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `TextInput` follows RN where it differed. A numeric `fontWeight` on a `Text` or `TextInput` reaches native as a string, `verticalAlign` on a `TextInput` becomes `textAlignVertical`, and an iOS multiline input without its own vertical padding gets RN's 5pt top inset.

  The ref now behaves like RN's: `isFocused()` reads the app-wide focus tracker, so it is true right after `focus()` and false as soon as another input takes focus, `setSelection()` sends a null text instead of echoing the current one, and `clear()` no longer moves the mirror of the native text. It also answers `getNativeRef()`, the native node.

  `TextInputState` (RN's `TextInput.State`: `focusTextInput`, `blurTextInput`, `currentlyFocusedInput`) is exported from every adapter.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Dimensions`, `PixelRatio`, `I18nManager`, `Appearance`, `AppState`, `Settings`, `BackHandler`, `Alert`, `Linking`, `Vibration`, `Share`, `ToastAndroid`, `ActionSheetIOS`, `PermissionsAndroid`, `InteractionManager` and `LayoutAnimation` are React Native's own modules, forwarded through the host `bootstrapHost` hands over, instead of hand-written ports. They now behave exactly as in RN: `Dimensions.get` throws for an unknown key, `Settings` warns and does nothing off iOS, `useColorScheme` can answer `undefined`, `ToastAndroid` throws without its native module and reports RN's gravity constants, `LayoutAnimation.setEnabled` does nothing as in RN. `bootstrapHost` loads RN's `BackHandler` so an Android app without a handler still exits on back, and the `react-native` module is handed to the engine when `@symbiote-native/*/bootstrap` is imported, so a `Dimensions.get('window')` at the top of an app file works. `DevSettings`, `Systrace`, `UTFSequence`, `ReactNativeVersion` and `SpringConfig` are RN's too, and `resolveAssetSource` is RN's function instead of a bootstrap copy. `processAspectRatio` and `processFontVariant` call RN's own functions. `@symbiote-native/components` now depends on `@react-native/virtualized-lists`: `CellRenderMask` and the list window math (`VirtualizeUtils`) are RN's own, and the window follows RN's `fixVirtualizeListCollapseWindowSize` flag. `DeviceEventEmitter` is RN's `RCTDeviceEventEmitter` and `NativeEventEmitter` builds RN's own class when it gets a module, so observe counters and listener errors follow RN. The React `useColorScheme` is RN's own hook. Breaking: `setDeviceEventSource`, `installDeviceEventHub` and the `deviceEventSource` bootstrap option are gone, and `invariant` comes from the `invariant` package.

- Updated dependencies [[`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e), [`8c2c5d6`](https://github.com/OneEyed1366/symbiote-native/commit/8c2c5d63dd9e980aae19b392c63d73f9929b103e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e), [`c23cef9`](https://github.com/OneEyed1366/symbiote-native/commit/c23cef9da297442d2faf32f96ccf2d651b3a8b1e)]:
  - @symbiote-native/css-parser@0.6.0
  - @symbiote-native/components@3.3.0

## 3.2.0

### Minor Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Export the hook factories the Expo wrapper packages are built on: `createPermissionHook`, `createResourceHook` and `createEventValueHook` on React, Vue, Svelte and Solid, and `createResourceHook`, `createEventValueHook`, `PermissionsServiceBase` and `connectWatchedSignal` on Angular. The shared logic lives once in `@symbiote-native/engine` (`createPermissionApi`, `createResourceController` and friends). Angular also exports `AccessibilityInputsBase`, `NativeViewBase` and `anchorStyleProp`, which the slider now builds on, and splits its list components into smaller files without changing their API.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add the `checkbox` primitive, a port of `expo-checkbox` on every adapter: a pressable box with a checkmark image, `value`, `color`, `disabled` and `onValueChange`, styled by a tag rule in the engine so all adapters commit the same payload.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `useEvent` and `useEventListener` (the `expo` package's hooks) to every adapter, for any emitter such as a native module or a shared object: React, Vue and Solid export them, Svelte has `@symbiote-native/svelte/runes/use-event`, Angular has `injectEvent` and `injectEventListener`. The engine gains `bindEventListener`, which they share.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/video`: the player (`useVideoPlayer` / `injectVideoPlayer`, `createVideoPlayer`), `VideoView` with fullscreen and Picture in Picture functions, `VideoAirPlayButton`, thumbnails and the video cache functions on React, Vue, Svelte, Solid and Angular, and a `--video` layer in the CLI. The engine gains `createJsonKeyedResourceController` (audio now takes it from there), and React, Vue, Solid and Svelte gain a helper that builds a component over a package's native view controller (`useNativeViewController` and `defineNativeViewComponent`).

### Patch Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/apple-authentication`: the Sign in with Apple flow (`signInAsync`, `refreshAsync`, `signOutAsync`, `getCredentialStateAsync`, `formatFullName`, `addRevokeListener`) and `AppleAuthenticationButton` on React, Vue, Svelte, Solid and Angular, and an `--apple-authentication` layer in the CLI. `expo-modules-link` learns two manifest keys, `ios.infoPlistBooleanKeys` and `ios.entitlements`, and the Solid adapter gains `defineOptionalDescriptorComponent`.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/blur`: `BlurView` and `BlurTargetView` on React, Vue, Svelte, Solid and Angular, and a `--blur` layer in the CLI. The adapters gain shared bridges for native wrappers that take children (`DescriptorHost` on Angular and Svelte, a children argument on the Solid and Vue bridges), `hostNodeOf` on Angular and `hostInstance` on the Svelte native-view bridge. The engine accepts a view name in `expoViewManagerName` and warns when a static template tag cannot match it.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/gl`: `GLView` with a WebGL2 context, headless contexts and snapshots on React, Vue, Svelte, Solid and Angular, and a `--gl` layer in the CLI. A native view controller can now define `dispose`, which every adapter runs when the view unmounts.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/glass-effect`: `GlassView`, `GlassContainer`, `isLiquidGlassAvailable` and `isGlassEffectAPIAvailable` on React, Vue, Svelte, Solid and Angular, and a `--glass-effect` layer in the CLI. The engine gains `defineExpoNativeView` and `defineExpoNativeViews` for packages that register Expo native views, and the Solid adapter gains `defineDescriptorComponent`.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: the zero-config entry example was missing `import '@symbiote-native/solid'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Fixes the exported-name count (eleven → twelve, missing `render`) and leads Install with `npx @symbiote-native/cli new`.

- Updated dependencies [[`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851)]:
  - @symbiote-native/components@3.2.0
  - @symbiote-native/css-parser@0.5.4

## 3.1.0

### Minor Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Export the hook factories the Expo wrapper packages are built on: `createPermissionHook`, `createResourceHook` and `createEventValueHook` on React, Vue, Svelte and Solid, and `createResourceHook`, `createEventValueHook`, `PermissionsServiceBase` and `connectWatchedSignal` on Angular. The shared logic lives once in `@symbiote-native/engine` (`createPermissionApi`, `createResourceController` and friends). Angular also exports `AccessibilityInputsBase`, `NativeViewBase` and `anchorStyleProp`, which the slider now builds on, and splits its list components into smaller files without changing their API.

### Patch Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: the zero-config entry example was missing `import '@symbiote-native/solid'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Fixes the exported-name count (eleven → twelve, missing `render`) and leads Install with `npx @symbiote-native/cli new`.

- Updated dependencies [[`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578)]:
  - @symbiote-native/components@3.1.4
  - @symbiote-native/css-parser@0.5.3

## 3.0.5

### Patch Changes

- Updated dependencies [[`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5), [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5), [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5), [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5), [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5)]:
  - @symbiote-native/components@3.1.3

## 3.0.4

### Patch Changes

- [`99fdbbb`](https://github.com/OneEyed1366/symbiote-native/commit/99fdbbb54b72d5d06cfd95fbf0d82f2d9fe17a6a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Force a clean republish of every publishable package. `engine@1.3.0`/`components@3.1.1` proved a
  missing changeset on a producer package can leave its published tarball silently behind its own
  source (see the `symbiote-release-publishing` skill's changeset-skips-callee gap) with no CI
  signal. A blanket patch here is the cheap way to rule out the same gap sitting anywhere else:
  every package rebuilds and republishes from current HEAD, and `updateInternalDependencies: patch`
  bumps every internal `workspace:*`/`workspace:^` pin along with it.
- Updated dependencies [[`99fdbbb`](https://github.com/OneEyed1366/symbiote-native/commit/99fdbbb54b72d5d06cfd95fbf0d82f2d9fe17a6a)]:
  - @symbiote-native/components@3.1.2
  - @symbiote-native/css-parser@0.5.2

## 3.0.3

### Patch Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: the zero-config entry example was missing `import '@symbiote-native/solid'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Fixes the exported-name count (eleven → twelve, missing `render`) and leads Install with `npx @symbiote-native/cli new`.

- Updated dependencies [[`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4), [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4)]:
  - @symbiote-native/components@3.1.1
  - @symbiote-native/css-parser@0.5.1

## 3.0.2

### Patch Changes

- [`1e8cd62`](https://github.com/OneEyed1366/symbiote-native/commit/1e8cd62387caded852fbb8e14c04b3195fc2c516) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Ship the Android parity release. Engine 1.2.0 and adapters 3.0.1 were already taken on npm, so the previous release skipped these packages.

- Updated dependencies []:
  - @symbiote-native/components@3.1.0

## 3.0.1

### Patch Changes

- [`26775bc`](https://github.com/OneEyed1366/symbiote-native/commit/26775bce65788f9074dcb10460f8cf683be5ed70) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - - Every adapter keeps an iOS Modal mounted until native dismiss, then calls `onDismiss`.
  - Every adapter sends `isInvertedVirtualizedList` for inverted lists.
  - Svelte and Angular lists forward `removeClippedSubviews` and `nestedScrollEnabled` to their ScrollView. React, Vue and Solid list prop types now declare `nestedScrollEnabled`.
  - A bare boolean attribute (`<view accessible>`, `nested-scroll-enabled`) now reaches native as `true` in Vue templates and on Svelte tags. Before, it arrived as `""`, which Android rejects.
- Updated dependencies [[`fba54ee`](https://github.com/OneEyed1366/symbiote-native/commit/fba54ee2d39a3b2ea12bb11a846b32658e3f8902), [`d4f46e7`](https://github.com/OneEyed1366/symbiote-native/commit/d4f46e7ca1601aa469b5c8c5ab97f8a8217c968f), [`3de549b`](https://github.com/OneEyed1366/symbiote-native/commit/3de549b2ab9785c845a1f3acd5626d85d2b9b9e4)]:
  - @symbiote-native/components@3.1.0

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

### Patch Changes

- [#78](https://github.com/OneEyed1366/symbiote-native/pull/78) [`3d96ca3`](https://github.com/OneEyed1366/symbiote-native/commit/3d96ca368a90504d6a9053f3937718aa0fe9a44a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Rewrite the README to match the other adapters' shape (Install/Use it/Parity/Run it/Test it) and state explicitly that Solid's surface is verified on-device, same as React/Vue/Svelte/Angular. Also fixes a stale claim that `metro.config.js` needs `unstable_conditionNames: ['browser']` — it deliberately doesn't, and setting it would break the `react-native` resolution condition.

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

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Button` and `ImageBackground` are no longer exported as components from `@symbiote-native/solid`,
  and the `<scroll-view>` tag drops the last wrapper still standing behind it.

  `Animated.View`, `Animated.Text` and `Animated.Image` are also gone — there is no dotted alias for a
  primitive that is already a tag; an animated value resolves in any prop of the plain element
  directly (`<view style={{ opacity: someAnimatedValue }}>`, `.claude/rules/animated-values-resolve-in-the-engine.md`).
  Only `Animated.ScrollView`, `Animated.FlatList` and `Animated.SectionList` remain, for the three
  primitives still genuinely components.

  Migration: replace `import { Button } from '@symbiote-native/solid'` + `<Button .../>` with
  `<button .../>`, and `<Animated.View style={...}/>` with `<view style={...}/>` — props are
  unchanged.

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

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Fix `<scroll-view>` losing content children when one is removed: Solid's renderer walked the tag's
  own node to find where a removed child had been, but a composed primitive's app-facing children
  live under its internal slot (`ISymbioteNode.childHost`), not the owner directly. Removing a child
  resolved the wrong parent and orphaned it instead of detaching it from the tree.

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `@symbiote-native/vue` gains its own `jsx-runtime` module (for `jsxImportSource:
'@symbiote-native/vue'` in Vue-TSX apps), built on the new `ICrossTypedIntrinsics` shape: every
  intrinsic tag types as a loose attribute bag except the ones with a real prop type
  (`IPressableProps`, `IRefreshControlProps`, …), which type-check for real instead of accepting
  anything. `intrinsic-elements.ts` and the `.vue` SFC `GlobalComponents`/Volar table move onto the
  same generic, so a template and a TSX file no longer disagree on what a tag accepts.

  `@symbiote-native/solid`'s existing `jsx-runtime.ts` (it reached this shape first) extends onto the
  same shared generic rather than its own hand-rolled version.

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

## 0.1.0

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
