---
'@symbiote-native/engine': patch
---

Native `Animated` calls are queued and flushed from one `setImmediate` between `startOperationBatch` and `finishOperationBatch` when RN's `cxxNativeAnimatedEnabled` flag is on, as RN's `NativeAnimatedHelper` does, so the C++ animated module runs them. With `useSharedAnimatedBackend` on, a native-driven view is also connected to its shadow node family, which the shared backend needs to find it. The end callback of a native animation now receives the whole native result, `{ finished, value, offset }`, not just `{ finished }`. An `Animated` component is never flattened (`collapsable: false`), so a view animated only by layout props keeps a native view to bind to.

A re-render that leaves the animated nodes of a component's props unchanged keeps its `AnimatedProps` leaf bound to the native view instead of rebuilding it, as RN's `createAnimatedPropsMemoHook` does, and the leaf takes the new static props. The React `Animated` wrapper keeps one ref callback across renders.

`PanResponder` grant no longer advances the accounted-for move time or the active-touch count when the event carries a touch history, as RN's `onResponderGrant`: an idle second finger now joins the first moved frame, and the first frame's velocity counts from zero.

A `Text` with `onPress`, `onLongPress` or `onStartShouldSetResponder` now runs the press machine as RN's `usePressability` does: the press rect and `pressRetentionOffset`, the responder claim, and the iOS highlight (`isHighlighted`, off with `suppressHighlighting`). The behavior attaches when the first such listener is written, so plain text pays nothing.

`Image` warns about an empty `source.uri`, and on Android throws RN's error when `defaultSource` and `loadingIndicatorSource` are both set.

A nested pressable answers a press alone, as RN's single responder does: the outer one no longer gets `onPress`, `onPressIn` or `onPressOut` for a touch on the inner one, and it still presses when the inner one is disabled. The prop types of `TextInput`, `Text`, `ScrollView` and styles gained the RN props that were missing (logical `margin` / `padding` / `inset`, `outline*`, `boxSizing`, and the native-only props of the three components); Svelte's prop-name list follows.
