# @symbiote-native/components

## 3.3.0

### Minor Changes

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `aria-label`, `aria-labelledby`, `aria-live`, `aria-hidden` and `role` now win over their explicit `accessibility*` twins, as in RN's `View`. `Text` resolves a negative `numberOfLines` to 0, maps style `userSelect` to `selectable` and `verticalAlign` to `textAlignVertical`, and folds `disabled` into `accessibilityState`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList` and `VirtualizedList` take RN's `ListItemComponent` (`listItemComponent` on Vue, Svelte and Angular), a component that draws a cell from `item`, `index` and `separators`. It wins over the item renderer and warns when both are given, a cell with neither throws like RN. The list handle's `getNativeScrollRef()` is the scroll's host ref, so it has `measure`, `measureLayout` and `measureInWindow`. `Button` falls back to `accessibilityLabel` for an empty `aria-label`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every adapter exports RN's `NativeModules`, `Networking`, `LogBox`, `DevMenu`, `Touchable`, `PushNotificationIOS`, `NativeComponentRegistry`, `requireNativeComponent`, `codegenNativeComponent`, `codegenNativeCommands` and `registerCallableModule`, forwarded to RN's own module by `bootstrapHost`. A new `<layout-conformance>` tag carries `experimental_LayoutConformance`. React adds `unstable_batchedUpdates`, `usePressability`, `unstable_NativeText` and `unstable_NativeView`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - RN's `DeviceEventEmitter`, `NativeAppEventEmitter`, `NativeEventEmitter`, `Easing`, `Systrace`, `DevSettings`, `ReactNativeVersion`, `UTFSequence`, `TurboModuleRegistry` and `UIManager` are exported from every adapter, and React adds `RootTagContext`. `UIManager` forwards to RN's own module, handed over by `bootstrapHost`. `getEnforcingNativeModule` raises RN's `getEnforcing` text.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A string child of `<text-input>` is its content, as in React Native (`<TextInput>hello</TextInput>`), instead of throwing "must be rendered inside a <text>". A host behavior opts in with `acceptsTextChildren`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A `<text-input>` ref carries React Native's own imperative API: `clear`, `isFocused`, `setSelection` and `getNativeRef` sit on the node next to `focus` and `blur`, which now go through `TextInputState` as in RN. `textInputOf(ref)` returns the typed view of it.

### Patch Changes

