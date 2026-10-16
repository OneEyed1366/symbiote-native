# @symbiote-native/react

## 3.4.0

### Minor Changes

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` (`create*` on Solid, `inject*` on Angular), and `AnimatedValueXY` / `AnimatedColor` now take RN's `config` with `useNativeDriver`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList` and `VirtualizedList` take RN's `ListItemComponent` (`listItemComponent` on Vue, Svelte and Angular), a component that draws a cell from `item`, `index` and `separators`. It wins over the item renderer and warns when both are given, a cell with neither throws like RN. The list handle's `getNativeScrollRef()` is the scroll's host ref, so it has `measure`, `measureLayout` and `measureInWindow`. `Button` falls back to `accessibilityLabel` for an empty `aria-label`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every adapter exports RN's `NativeModules`, `Networking`, `LogBox`, `DevMenu`, `Touchable`, `PushNotificationIOS`, `NativeComponentRegistry`, `requireNativeComponent`, `codegenNativeComponent`, `codegenNativeCommands` and `registerCallableModule`, forwarded to RN's own module by `bootstrapHost`. A new `<layout-conformance>` tag carries `experimental_LayoutConformance`. React adds `unstable_batchedUpdates`, `usePressability`, `unstable_NativeText` and `unstable_NativeView`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - RN's `DeviceEventEmitter`, `NativeAppEventEmitter`, `NativeEventEmitter`, `Easing`, `Systrace`, `DevSettings`, `ReactNativeVersion`, `UTFSequence`, `TurboModuleRegistry` and `UIManager` are exported from every adapter, and React adds `RootTagContext`. `UIManager` forwards to RN's own module, handed over by `bootstrapHost`. `getEnforcingNativeModule` raises RN's `getEnforcing` text.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `StatusBar` keeps RN's props stack: nested bars compose, unmounting restores the bar below, native is updated once per frame with only what changed, and Android re-sends style and color like RN. Adds `showHideTransition`, `pushStackEntry` / `popStackEntry` / `replaceStackEntry`, and the cross-platform setter warnings. `applyStatusBarProps` is replaced by `createStatusBarEntry` in `@symbiote-native/engine`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A string child of `<text-input>` is its content, as in React Native (`<TextInput>hello</TextInput>`), instead of throwing "must be rendered inside a <text>". A host behavior opts in with `acceptsTextChildren`.

### Patch Changes

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `setDeviceEventSource` is no longer exported, the device bus is RN's own.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Appearance` and `AppState` are React Native's own modules, `useColorScheme` of React is RN's hook and `colorScheme` can be `undefined` as in RN.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `RefreshControl` `titleColor`, `progressBackgroundColor` and `colors` now reach native as colours. Before, a string stayed a string and native painted nothing. The colour props RN types as `ColorValue` accept a `PlatformColor` here too: `RefreshControl` (`tintColor`, `titleColor`, `colors`, `progressBackgroundColor`), `TouchableHighlight` `underlayColor`, `Switch` `thumbColor` and `ios_backgroundColor`, `Button` `color`, `ActivityIndicator` `color`, `Modal` `backdropColor` (Vue dropped it before), `ScrollView` `endFillColor`, `InputAccessoryView` `backgroundColor`, `Image` `tintColor` (Angular dropped it before). `isProcessableColor` is exported from the engine.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ItemSeparatorComponent` of `FlatList`, `VirtualizedList`, `SectionList` and `VirtualizedSectionList` accepts a ready React element as well as a component, as in RN 0.83. An element is rendered as it is, a component gets the separator props. Before, an element threw "Element type is invalid" on the first separator.

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

## 3.3.0

