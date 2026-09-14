// Side-effect ONLY. Exports nothing, and must never be re-exported from any barrel.
//
// The engine's host-behavior registry is what makes a bare `<pressable>` / `<text-input>` /
// `<switch>` carry its machine; an unregistered tag commits inert. Every adapter needs the same
// fourteen calls, so they live here once — an adapter's own `src/register.ts` is a single bare
// `import '@symbiote-native/components/register';`.
//
// WHY A SIDE-EFFECT MODULE AND NOT A BARREL EXPORT. Metro turns on `inlineRequires` for PRODUCTION
// only: it moves a `require` down to the first place its binding is used as a VALUE, and
// `export { X } from './x'` compiles to a lazy getter. A registration reached only through a
// re-export therefore never evaluates in a Release build — invisible to tsc, to vitest, and to
// grepping the bundle. A bare `import` placed NEXT TO a re-export of the same specifier does not
// help either: Babel merges the two into one dependency and the merged dependency stays lazy.
// `register.test.ts` is what stops a later tidy-up from turning this back into an export.
import { registerActivityIndicatorBehavior } from './behaviors/activity-indicator';
import { registerButtonBehavior } from './behaviors/button';
import { registerImageBackgroundBehavior } from './behaviors/image-background';
import { registerImageBehavior } from './behaviors/image';
import { registerInputAccessoryViewBehavior } from './behaviors/input-accessory-view';
import { registerPressableBehavior } from './behaviors/pressable';
import { registerRefreshControlBehavior } from './behaviors/refresh-control';
import { registerScrollViewBehavior } from './behaviors/scroll-view';
import { registerSwitchBehavior } from './behaviors/switch';
import { registerTextInputBehavior } from './behaviors/text-input';
import { registerTouchableHighlightBehavior } from './behaviors/touchable-highlight';
import { registerTouchableNativeFeedbackBehavior } from './behaviors/touchable-native-feedback';
import { registerTouchableOpacityBehavior } from './behaviors/touchable-opacity';
import { registerTouchableWithoutFeedbackBehavior } from './behaviors/touchable-without-feedback';

registerPressableBehavior();
registerTouchableNativeFeedbackBehavior();
registerTouchableWithoutFeedbackBehavior();
// Their own tags rather than `pressable`: one node holds exactly one press machine, and each of
// these is a pressable PLUS a second machine — the opacity fade, the underlay show/hide.
registerTouchableOpacityBehavior();
registerTouchableHighlightBehavior();
// The whole subtree is the behavior's — RN's Button takes no children and builds
// touchable > view > text > raw text itself (Button.js:363-388).
registerButtonBehavior();
// Two nodes, both the behavior's: RN wraps its native spinner in a centering View
// (ActivityIndicator.js:112), so the tag is that View and `buildStructure` builds the spinner.
registerActivityIndicatorBehavior();

registerTextInputBehavior();
registerSwitchBehavior();
registerRefreshControlBehavior();
// Fold-only, both of them: no node of their own, just the prop fold the wrapper used to run.
registerImageBehavior();
registerInputAccessoryViewBehavior();
registerImageBackgroundBehavior();

// The ENGINE is the single owner of a ScrollView's content node: `buildStructure` builds the
// `RCTScrollContentView`, `slotProps` carries `contentContainerStyle` onto it, the claim on a
// `refresh-control` child places it per platform, and the sticky seam is
// `behaviors/scroll-view/sticky.ts`. EXACTLY ONE THING MAY BUILD THAT NODE — a second owner is a
// silent `RCTScrollContentView` inside the first, which each adapter's
// `scroll-view-content-owner` test is what guards.
registerScrollViewBehavior();