- [`8c2c5d6`](https://github.com/OneEyed1366/symbiote-native/commit/8c2c5d63dd9e980aae19b392c63d73f9929b103e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Comments and READMEs no longer point at project skills that were removed.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `CellRenderMask`, the list window math and the default list key come from `@react-native/virtualized-lists`, the component logic that stays ported carries a `TODO(rn-port)`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The engine barrel exports `Alert`, `Share`, `Dimensions`, `Appearance` and the other device modules from the react-native host. `NativeEventEmitter` builds RN's own class and `DeviceEventEmitter` is RN's bus, so `setDeviceEventSource`, `installDeviceEventHub` and the `deviceEventSource` bootstrap option are gone.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `android_ripple` and `TouchableNativeFeedback.Ripple` accept any colour value, a `PlatformColor` among them, and `android_ripple` takes `alpha`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Every view accepts `onKeyDown`, `onKeyUp` and their `Capture` twins, the key events RN added to the Android base view config in 0.84. They bubble like `onKeyPress` and carry `key`, `code` and the four modifier flags. Native sends them only when the app enables key events, so on iOS they stay silent. Before, the props were not registered as events and landed in the view's props unread.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `RefreshControl` `titleColor`, `progressBackgroundColor` and `colors` now reach native as colours. Before, a string stayed a string and native painted nothing. The colour props RN types as `ColorValue` accept a `PlatformColor` here too: `RefreshControl` (`tintColor`, `titleColor`, `colors`, `progressBackgroundColor`), `TouchableHighlight` `underlayColor`, `Switch` `thumbColor` and `ios_backgroundColor`, `Button` `color`, `ActivityIndicator` `color`, `Modal` `backdropColor` (Vue dropped it before), `ScrollView` `endFillColor`, `InputAccessoryView` `backgroundColor`, `Image` `tintColor` (Angular dropped it before). `isProcessableColor` is exported from the engine.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Image` takes `resizeMode="none"` and `resizeMultiplier` as RN does, and an image `source` types `headers`, `method`, `body`, `cache` and `bundle`. Angular's `Animated.Image` dropped `resizeMode="none"` and `resizeMultiplier` before; `image-shared.ts` is split into the input list, the prop fold and the component base, and the fold is table-driven.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A drag on the selection handles of an iOS `TextInput` keeps the gesture. The engine now negotiates `onSelectionChangeShouldSetResponder` (and its capture twin) on a selection change while a touch is down, as RN's responder plugin does, and the iOS `TextInput` claims it. Android never did.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `experimental_accessibilityOrder` is a typed prop on every view, as in React Native; it already reached native as written.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList`, `SectionList` and `VirtualizedList` take RN's `CellRendererComponent` (React and Solid `CellRendererComponent`, Vue `cellRendererComponent`, Svelte `cellRenderer` snippet, Angular `<ng-template vListCell>`): it replaces the view around each cell and receives the cell key, index, item, style and the layout and focus handlers.

  The view around each cell of a horizontal list now lays out as a row, so the separator sits beside the item as in RN, and an inverted list's cell reverses its direction before flipping back.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A click now reaches a view and a pressable. `onClick` works on any view, and a click event (the accessibility activation) presses a `Pressable`, `Touchable*` and `Button` like RN's Pressability: ignored while disabled, ignored when it carries a `pointerType`, and left to the nested pressable it was aimed at.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList`, `SectionList` and `VirtualizedList` take `disableVirtualization`, as RN does: the window stays anchored at the first cell, grows by `maxToRenderPerBatch` once the end is within `onEndReachedThreshold`, and no spacer stands in for the cells not yet mounted.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList` takes `data` the way RN does: `null`, a number or an object with no length is an empty list, and any array-like object is read by index. React threw on `null` while rendering, and Vue turned an array-like into an empty list.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A horizontal list no longer pins its content container to a width of 0 before the first cell is measured. The pin folded every cell onto the origin, so a list of cells with no width of their own showed one empty cell and a blank row.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `KeyboardAvoidingView` with `behavior="height"` no longer stacks the keyboard overlap on itself while `enabled` is false.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `LayoutConformance` replaces the app style with `display: contents`, as RN does, instead of merging the two. The rule now lives in the engine's C++ tag rules, so no adapter pays a JS fold for it.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList`, `SectionList`, `VirtualizedList` and `VirtualizedSectionList` take `innerViewRef` and hand it to their `ScrollView`, as RN does through `...props`. The prop is typed on every adapter, and Svelte and Angular forward it by hand.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `maintainVisibleContentPosition` on the windowed lists follows RN. When items are added or removed above the anchor, the render window moves with the anchor key, so the rows native anchors on stay mounted and native does the scroll adjustment. The list no longer sends its own compensating `scrollTo` or autoscroll after a prepend.

  `computeMvcpAdjustment` and its types are no longer exported from `@symbiote-native/components`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A virtualized list drops the cell measurements it took along another axis or text direction when `horizontal` or RTL changes, as React Native does, instead of sizing the new layout from stale lengths.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A horizontal `VirtualizedList`, `FlatList`, `SectionList` and `VirtualizedSectionList` follow `I18nManager.isRTL` as RN does: offsets count from the right edge, so a scroll event at `x = 0` is the end of the data, a cell's position and an imperative scroll are converted at the native boundary, and `scrollToOffset` before the content is laid out warns and scrolls nowhere. The lists now take the scroll view's `onContentSizeChange` to learn the content length and still call the app's own handler, and `onEndReached` / `onStartReached` now measure against that real content length (a footer or padding counts), as RN does, instead of the sum of the cells.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `VirtualizedList`, `FlatList`, `SectionList` and `VirtualizedSectionList` handles gain `getScrollRef()`, RN's accessor for the node the list scrolls by. It answers the scroll view node, or the host view of a nested list that renders as a plain view, and null until the list commits.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `FlatList`, `SectionList`, `VirtualizedList` and `VirtualizedSectionList` handles get RN's `setNativeProps`, which writes the props onto the list's scroll view.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Modal` no longer forwards the deprecated `animated` prop to the native host, as React Native does not.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `role` reaches the native layer as it is, the way React Native 0.86 sends it, instead of being rewritten into `accessibilityRole`. A role outside the old 28-name table (`dialog`, `tooltip`) is no longer sent as an invalid `accessibilityRole`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ScrollView` takes RN's `innerViewRef`: a callback that receives the content view after the first commit, `null` when the scroll view goes away, and `null` then the node again when the callback is swapped.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ScrollView` calls `onKeyboardWillShow`, `onKeyboardWillHide`, `onKeyboardDidShow` and `onKeyboardDidHide` with the keyboard event, as React Native does, on every adapter.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `ScrollView` gains `experimental_endDraggingSensitivityMultiplier` on every adapter, treats a null `snapToInterval` / `snapToOffsets` as absent when resolving `pagingEnabled`, and lets the app's `contentContainerStyle` override the horizontal row direction, as RN's render does.

  `ScrollView` gains `stickyHeaderHiddenOnScroll`: a pinned header slides out by its own height on a downward scroll and comes back as far as the scroll returns, built from `Animated.diffClamp` over the scroll delta as in RN's `ScrollViewStickyHeader`. The pin now rebuilds when the flag flips, and `FlatList`, `SectionList` and `VirtualizedList` forward the prop to their scroll view.

  `onContentSizeChange` now fires on every layout of the content view, as in RN, instead of only when the size changed. The `didContentSizeChange` helper and the `IContentSize` type are gone from `@symbiote-native/components`.

  A `ScrollView` ref now carries the rest of RN's imperative surface: `getScrollResponder`, `getScrollableNode`, `getNativeScrollRef`, `getInnerViewRef`, `getInnerViewNode`, `scrollResponderZoomTo` and `scrollResponderScrollNativeHandleToKeyboard`.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `SectionList` and `VirtualizedSectionList` paint separators the way RN does, inside the item cell. The section separator sits before a section's first item and after its last, the item separator only between two items of one section, and no separator is drawn next to a section header or footer. Separator components get `leadingItem`, `trailingItem`, `section`, `leadingSection` and `trailingSection`, and `highlight()` / `updateProps()` reach the neighbouring cell's separator.

  A section can bring its own item render and item separator, which beat the list's. With a section separator set, flat indices now match RN's, so `getItemLayout` needs no per-boundary correction.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - In a section list, `separators.updateProps('leading', ...)` routed to the previous cell now replaces that cell's earlier separator props instead of merging into them, as in React Native.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Sticky headers follow the scroll position past `contentInset.top` and start pinned at the initial `contentOffset`, as in React Native; the shared scroll value ignored both.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `TextInput` matches RN on three points. iOS sends `selectionColor` alone, without `cursorColor` and `selectionHandleColor`, while Android still coalesces the three. Under `Platform.isTesting` the caret is hidden whatever `caretHidden` the app wrote. On Android a `value` together with children throws RN's "Cannot specify both value and children." when the child is inserted.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `TextInput` follows RN where it differed. A numeric `fontWeight` on a `Text` or `TextInput` reaches native as a string, `verticalAlign` on a `TextInput` becomes `textAlignVertical`, and an iOS multiline input without its own vertical padding gets RN's 5pt top inset.

  The ref now behaves like RN's: `isFocused()` reads the app-wide focus tracker, so it is true right after `focus()` and false as soon as another input takes focus, `setSelection()` sends a null text instead of echoing the current one, and `clear()` no longer moves the mirror of the native text. It also answers `getNativeRef()`, the native node.

  `TextInputState` (RN's `TextInput.State`: `focusTextInput`, `blurTextInput`, `currentlyFocusedInput`) is exported from every adapter.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `TouchableWithoutFeedback` reads `aria-disabled` and `accessibilityState.disabled` for a `disabled` that is `null`, and only then, as React Native does.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `onTouchStart`, `onTouchMove`, `onTouchEnd`, `onTouchCancel` and the `Capture` twin of every bubbling event (`onFocusCapture`, `onBlurCapture`, `onClickCapture`, `onPressCapture`, `onChangeCapture`...) now reach an ancestor, as in React Native; they were never delivered.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `VirtualizedList` warns once for an `initialScrollIndex` that is negative or past the data, as React Native does, and a fractional index past the last cell's start now scrolls inside that cell instead of to its start.

- [#95](https://github.com/OneEyed1366/symbiote-native/pull/95) [`6aff5a5`](https://github.com/OneEyed1366/symbiote-native/commit/6aff5a5d92e283881b5bc3ea3293e9ac8efd8f1e) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `Dimensions`, `PixelRatio`, `I18nManager`, `Appearance`, `AppState`, `Settings`, `BackHandler`, `Alert`, `Linking`, `Vibration`, `Share`, `ToastAndroid`, `ActionSheetIOS`, `PermissionsAndroid`, `InteractionManager` and `LayoutAnimation` are React Native's own modules, forwarded through the host `bootstrapHost` hands over, instead of hand-written ports. They now behave exactly as in RN: `Dimensions.get` throws for an unknown key, `Settings` warns and does nothing off iOS, `useColorScheme` can answer `undefined`, `ToastAndroid` throws without its native module and reports RN's gravity constants, `LayoutAnimation.setEnabled` does nothing as in RN. `bootstrapHost` loads RN's `BackHandler` so an Android app without a handler still exits on back, and the `react-native` module is handed to the engine when `@symbiote-native/*/bootstrap` is imported, so a `Dimensions.get('window')` at the top of an app file works. `DevSettings`, `Systrace`, `UTFSequence`, `ReactNativeVersion` and `SpringConfig` are RN's too, and `resolveAssetSource` is RN's function instead of a bootstrap copy. `processAspectRatio` and `processFontVariant` call RN's own functions. `@symbiote-native/components` now depends on `@react-native/virtualized-lists`: `CellRenderMask` and the list window math (`VirtualizeUtils`) are RN's own, and the window follows RN's `fixVirtualizeListCollapseWindowSize` flag. `DeviceEventEmitter` is RN's `RCTDeviceEventEmitter` and `NativeEventEmitter` builds RN's own class when it gets a module, so observe counters and listener errors follow RN. The React `useColorScheme` is RN's own hook. Breaking: `setDeviceEventSource`, `installDeviceEventHub` and the `deviceEventSource` bootstrap option are gone, and `invariant` comes from the `invariant` package.

## 3.2.0

### Minor Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/camera`: `CameraView` with its picture, recording and preview functions, the camera and microphone permission hooks, the system barcode scanner and `scanFromURLAsync` on React, Vue, Svelte, Solid and Angular, and a `--camera` layer in the CLI. `@symbiote-native/components` gains `createHostNodeHolder`, which a component uses to reach the host node of its descriptor, and Angular's `NativeViewBase` gains `hostNode()` for the same.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add the `checkbox` primitive, a port of `expo-checkbox` on every adapter: a pressable box with a checkmark image, `value`, `color`, `disabled` and `onValueChange`, styled by a tag rule in the engine so all adapters commit the same payload.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/gl`: `GLView` with a WebGL2 context, headless contexts and snapshots on React, Vue, Svelte, Solid and Angular, and a `--gl` layer in the CLI. A native view controller can now define `dispose`, which every adapter runs when the view unmounts.

### Patch Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Export the hook factories the Expo wrapper packages are built on: `createPermissionHook`, `createResourceHook` and `createEventValueHook` on React, Vue, Svelte and Solid, and `createResourceHook`, `createEventValueHook`, `PermissionsServiceBase` and `connectWatchedSignal` on Angular. The shared logic lives once in `@symbiote-native/engine` (`createPermissionApi`, `createResourceController` and friends). Angular also exports `AccessibilityInputsBase`, `NativeViewBase` and `anchorStyleProp`, which the slider now builds on, and splits its list components into smaller files without changing their API.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - TouchableWithoutFeedback builds its press-timing runtime on the first gesture instead of when it
  adopts a child, so a list of them nobody touches stops paying for it: 383 bytes per item,
  7 183 -> 6 800 KB per thousand.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: the Usage example called `renderSwitch()`, a function that no longer exists — Switch's render function was retired when painting moved to a host behavior. Replaced with `renderModal()`/`modalReducer`/`createInitialModalState`, the real current three-layer reference component, and corrected the surrounding claim that Switch is the canonical example.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The press machine builds its gesture runtime on the first event instead of at mount, so a pressable
  nobody touches pays for its dispatchers and nothing else. Every tag carrying the machine drops
  ~1 KB per node: `button` 8 259 -> 7 259 KB / 1 000, `touchable-opacity` 7 992 -> 6 992,
  `pressable` 3 561 -> 2 559, `text-input` 6 090 -> 5 168.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - ScrollView, RefreshControl, Switch and TextInput answer their events through the shared dispatch
  too, so no behavior installs a listener closure per node any more except where the name is
  Fabric-gated. Per thousand items: scroll-view 3 878 -> 2 276 KB, refresh-control 5 906 -> 3 937,
  text-input 3 824 -> 3 105, switch 2 461 -> 2 015.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - TouchableOpacity and Button bind their animated opacity layer on the first press instead of at
  mount. Mounting a thousand touchables drops from 65 ms / 25 MB to 27 ms / 8 MB, a button from
  74 ms / 26 MB to 43 ms / 8 MB. An untouched touchable now commits no `opacity` key, matching
  vendor (`TouchableOpacity-itest.js`); `collapsable: false` is still forced from mount.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Bring the README of every Tier 3 and Tier 4 Expo package to the package README template, with per-adapter examples, API signatures and a Common questions section with cited sources. Correct the comment on `ICheckboxProps.color`: the grey disabled look is applied after it.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A host behavior answers its events through one shared dispatch instead of installing a closure per
  name, and TouchableOpacity builds its fade runtime on the first press rather than at attach. Per
  thousand items: pressable 2 559 -> 1 263 KB, touchable-opacity 6 992 -> 3 584, button 7 259 ->
  4 068, text-input 5 167 -> 3 824.

## 3.1.4

### Patch Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Export the hook factories the Expo wrapper packages are built on: `createPermissionHook`, `createResourceHook` and `createEventValueHook` on React, Vue, Svelte and Solid, and `createResourceHook`, `createEventValueHook`, `PermissionsServiceBase` and `connectWatchedSignal` on Angular. The shared logic lives once in `@symbiote-native/engine` (`createPermissionApi`, `createResourceController` and friends). Angular also exports `AccessibilityInputsBase`, `NativeViewBase` and `anchorStyleProp`, which the slider now builds on, and splits its list components into smaller files without changing their API.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - TouchableWithoutFeedback builds its press-timing runtime on the first gesture instead of when it
  adopts a child, so a list of them nobody touches stops paying for it: 383 bytes per item,
  7 183 -> 6 800 KB per thousand.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: the Usage example called `renderSwitch()`, a function that no longer exists — Switch's render function was retired when painting moved to a host behavior. Replaced with `renderModal()`/`modalReducer`/`createInitialModalState`, the real current three-layer reference component, and corrected the surrounding claim that Switch is the canonical example.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The press machine builds its gesture runtime on the first event instead of at mount, so a pressable
  nobody touches pays for its dispatchers and nothing else. Every tag carrying the machine drops
  ~1 KB per node: `button` 8 259 -> 7 259 KB / 1 000, `touchable-opacity` 7 992 -> 6 992,
  `pressable` 3 561 -> 2 559, `text-input` 6 090 -> 5 168.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - ScrollView, RefreshControl, Switch and TextInput answer their events through the shared dispatch
  too, so no behavior installs a listener closure per node any more except where the name is
  Fabric-gated. Per thousand items: scroll-view 3 878 -> 2 276 KB, refresh-control 5 906 -> 3 937,
  text-input 3 824 -> 3 105, switch 2 461 -> 2 015.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - TouchableOpacity and Button bind their animated opacity layer on the first press instead of at
  mount. Mounting a thousand touchables drops from 65 ms / 25 MB to 27 ms / 8 MB, a button from
  74 ms / 26 MB to 43 ms / 8 MB. An untouched touchable now commits no `opacity` key, matching
  vendor (`TouchableOpacity-itest.js`); `collapsable: false` is still forced from mount.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A host behavior answers its events through one shared dispatch instead of installing a closure per
  name, and TouchableOpacity builds its fade runtime on the first press rather than at attach. Per
  thousand items: pressable 2 559 -> 1 263 KB, touchable-opacity 6 992 -> 3 584, button 7 259 ->
  4 068, text-input 5 167 -> 3 824.

## 3.1.3

### Patch Changes

- [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - TouchableWithoutFeedback builds its press-timing runtime on the first gesture instead of when it
  adopts a child, so a list of them nobody touches stops paying for it: 383 bytes per item,
  7 183 -> 6 800 KB per thousand.

- [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The press machine builds its gesture runtime on the first event instead of at mount, so a pressable
  nobody touches pays for its dispatchers and nothing else. Every tag carrying the machine drops
  ~1 KB per node: `button` 8 259 -> 7 259 KB / 1 000, `touchable-opacity` 7 992 -> 6 992,
  `pressable` 3 561 -> 2 559, `text-input` 6 090 -> 5 168.

- [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - ScrollView, RefreshControl, Switch and TextInput answer their events through the shared dispatch
  too, so no behavior installs a listener closure per node any more except where the name is
  Fabric-gated. Per thousand items: scroll-view 3 878 -> 2 276 KB, refresh-control 5 906 -> 3 937,
  text-input 3 824 -> 3 105, switch 2 461 -> 2 015.

- [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - TouchableOpacity and Button bind their animated opacity layer on the first press instead of at
  mount. Mounting a thousand touchables drops from 65 ms / 25 MB to 27 ms / 8 MB, a button from
  74 ms / 26 MB to 43 ms / 8 MB. An untouched touchable now commits no `opacity` key, matching
  vendor (`TouchableOpacity-itest.js`); `collapsable: false` is still forced from mount.

- [`cfbb0f7`](https://github.com/OneEyed1366/symbiote-native/commit/cfbb0f7dd8251fb74553f04e58f7e368f63289f5) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - A host behavior answers its events through one shared dispatch instead of installing a closure per
  name, and TouchableOpacity builds its fade runtime on the first press rather than at attach. Per
  thousand items: pressable 2 559 -> 1 263 KB, touchable-opacity 6 992 -> 3 584, button 7 259 ->
  4 068, text-input 5 167 -> 3 824.

## 3.1.2

### Patch Changes

- [`99fdbbb`](https://github.com/OneEyed1366/symbiote-native/commit/99fdbbb54b72d5d06cfd95fbf0d82f2d9fe17a6a) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Force a clean republish of every publishable package. `engine@1.3.0`/`components@3.1.1` proved a
  missing changeset on a producer package can leave its published tarball silently behind its own
  source (see the `symbiote-release-publishing` skill's changeset-skips-callee gap) with no CI
  signal. A blanket patch here is the cheap way to rule out the same gap sitting anywhere else:
  every package rebuilds and republishes from current HEAD, and `updateInternalDependencies: patch`
  bumps every internal `workspace:*`/`workspace:^` pin along with it.

## 3.1.1

### Patch Changes

- [#86](https://github.com/OneEyed1366/symbiote-native/pull/86) [`aa17531`](https://github.com/OneEyed1366/symbiote-native/commit/aa175314db0f79474b9ac87bee3e30c4e87a72c4) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - README: the Usage example called `renderSwitch()`, a function that no longer exists — Switch's render function was retired when painting moved to a host behavior. Replaced with `renderModal()`/`modalReducer`/`createInitialModalState`, the real current three-layer reference component, and corrected the surrounding claim that Switch is the canonical example.

## 3.1.0

### Minor Changes

- [`fba54ee`](https://github.com/OneEyed1366/symbiote-native/commit/fba54ee2d39a3b2ea12bb11a846b32658e3f8902) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Component behavior matches React Native 0.86 on both platforms.

  - Pressable `android_ripple` and TouchableNativeFeedback send the ripple's view commands, so the ripple animates.
  - Inverted lists flip with `scale: -1` on Android, and the app's style overrides the flip.
  - On iOS, Modal stays mounted until native `onDismiss`. `visible` defaults to `true`.
  - Button uppercases its Android title with the full Unicode `toUpperCase`.
  - ScrollView dismisses the keyboard on `on-drag` on Android, trusts no keyboard event below API 30, and applies RN's `removeClippedSubviews` rules to the content view.
  - TextInput's `rejectResponderTermination` applies on iOS. InputAccessoryView warns off iOS.
  - The new press-machine option `cancelableOf` resolves `cancelable` per tag.

### Patch Changes

- [`d4f46e7`](https://github.com/OneEyed1366/symbiote-native/commit/d4f46e7ca1601aa469b5c8c5ab97f8a8217c968f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `VirtualizedList` paints `initialNumToRender` cells from `initialScrollIndex` on its first render, as RN does, then grows to the viewport window by batches.

- [#83](https://github.com/OneEyed1366/symbiote-native/pull/83) [`3de549b`](https://github.com/OneEyed1366/symbiote-native/commit/3de549b2ab9785c845a1f3acd5626d85d2b9b9e4) Thanks [@github-actions](https://github.com/apps/github-actions)! - Install the press machine's dispatchers from an array of pairs rather than a `Map`. Iterating a `Map` builds a fresh two-element array per entry for the destructuring to read back, and the loop runs once per node carrying a press machine - every `<TextInput>`, not just every `<Pressable>`. Measured on `-O` Hermes: ~0.7 us per input off a node that cost ~7.4. No behaviour change.

## 3.0.0

### Major Changes

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

- [#71](https://github.com/OneEyed1366/symbiote-native/pull/71) [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Declare `scroll-view`, `touchable-opacity` and `touchable-highlight` in
  `core/components/host-primitives.cjs`, the spec every adapter reads for a primitive's intrinsic tag,
  prop aliases and defaults. Without an entry a tag carries none of its folds, however completely its
  runtime behavior already lives on the engine node.

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

### Patch Changes

- [#71](https://github.com/OneEyed1366/symbiote-native/pull/71) [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `scrollTo`, `scrollToEnd` and `flashScrollIndicators` are now methods on `ISymbioteNode`, beside
  `focus` / `blur` / `measure`.

  A `<scroll-view>` hands the app its engine node, with no wrapper to build an imperative handle
  from — so anything the wrapper's handle offered has to be reachable from the node, or the public
  surface silently shrinks the day the primitive stops being a component.

  `buildScrollViewHandle` keeps its signature and now delegates to those methods instead of
  dispatching its own commands. The defaults (`x`/`y` 0, `animated` true) live in one place, so a ref
  and a tag cannot disagree about what `scrollTo()` with no argument means.

- Updated dependencies [[`72eab44`](https://github.com/OneEyed1366/symbiote-native/commit/72eab44031a0bb30cd90ac9d0fbc55de15606e26), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`d6fe117`](https://github.com/OneEyed1366/symbiote-native/commit/d6fe117ea712a41e6118f0cb4e84799817ee8d21), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023), [`204bb30`](https://github.com/OneEyed1366/symbiote-native/commit/204bb30a61d378aea7dab9f8983e198f1e578023)]:
  - @symbiote-native/engine@1.0.0

## 2.0.0

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

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/components/register`: every host behavior (`registerScrollViewBehavior`,
  `registerSwitchBehavior`, `registerTextInputBehavior`, the sticky-header and image behaviors, …)
  now registers from one shared module instead of five adapters each re-declaring the same call
  list in their own `register.ts`.

  The list had already drifted once between adapters before this landed — a behavior added for one
  framework and forgotten in another is now structurally impossible, since there is only one list to
  edit. `registerScrollViewBehavior()` itself is finally called for real (it existed since the
  structure-seam work but nothing invoked it while the wrappers still built their own content node);
  every adapter pulls it in through this entrypoint now that the wrappers are gone.

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

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Declare `scroll-view`, `touchable-opacity` and `touchable-highlight` in
  `core/components/host-primitives.cjs`, the build-time spec Vue's and Solid's lowering transforms
  read to decide which JSX elements compile straight to the engine's mutation API instead of a
  framework component instance. Without an entry a primitive stays a component forever, however
  completely its runtime behavior already lives on the engine node — this is what let Vue's and
  Solid's own wrapper-retirement commits actually lower those three tags at build time rather than
  just delete the JS wrapper and leave the element uncompiled.

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

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `ICrossTypedIntrinsics<LooseProps, Crossed>`, the one shared shape behind every adapter's
  intrinsic-element type table: every tag gets a loose attribute bag by default except the ones the
  adapter has a real per-tag prop type for, which get that type instead (`Omit` the crossed keys out
  of the loose record, merge the real ones back in). The mechanics were duplicated per adapter before
  this; only the prop types genuinely differ (`children`/`ref` are framework values, so a type like
  `IViewProps` can't be fully shared) — this generic lets an adapter's own table stay a one-line
  instantiation instead of re-deriving the `Omit<Record<...>, keyof Crossed> & Crossed` shape by hand.

- [#72](https://github.com/OneEyed1366/symbiote-native/pull/72) [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `scrollTo`, `scrollToEnd` and `flashScrollIndicators` are now methods on `ISymbioteNode`, beside
  `focus` / `blur` / `measure`.

  A lowered ScrollView hands the app its engine node, with no wrapper to build an imperative handle
  from — so anything the wrapper's handle offered has to be reachable from the node, or the public
  surface silently shrinks the day the primitive stops being a component.

  `buildScrollViewHandle` keeps its signature and now delegates to those methods instead of
  dispatching its own commands. The defaults (`x`/`y` 0, `animated` true) live in one place, so a ref
  and a tag cannot disagree about what `scrollTo()` with no argument means.

- Updated dependencies [[`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f), [`022b9fd`](https://github.com/OneEyed1366/symbiote-native/commit/022b9fdcc39640e6b99ddc9068242d9ac41bbd5f)]:
  - @symbiote-native/engine@0.5.0

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

- [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - The engine-node press behavior joins the Pressability lifecycle contract the five wrappers already
  follow: it supplies the injected `now` the machine needs to time the 130 ms active-duration floor,
  and runs the machine's own teardown on detach.

  A lowered `<Pressable>` therefore holds its pressed look for the same floor a wrapped one does,
  instead of releasing on the touch-up event.

- [#62](https://github.com/OneEyed1366/symbiote-native/pull/62) [`093144d`](https://github.com/OneEyed1366/symbiote-native/commit/093144d13bc3278353388e4b38ec904bf541f881) Thanks [@mustafa0x](https://github.com/mustafa0x)! - Match React Native Pressability's delayed activation, retention-region re-entry, 130 ms plain
  Pressable active-duration floor, Touchable zero-floor override, and timer cleanup on framework
  teardown across all five adapters.
- Updated dependencies [[`fd70625`](https://github.com/OneEyed1366/symbiote-native/commit/fd70625deff7d13c29a8606259a44f30249e040f), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`6e6df80`](https://github.com/OneEyed1366/symbiote-native/commit/6e6df80861f25d146c2b0d7c4837346dc0a86b16)]:
  - @symbiote-native/engine@0.4.0

## 0.5.0

### Minor Changes

- 3acd869: Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
  component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
  companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
  census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
  landing alongside it) build on.

## 0.4.0

### Minor Changes

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

- 388c353: Keep sticky headers correct when a cell is force-rendered. `VirtualizedList` can render a cell
  outside the normal virtualization flow — to satisfy `initialScrollIndex`, or to keep a focused row
  mounted — and the sticky-header reducer treated those cells as if they had arrived through the
  usual windowing path. The tracked header index then disagreed with what was actually mounted, and
  the wrong section header stuck (or none did) until the next ordinary scroll correction.

  The reducer now distinguishes force-rendered cells from windowed ones, and each adapter's
  `VirtualizedList` reports them as such.

## 0.3.0

### Minor Changes

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

## 0.2.6

### Patch Changes

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
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [56ef0d9]
  - @symbiote-native/engine@0.1.7

## 0.2.5

### Patch Changes

- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
  - @symbiote-native/engine@0.1.6

## 0.2.4

### Patch Changes

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

## 0.2.3

### Patch Changes

- 706e52f: Fix `scripts/fix-esm-extensions.mjs` baking a literal `/index.js` extension folder-as-module directory imports (`component-names/`, `share/`, `alert/`, `platform/`, `status-bar/`, `accessibility-info/`, `linking/`, ...) that also carry `index.ios.js`/`index.android.js` siblings. Once the specifier is explicit, Metro's platform-extension layering never runs, so every platform silently resolved to the same (iOS-hardcoded, headless-fallback) file — on Android this surfaced as `Can't find ViewManager 'PullToRefreshView' nor 'RCTPullToRefreshView'` and similar wrong-native-name crashes. The script now detects platform-specific siblings and leaves those specifiers extensionless, matching react-native-builder-bob's own accepted approach for the same tension (Node ESM needs explicit extensions; Metro needs them omitted to layer `.ios`/`.android`/`.native`). Known tradeoff, same as bob: a plain headless Node/ESM import reaching one of these folders directly (bypassing Metro) will fail to resolve — nothing in this repo currently does that.
- Updated dependencies [706e52f]
  - @symbiote-native/engine@0.1.4

## 0.2.2

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.
- Updated dependencies [46a4f27]
  - @symbiote-native/engine@0.1.3

## 0.2.1

### Patch Changes

- c66082c: Fix relative imports missing file extensions in the published `build/` output, which broke every published package for real Node ESM consumers (Vitest, plain `node`, non-Metro bundlers) — `import('@symbiote-native/vue')` failed outright with `ERR_MODULE_NOT_FOUND`. Metro's own resolver is lenient about missing extensions, which is why this went unnoticed until a published package's compiled output was consumed directly through Node's native ESM loader for the first time.

  The fix runs as a post-build step (`scripts/fix-esm-extensions.mjs`, wired into the root `build` script right after `typecheck`) that rewrites relative import specifiers in the already-compiled `build/**/*.js` files. It does not touch `src/*.ts` — Metro's resolver treats an explicit extension as literal (it only layers `.ios`/`.android`/`.native` suffixes on top, unlike `tsc`/Node's `.js`-maps-to-`.ts` resolution), so adding `.js` extensions directly in the TypeScript source breaks Metro's dev-mode resolution of the unbuilt source. Confirmed by reverting an earlier source-level attempt after it broke the local Vue example apps' bundling.

- Updated dependencies [c66082c]
  - @symbiote-native/engine@0.1.2

## 0.2.0

### Minor Changes

- ab42ee8: Add a zero-config host bootstrap (`bootstrapHost` in `@symbiote-native/components`, plus `registerApp` / `createApp` / `bootstrapApplication` per adapter) that wires the native-host seams and AppRegistry in one call, collapsing the manual per-app wiring every canary previously repeated.

## 0.1.1

### Patch Changes

- Update package descriptions to the SymbioteNative brand name.
- Updated dependencies
  - @symbiote-native/engine@0.1.1

## 0.1.0

### Minor Changes

- First public release under the @symbiote-native npm scope.

### Patch Changes

- Updated dependencies
  - @symbiote-native/engine@0.1.0