### Minor Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Export the hook factories the Expo wrapper packages are built on: `createPermissionHook`, `createResourceHook` and `createEventValueHook` on React, Vue, Svelte and Solid, and `createResourceHook`, `createEventValueHook`, `PermissionsServiceBase` and `connectWatchedSignal` on Angular. The shared logic lives once in `@symbiote-native/engine` (`createPermissionApi`, `createResourceController` and friends). Angular also exports `AccessibilityInputsBase`, `NativeViewBase` and `anchorStyleProp`, which the slider now builds on, and splits its list components into smaller files without changing their API.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add the `checkbox` primitive, a port of `expo-checkbox` on every adapter: a pressable box with a checkmark image, `value`, `color`, `disabled` and `onValueChange`, styled by a tag rule in the engine so all adapters commit the same payload.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `useEvent` and `useEventListener` (the `expo` package's hooks) to every adapter, for any emitter such as a native module or a shared object: React, Vue and Solid export them, Svelte has `@symbiote-native/svelte/runes/use-event`, Angular has `injectEvent` and `injectEventListener`. The engine gains `bindEventListener`, which they share.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/video`: the player (`useVideoPlayer` / `injectVideoPlayer`, `createVideoPlayer`), `VideoView` with fullscreen and Picture in Picture functions, `VideoAirPlayButton`, thumbnails and the video cache functions on React, Vue, Svelte, Solid and Angular, and a `--video` layer in the CLI. The engine gains `createJsonKeyedResourceController` (audio now takes it from there), and React, Vue, Solid and Svelte gain a helper that builds a component over a package's native view controller (`useNativeViewController` and `defineNativeViewComponent`).

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Render into a `ConcurrentRoot` and schedule microtasks, so `useTransition` and `startTransition` defer updates instead of running them synchronously.

### Patch Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/gl`: `GLView` with a WebGL2 context, headless contexts and snapshots on React, Vue, Svelte, Solid and Angular, and a `--gl` layer in the CLI. A native view controller can now define `dispose`, which every adapter runs when the view unmounts.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/image`: `Image`, `ImageBackground` and `useImage` on React, Vue, Svelte, Solid and Angular (`ExpoImage`, `ExpoImageBackground`, `injectImage`), the cache and hash functions, and an `--image` layer in the CLI. React gains `descriptorToReactWithChildren`, which `LinearGradient` and `BlurView` now share.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: the zero-config entry example was missing `import '@symbiote-native/react'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Also corrects the Node requirement (react-native 0.86's own `package.json#engines` needs `>=22.13`, not `>=22.11`) and leads Install with `npx @symbiote-native/cli new`.

