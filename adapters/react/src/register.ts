// Side-effect ONLY. Exports nothing, and must never be re-exported from the barrel.
//
// The engine's host-behavior registry is what makes a bare `<pressable>` / `<text-input>` /
// `<switch>` carry its machine, and React had no registration at all until this file — every one of
// those tags committed inert. The registry is reached through a `register*` call, and CLAUDE.md
// records what happens to one of those behind a barrel: Metro turns on `inlineRequires` for
// PRODUCTION only, moving a `require` down to the first place its binding is used as a VALUE, and
// `export { X } from './x'` compiles to a lazy getter. If nothing ever names the module as a value
// it never evaluates and the registration silently never happens — in Release builds alone,
// invisible to tsc, to vitest, and to grepping the bundle.
//
// A bare `import './register';` next to a re-export of the same specifier does NOT help: Babel
// merges the two into one dependency and the merged dependency stays lazy. The shape that works is
// this one — imported ONLY for its side effect, never re-exported — the same shape the other four
// adapters use. `register.test.ts` is what stops a later tidy-up from "fixing" the bare import into
// a re-export.
//
// ScrollView is deliberately ABSENT, and DELETING THE WRAPPER IS NOT WHAT UNBLOCKS IT.
// `registerScrollViewBehavior()` puts a `buildStructure` on `scroll-view` /
// `horizontal-scroll-view` that builds a content node, and TWO owners already build one:
// `components/scroll-view`, and `components/virtualized-list`, which renders that wrapper and is
// staying a component through this migration (its output shape is decided in JS). Registering
// while either stands double-nests the content view — measured: it reddens 8 ScrollView and
// VirtualizedList tests, `contentContainerStyle` landing on the behavior's slot instead of the
// wrapper's node. Per the 2026-09-07 cross-adapter finding, some adapters' lists hand-author
// `scroll-view` + `scroll-content` rather than rendering the wrapper, so an import grep reports
// them clean; React's does not, but the list stack is the blocker on both shapes.
//
// Two folds are owed before the tag can stand alone either way, both in the behavior rather than
// here: `horizontal` (a real C++ ScrollView prop, `BaseScrollViewProps.h:56` — the behavior
// composes only the axis STYLE base, so a bare `horizontal-scroll-view` scrolls vertically on iOS,
// where both tags resolve to RCTScrollView) and `nestedScrollEnabled ?? true` (written only on
// Android's RefreshControl WRAP path, `index.android.ts`, so an unwrapped scroll view loses the
// default RN and the wrapper both apply).
import {
  registerActivityIndicatorBehavior,
  registerButtonBehavior,
  registerImageBackgroundBehavior,
  registerImageBehavior,
  registerRefreshControlBehavior,
  registerInputAccessoryViewBehavior,
  registerPressableBehavior,
  registerSwitchBehavior,
  registerTextInputBehavior,
  registerTouchableNativeFeedbackBehavior,
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
// Only the LOWERED tags carry this — the wrapper renders `text-input-managed` and keeps running its
// own lifecycle. One owner per node; see `component-names/shared.ts`.
registerTextInputBehavior();
// Same reason as TextInput: the wrapper renders `switch-managed` and runs its own
// lastNativeReport/snap-back lifecycle, so the engine's copy attaches only to the bare tag.
registerSwitchBehavior();

// Image owns no runtime — its behavior is a prop FOLD and nothing else, and it is registered on the
// same `image` the wrapper already emits rather than on a `-managed` twin. Safe only because the
// mapping is idempotent, which `core/components/src/behaviors/image.test.ts` asserts rather than
// assumes; a wrapper-built node simply folds a second time and nothing moves.
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
