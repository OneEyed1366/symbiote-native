// Which intrinsic tag each primitive is, what it folds, which of its two Fabric views a prop
// selects. Data only. A `.cjs` (not `src/`) because build-tool consumers like
// `adapters/vue/intrinsic-tags.cjs` run before any TS exists and can't import from `src/`.

// `intrinsicWhen`: BOUNDARY IS IDENTITY not truthiness — only literal `true` picks the
// alternative view. Kept in sync by hand with `host-primitives.d.cts`; this `.cjs` compiles fine
// if they drift, only the one TS consumer's `tsc` catches it.

/**
 * @typedef {{ prop: string, intrinsic: string }} IIntrinsicWhen
 * @typedef {{ intrinsic: string, intrinsicWhen?: IIntrinsicWhen }} IHostPrimitive
 */

// `id` -> `nativeID` aliasing is NOT here: it is `routeProp`'s, for every node rather than only
// a registered one (`core/engine/cpp/tests/js/id-alias-coverage.itest.ts`).

/** @type {Record<string, IHostPrimitive>} */
const HOST_PRIMITIVES = {
  View: {
    intrinsic: 'view',
  },
  // Same `RCTView` as `view` — the tag exists only so the host-behavior registry (keyed by TAG)
  // can find the press machine.
  Pressable: {
    intrinsic: 'pressable',
    // Needed for a render-prop style/child; without it the machine never attaches.
    observesState: true,
  },
  TouchableOpacity: {
    intrinsic: 'touchable-opacity',
  },
  TouchableHighlight: {
    intrinsic: 'touchable-highlight',
  },
  // Axis is a separate native ViewManager, not a runtime flag (`<ScrollView horizontal>` in RN
  // terms) — an app may write either tag spelling.
  ScrollView: {
    intrinsic: 'scroll-view',
    intrinsicWhen: {
      prop: 'horizontal',
      intrinsic: 'horizontal-scroll-view',
    },
  },
  // `multiline` picks between two SEPARATE native views, decided at compile time — a wrong
  // view here is uncorrectable by any later prop write.
  TextInput: {
    intrinsic: 'text-input',
    intrinsicWhen: {
      prop: 'multiline',
      intrinsic: 'text-input-multiline',
    },
  },
  Switch: {
    intrinsic: 'switch',
  },
  // Placement is decided by the owning ScrollView (`claimedChildren`,
  // `behaviors/scroll-view/shared.ts`), not by this primitive — no behavior file needed.
  RefreshControl: {
    intrinsic: 'refresh-control',
  },
  // No `defaults`: RN's Text defaults are `applyTextDefaults` (`core/engine/src/fabric-props.ts`)
  // plus its C++ twin, applied to every `RCTText` regardless of tag.
  Text: {
    intrinsic: 'text',
  },
  // MUST be registered here: unnamed, `adapters/vue/intrinsic-tags.cjs` compiles this hyphenated
  // tag as a component and its children silently render BLANK.
  ImageBackground: {
    intrinsic: 'image-background',
  },
  Image: {
    intrinsic: 'image',
  },
  // Only primitive whose intrinsic resolves to a DIFFERENT Fabric component per platform:
  // `RCTInputAccessoryView` on iOS, plain `RCTView` on Android.
  InputAccessoryView: {
    intrinsic: 'input-accessory-view',
  },
  // No `behaviors/safe-area-view.ts`: its one fold (`resolveAccessibilityProps`) already runs
  // in the engine at `fabricProps` on every commit path.
  SafeAreaView: {
    intrinsic: 'safe-area-view',
  },
  // Commits NO node of its own: the intrinsic resolves to the engine's anchor, and the behavior
  // clones the owner's props onto the single child instead (RN's own shape).
  TouchableNativeFeedback: {
    intrinsic: 'touchable-native-feedback',
  },
  // Same anchor shape as TouchableNativeFeedback, a DIFFERENT clone list — see
  // `behaviors/touchable-without-feedback.ts`'s header rather than assuming TNF's.
  TouchableWithoutFeedback: {
    intrinsic: 'touchable-without-feedback',
  },
  // Owns its whole subtree (View wrapping Text); RN's Button takes no children, only `title`.
  Button: {
    intrinsic: 'button',
  },
  // This tag IS RN's centering wrapper View (ActivityIndicator.js:112); the behavior builds
  // `activity-indicator-spinner` under it.
  ActivityIndicator: {
    intrinsic: 'activity-indicator',
  },
};
module.exports = { HOST_PRIMITIVES };