- Updated dependencies [[`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851)]:
  - @symbiote-native/components@3.2.0
  - @symbiote-native/css-parser@0.5.4

## 3.2.0

### Minor Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Export the hook factories the Expo wrapper packages are built on: `createPermissionHook`, `createResourceHook` and `createEventValueHook` on React, Vue, Svelte and Solid, and `createResourceHook`, `createEventValueHook`, `PermissionsServiceBase` and `connectWatchedSignal` on Angular. The shared logic lives once in `@symbiote-native/engine` (`createPermissionApi`, `createResourceController` and friends). Angular also exports `AccessibilityInputsBase`, `NativeViewBase` and `anchorStyleProp`, which the slider now builds on, and splits its list components into smaller files without changing their API.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Render into a `ConcurrentRoot` and schedule microtasks, so `useTransition` and `startTransition` defer updates instead of running them synchronously.

### Patch Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: the zero-config entry example was missing `import '@symbiote-native/react'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Also corrects the Node requirement (react-native 0.86's own `package.json#engines` needs `>=22.13`, not `>=22.11`) and leads Install with `npx @symbiote-native/cli new`.

- Updated dependencies [[`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578), [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578)]:
  - @symbiote-native/components@3.1.4
  - @symbiote-native/css-parser@0.5.3

## 3.1.0

### Minor Changes

- [`bb26a15`](https://github.com/OneEyed1366/symbiote-native/commit/bb26a15d87bf55ac43895b6ab4acd53fcd7436da) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Render into a `ConcurrentRoot` and schedule microtasks, so `useTransition` and `startTransition` defer updates instead of running them synchronously.

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

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: the zero-config entry example was missing `import '@symbiote-native/react'` — the bare side-effect import that registers host behaviors (Pressable/Switch/Image); `/bootstrap` alone doesn't reach it, and Metro's production `inlineRequires` drops it silently without the bare import. Also corrects the Node requirement (react-native 0.86's own `package.json#engines` needs `>=22.13`, not `>=22.11`) and leads Install with `npx @symbiote-native/cli new`.

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

- [#83](https://github.com/OneEyed1366/symbiote-native/pull/83) [`564870f`](https://github.com/OneEyed1366/symbiote-native/commit/564870ffabb61b3b778fcf18600b1c5f40d62ac2) Thanks [@github-actions](https://github.com/apps/github-actions)! - Walk props bags with `Object.keys` instead of `Object.entries` on the per-node paths. `entries` allocates the outer array and a two-element array per key before the loop starts; `keys` allocates one array of strings, and the value is a property read the adapter is about to make anyway. Measured on `-O` Hermes over a four-key bag: 0.42 us against 0.23, so ~0.19 us per node - about 1.9 ms of a thousand-row create. No behaviour change; `applyUpdate`'s sibling loop already used `Object.keys`.

- Updated dependencies [[`fba54ee`](https://github.com/OneEyed1366/symbiote-native/commit/fba54ee2d39a3b2ea12bb11a846b32658e3f8902), [`d4f46e7`](https://github.com/OneEyed1366/symbiote-native/commit/d4f46e7ca1601aa469b5c8c5ab97f8a8217c968f), [`3de549b`](https://github.com/OneEyed1366/symbiote-native/commit/3de549b2ab9785c845a1f3acd5626d85d2b9b9e4)]:
  - @symbiote-native/components@3.1.0

## 3.0.0

### Major Changes

- [#71](https://github.com/OneEyed1366/symbiote-native/pull/71) [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `View`, `Text`, `Image`, `ScrollView`, `TextInput`, `Switch`, `SafeAreaView`, `RefreshControl`,
  `InputAccessoryView`, `ActivityIndicator`, `ImageBackground`, `Button`, `TouchableWithoutFeedback`
  and `TouchableNativeFeedback` are no longer exported as components from `@symbiote-native/react`.

  Each is now the intrinsic tag it already compiled to under `jsxImportSource: '@symbiote-native/react'`
  (`<view>`, `<text>`, `<scroll-view>`, `<switch>`, …) — write the tag directly, there is nothing left
  to import in the wrapper's place. `TouchableNativeFeedback` and `Image` survive as RN's own static
  namespaces (`Image.getSize`, `TouchableNativeFeedback.Ripple`), re-exported from
  `@symbiote-native/components` instead of a local wrapper. Every prop type (`IViewProps`,
  `ITextProps`, `IScrollViewProps`, …) still exports for a component that forwards a bag onward.

  `KeyboardAvoidingView`, `Modal`, `Pressable`, `TouchableOpacity`, `TouchableHighlight`,
  `FlatList`, `VirtualizedList` and `SectionList` are unaffected — real composite behavior a single
  tag cannot express, or (`Pressable`, the two remaining Touchables) still genuinely components on
  this adapter.

  Migration: replace `import { ScrollView } from '@symbiote-native/react'; <ScrollView .../>` with
  `<scroll-view .../>` — no import needed, the props are unchanged.

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

- [#71](https://github.com/OneEyed1366/symbiote-native/pull/71) [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - React's host config now passes the intrinsic tag to the engine's `createElement`.

  The host-behavior registry is keyed by intrinsic tag, never by Fabric view name — `pressable` and a
  plain `view` both resolve to `RCTView`. React computed the tag to resolve the view name and then
  dropped it, so any behavior lookup ran against `RCTView` and matched nothing. It is the prerequisite
  for host behaviors on this adapter, which was the only one of the five not passing it.

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

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `View`, `Text`, `Image`, `ScrollView`, `TextInput`, `Switch`, `SafeAreaView`, `RefreshControl`,
  `InputAccessoryView`, `ActivityIndicator`, `ImageBackground`, `Button`, `TouchableWithoutFeedback`
  and `TouchableNativeFeedback` are no longer exported as components from `@symbiote-native/react`.

  Each is now the intrinsic tag it already lowered to under `jsxImportSource: '@symbiote-native/react'`
  (`<view>`, `<text>`, `<scroll-view>`, `<switch>`, …) — write the tag directly, there is nothing left
  to import in the wrapper's place. `TouchableNativeFeedback` and `Image` survive as RN's own static
  namespaces (`Image.getSize`, `TouchableNativeFeedback.Ripple`), re-exported from
  `@symbiote-native/components` instead of a local wrapper. Every prop type (`IViewProps`,
  `ITextProps`, `IScrollViewProps`, …) still exports for a component that forwards a bag onward.

  `KeyboardAvoidingView`, `Modal`, `Pressable`, `TouchableOpacity`, `TouchableHighlight`,
  `FlatList`, `VirtualizedList` and `SectionList` are unaffected — real composite behavior a single
  tag cannot express, or (`Pressable`, the two remaining Touchables) still genuinely components on
  this adapter.

  Migration: replace `import { ScrollView } from '@symbiote-native/react'; <ScrollView .../>` with
  `<scroll-view .../>` — no import needed, the props are unchanged.

### Minor Changes

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `@symbiote-native/react` now ships its own `jsx-runtime` / `jsx-dev-runtime` entry points and a
  freshly-declared `JSX.IntrinsicElements`, in place of the old `declare module 'react'` merge that
  `src/jsx.ts` used to perform.

  A merge inherits every key `@types/react` already owns — `view`, `text`, `image` and `switch` are
  real SVG element names there, so an unprefixed intrinsic tag of one of those names was a TS2717
  ("subsequent property declarations must have the same type"). Declaring the namespace fresh, and
  pointing an app's `jsxImportSource` at `@symbiote-native/react`, is what frees the short tag names
  from that collision — the prerequisite the later wrapper-retirement commits build on, not yet the
  retirement itself.

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

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - React's host config now passes the intrinsic tag to the engine's `createElement`.

  The host-behavior registry is keyed by intrinsic tag, never by Fabric view name — `symbiote-pressable`
  and a plain `View` both resolve to `RCTView`. React computed the tag to resolve the view name and
  then dropped it, so any behavior lookup ran against `RCTView` and matched nothing.

  Inert on landing: nothing registers a behavior under a tag React emits, and the
  `symbiote-text-input-managed` / `symbiote-switch-managed` split keeps a wrapper-built node out of a
  lowered tag's machine once something does. It is the prerequisite for host behaviors on this
  adapter, which is the only one of the five that was not passing it.

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

## 0.4.0

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

## 0.3.0

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

### Patch Changes

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

## 0.2.8

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

- 465c9e8: Rewrite Switch and ActivityIndicator's React lifecycle from a `createX(platform)`
  factory returning an anonymous closure into a top-level `useXLogic` hook plus a
  top-level named component per platform file. The factory shape defeats React
  Compiler's component/hook detection, which only walks top-level declarations;
  this rewrite has no effect on props, behavior, or exports, but lets `Activity-
Indicator` compile cleanly under `babel-plugin-react-compiler` and lets `Switch`'s
  own wrapper compile (its stateful hook still can't, due to a ref flowing through
  `passthrough` into a cross-package render call — see the `symbiote-add-component`
  skill §7 for the full investigation).
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

## 0.2.7

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
- f43fe5b: Fix React's `StatusBar` duplicating `core/engine`'s native-module driving logic (`applyStatusBarProps`, `statusBarImperative`, `statusBarCurrentHeight`) instead of calling it, same as Vue and Angular already do. The iOS and Android modules now delegate to the shared engine functions — same public behavior, ~150 fewer lines of duplicated `getNativeModule`/setter-call logic.
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

## 0.2.6

### Patch Changes

- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- f43fe5b: Fix React's `StatusBar` duplicating `core/engine`'s native-module driving logic (`applyStatusBarProps`, `statusBarImperative`, `statusBarCurrentHeight`) instead of calling it, same as Vue and Angular already do. The iOS and Android modules now delegate to the shared engine functions — same public behavior, ~150 fewer lines of duplicated `getNativeModule`/setter-call logic.
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

## 0.2.5

### Patch Changes

- f43fe5b: Fix React's `StatusBar` duplicating `core/engine`'s native-module driving logic (`applyStatusBarProps`, `statusBarImperative`, `statusBarCurrentHeight`) instead of calling it, same as Vue and Angular already do. The iOS and Android modules now delegate to the shared engine functions — same public behavior, ~150 fewer lines of duplicated `getNativeModule`/setter-call logic.
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
  - @symbiote-native/engine@0.1.5
  - @symbiote-native/components@0.2.4

## 0.2.4

### Patch Changes

- 706e52f: Fix `scripts/fix-esm-extensions.mjs` baking a literal `/index.js` extension folder-as-module directory imports (`component-names/`, `share/`, `alert/`, `platform/`, `status-bar/`, `accessibility-info/`, `linking/`, ...) that also carry `index.ios.js`/`index.android.js` siblings. Once the specifier is explicit, Metro's platform-extension layering never runs, so every platform silently resolved to the same (iOS-hardcoded, headless-fallback) file — on Android this surfaced as `Can't find ViewManager 'PullToRefreshView' nor 'RCTPullToRefreshView'` and similar wrong-native-name crashes. The script now detects platform-specific siblings and leaves those specifiers extensionless, matching react-native-builder-bob's own accepted approach for the same tension (Node ESM needs explicit extensions; Metro needs them omitted to layer `.ios`/`.android`/`.native`). Known tradeoff, same as bob: a plain headless Node/ESM import reaching one of these folders directly (bypassing Metro) will fail to resolve — nothing in this repo currently does that.
- Updated dependencies [706e52f]
  - @symbiote-native/components@0.2.3
  - @symbiote-native/engine@0.1.4

## 0.2.3

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.
- Updated dependencies [46a4f27]
  - @symbiote-native/components@0.2.2
  - @symbiote-native/css-parser@0.2.1
  - @symbiote-native/engine@0.1.3

## 0.2.2

### Patch Changes

- c66082c: Fix relative imports missing file extensions in the published `build/` output, which broke every published package for real Node ESM consumers (Vitest, plain `node`, non-Metro bundlers) — `import('@symbiote-native/vue')` failed outright with `ERR_MODULE_NOT_FOUND`. Metro's own resolver is lenient about missing extensions, which is why this went unnoticed until a published package's compiled output was consumed directly through Node's native ESM loader for the first time.

  The fix runs as a post-build step (`scripts/fix-esm-extensions.mjs`, wired into the root `build` script right after `typecheck`) that rewrites relative import specifiers in the already-compiled `build/**/*.js` files. It does not touch `src/*.ts` — Metro's resolver treats an explicit extension as literal (it only layers `.ios`/`.android`/`.native` suffixes on top, unlike `tsc`/Node's `.js`-maps-to-`.ts` resolution), so adding `.js` extensions directly in the TypeScript source breaks Metro's dev-mode resolution of the unbuilt source. Confirmed by reverting an earlier source-level attempt after it broke the local Vue example apps' bundling.

- Updated dependencies [c66082c]
  - @symbiote-native/engine@0.1.2
  - @symbiote-native/components@0.2.1

## 0.2.1

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
