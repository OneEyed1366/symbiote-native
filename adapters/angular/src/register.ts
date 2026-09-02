// Side-effect ONLY. Exports nothing, and must never be re-exported from the barrel.
//
// A lowered `<symbiote-pressable>`/`<symbiote-text-input>` is a bare custom element with no
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
  registerImageBehavior,
  registerInputAccessoryViewBehavior,
  registerPressableBehavior,
  registerSwitchBehavior,
  registerTextInputBehavior,
} from '@symbiote-native/components';

registerPressableBehavior();
// Only the LOWERED tags carry this — the wrapper renders `symbiote-text-input-managed` /
// `symbiote-text-input-multiline-managed` and keeps running its own lifecycle. One owner per node;
// see `component-names/shared.ts`.
registerTextInputBehavior();
// Same reason as TextInput: the wrapper renders `symbiote-switch-managed` and runs its own
// lastNativeReport/snap-back lifecycle, so the engine's copy attaches only to the bare tag.
registerSwitchBehavior();

// Image owns no runtime — its behavior is a prop FOLD and nothing else, and it is registered on the
// same `symbiote-image` the wrapper already emits rather than on a `-managed` twin. That is safe
// only because the mapping is idempotent, which `core/components/src/behaviors/image.test.ts`
// asserts rather than assumes; a wrapper-built node simply folds a second time and nothing moves.
registerImageBehavior();

// Fold-only, and it shares the wrapper's tag for the same reason Image does: the mapping has no
// aliasing at all, so a wrapper-built node folding a second time moves nothing.
// `core/components/src/behaviors/input-accessory-view.test.ts` asserts that rather than assuming it.
registerInputAccessoryViewBehavior();
