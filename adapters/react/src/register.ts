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
// this one is a pressable PLUS the opacity fade. RN builds ONE `Animated.View` here
// (TouchableOpacity.js:302), so the wrapper's second node was ours; both the machine and the fade
// live on the engine node now. Safe because the wrapper is GONE in this same commit.
registerTouchableOpacityBehavior();
// Its own tag too, same reason: one node holds one press machine, and this one is a pressable
// PLUS the underlay show/hide machine. Safe for the same reason — the wrapper is GONE here.
registerTouchableHighlightBehavior();
// The whole TextInput lifecycle — the acknowledged event count, the `setTextAndSelection`
// controlled write, the focus/blur mirror, mount `autoFocus`. Its wrapper is GONE in this same
// commit, so the `text-input-managed` twin that kept the two machines apart is dead on this
// adapter: nothing here emits it, and there is only one owner left to be.
registerTextInputBehavior();
// Same shape as TextInput: the wrapper ran its own lastNativeReport/snap-back lifecycle and
// rendered `switch-managed` to stay out of the way. It is GONE too, so the bare tag is the only
// spelling and the twin is unreachable from here.
registerSwitchBehavior();

// Image owns no runtime — its behavior is a prop FOLD and nothing else. The wrapper shared this
// tag and is GONE; what is left under the name `Image` is the STATICS namespace (`modules/image`),
// which builds no node at all.
registerImageBehavior();

// The controlled-spinner handshake: mirror the value native last reported, and command it back
// down when the app's `refreshing` disagrees (RefreshControl.js:145-166). Shares the wrapper's tag
// with no `-managed` twin, which is safe because that wrapper is GONE too.
registerRefreshControlBehavior();

// Same order Image used, and safe for the same kind of reason with one extra step: this tag
// BUILDS a node, so a surviving wrapper would have committed a second background image under it —
// the five wrappers are GONE in this same commit.
registerImageBackgroundBehavior();

// Fold-only, like Image, and its wrapper is GONE — the host-node assembly the wrapper used to run
// is exactly what this behavior does on the tag.
registerInputAccessoryViewBehavior();

// The ENGINE is the single owner of a ScrollView's content node from here: `buildStructure` builds
// the `RCTScrollContentView`, `slotProps` carries `contentContainerStyle` onto it, the claim on a
// `refresh-control` child places it per platform (a sibling on iOS, an inverting wrap on Android),
// and the sticky seam is `behaviors/scroll-view/sticky.ts`.
//
// EXACTLY ONE THING MAY BUILD THAT CONTENT NODE. `components/scroll-view` and
// `components/virtualized-list` both used to; both now emit only the scroll tag, and
// `components/scroll-view/scroll-view-content-owner.test.tsx` is what stops a third owner
// reappearing — the failure it guards is silent, a second `RCTScrollContentView` inside the first.
registerScrollViewBehavior();
