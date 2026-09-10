// Side-effect ONLY — this module exports nothing, and that is the whole design.
//
// The host-behavior registry has to know that `pressable` carries a press machine before
// any node of that tag is created, and a registration is exactly the shape Metro's
// `inlineRequires` silently drops in RELEASE builds: it moves a `require` down to the first place
// its binding is used as a VALUE, and a barrel's `export { X } from './x'` compiles to a lazy
// getter. A module nobody names as a value therefore never evaluates — dev is perfect, release has
// no behavior at all.
//
// Two shapes survive that, and only two. Deleting the indirection is unavailable here: the engine
// cannot import from `@symbiote-native/components` because the dependency runs the other way, so
// the registry is forced rather than chosen. That leaves a BARE side-effect import that is never
// re-exported, the pattern `packages/slider/src/{react,vue,svelte,angular}/index.ts` already uses.
// `index.ts` carries `import './register';` and must never carry `export * from './register'`, nor
// sit beside a re-export of this same specifier — Babel merges two imports of one specifier into a
// single dependency and the merged one stays lazy.
import {
  registerActivityIndicatorBehavior,
  registerButtonBehavior,
  registerImageBackgroundBehavior,
  registerImageBehavior,
  registerRefreshControlBehavior,
  registerInputAccessoryViewBehavior,
  registerPressableBehavior,
  registerScrollViewBehavior,
  registerSwitchBehavior,
  registerTextInputBehavior,
  registerTouchableHighlightBehavior,
  registerTouchableNativeFeedbackBehavior,
  registerTouchableOpacityBehavior,
  registerTouchableWithoutFeedbackBehavior,
} from '@symbiote-native/components';

registerPressableBehavior();
// No `-managed` twin and none possible: this tag commits no node, so there is nothing for a second
// spelling to name. It is safe because the wrapper is GONE in this same commit — while five
// wrappers still rendered their own `Pressable` around a feedback view, registering here would have
// put a second press machine on every TouchableNativeFeedback in every app.
registerTouchableNativeFeedbackBehavior();
// The same anchor shape and the same safety condition — its five wrappers are GONE in this commit
// too, so nothing else emits a `Pressable` for a TouchableWithoutFeedback any more.
registerTouchableWithoutFeedbackBehavior();
// The whole subtree is the behavior's: RN's Button takes no children and builds a touchable > view
// > text > raw text itself (Button.js:363-388), so registering while a wrapper still built those
// nodes would have given every Button a second copy of them. Safe because the wrapper is GONE in
// this same commit, which is also what makes the Android swap reachable at last — the tag commits
// THREE nodes and ripples there, where every wrapper committed four and faded
// (`behaviors/button.ts`, KNOWN DIVERGENCES 1).
registerButtonBehavior();

// Two nodes, both the behavior's: RN wraps its native spinner in a centering `<View>`
// (ActivityIndicator.js:112), so the tag is that View and `buildStructure` builds the spinner under
// it. Safe because the wrapper is GONE in this same commit — while five wrappers still painted the
// spinner themselves, registering here would have given every indicator two.
registerActivityIndicatorBehavior();

// Its own tag rather than `pressable`, because one node may hold exactly one press machine and
// this one is a pressable PLUS the opacity fade. `components/touchable-opacity` is a forwarder over
// the tag, so both spellings reach this single implementation.
registerTouchableOpacityBehavior();
// Its own tag too, same reason: one node holds one press machine, and this one is a pressable
// PLUS the underlay show/hide machine. Safe because the wrapper is GONE in this same commit —
// while it still rendered its own `pressable` internally, registering here would have put a
// second press machine on every TouchableHighlight in every app.
registerTouchableHighlightBehavior();
// Only the LOWERED tags carry this — the wrapper renders `text-input-managed` and
// keeps running its own lifecycle. One owner per node; see `component-names/shared.ts`.
registerTextInputBehavior();
// Same reason as TextInput: the wrapper renders `switch-managed` and runs its own
// lastNativeReport/snap-back lifecycle, so the engine's copy attaches only to the bare tag.
registerSwitchBehavior();

// Image owns no runtime — its behavior is a prop FOLD and nothing else, and it is registered on the
// same `image` the wrapper already emits rather than on a `-managed` twin. That is safe
// only because the mapping is idempotent, which `core/components/src/behaviors/image.test.ts`
// asserts rather than assumes; a wrapper-built node simply folds a second time and nothing moves.
registerImageBehavior();

// The controlled-spinner handshake, which only Angular ever had and which it kept in its own
// component until now: mirror the value native last reported, and command it back down when the
// app's `refreshing` disagrees (RefreshControl.js:145-166). Shares the wrapper's tag with no
// `-managed` twin, which is safe because no wrapper runs a second copy of the machine any more.
registerRefreshControlBehavior();

// Same order Image used, and safe for the same kind of reason with one extra step: this tag
// BUILDS a node, so a surviving wrapper would have committed a second background image under it —
// the five wrappers are GONE in this same commit.
registerImageBackgroundBehavior();

// Fold-only, and it shares the wrapper's tag for the same reason Image does: the mapping has no
// aliasing at all, so a wrapper-built node folding a second time moves nothing.
// `core/components/src/behaviors/input-accessory-view.test.ts` asserts that rather than assuming it.
registerInputAccessoryViewBehavior();

// The ENGINE is the single owner of a ScrollView's content node from here: `buildStructure` builds
// `RCTScrollContentView`, `slotProps` carries `contentContainerStyle` onto it, and the claim on
// `refresh-control` places it beside the content view (iOS) or inverts the tree (Android).
//
// It also registers `sticky-header`, which is what replaced this adapter's own per-header
// component — a header is a CHILD carrying the tag, and the behavior derives its collision point
// from the owner's document order instead of an index map.
//
// EXACTLY ONE THING MAY BUILD THAT CONTENT NODE. `components/scroll-view` and
// `components/virtualized-list` both used to; both now emit only the scroll tag, and
// `scroll-view-content-owner.test.ts` is what stops a third owner reappearing — the failure it
// guards is silent, a second `RCTScrollContentView` nested inside the first.
registerScrollViewBehavior();
