// Side-effect ONLY. Exports nothing, and must never be re-exported from the barrel.
//
// A lowered `<pressable>`/`<text-input>` is a bare custom element with no
// component behind it, so the press machine and the controlled-input machine have to live on the
// engine node itself — reached by `registerPressableBehavior()`/`registerTextInputBehavior()`
// having run before the first node of that tag is created.
//
// Metro turns on `inlineRequires` for PRODUCTION only, moving a `require()` down to the first place
// its binding is used as a VALUE; a barrel's `export { X } from './x'` compiles to a lazy getter,
// so a module reached only that way never evaluates unless something names it as a value — silent
// in Release builds alone, invisible to tsc, to vitest, and to grepping the bundle (see CLAUDE.md,
// "Never make correctness depend on a module's load-time side effect"). A bare
// `import './register';` placed NEXT TO a re-export of the same specifier does not help either —
// Babel merges the two into one dependency and the merged one stays lazy. This is the shape that
// survives both traps, matching `adapters/{vue,svelte,solid}/src/register.ts` and
// `packages/slider/src/{react,vue,svelte,angular}/index.ts`.
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
// Only the LOWERED tags carry this — the wrapper renders `text-input-managed` /
// `text-input-multiline-managed` and keeps running its own lifecycle. One owner per node;
// see `component-names/shared.ts`.
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
