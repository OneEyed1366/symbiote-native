// Side-effect ONLY. Exports nothing, and must never be re-exported from the barrel.
//
// The engine's host-behavior registry is reached through a `register*` call, and CLAUDE.md records
// what happens to one of those behind a barrel: Metro turns on `inlineRequires` for PRODUCTION
// only, moving a `require` down to the first place its binding is used as a VALUE, and
// `export { X } from './x'` compiles to a lazy getter. If nothing ever names the module as a value,
// it never evaluates and the registration silently never happens — in Release builds alone,
// invisible to tsc, to vitest, and to grepping the bundle.
//
// A bare `import './register';` next to a re-export of the same specifier does NOT help: Babel
// merges the two into one dependency and the merged dependency stays lazy. The shape that works is
// this one — a module imported ONLY for its side effect and never re-exported — the same shape
// `packages/slider/src/{react,vue,svelte,angular}/index.ts` uses. `barrel-side-effect.test.ts` is
// what stops a later tidy-up from "fixing" the bare import into a re-export.
import {
  registerImageBehavior,
  registerInputAccessoryViewBehavior,
  registerPressableBehavior,
  registerSwitchBehavior,
  registerTextInputBehavior,
} from '@symbiote-native/components';

registerPressableBehavior();
// Only the LOWERED tags carry this — the wrapper renders `symbiote-text-input-managed` and
// keeps running its own lifecycle. One owner per node; see `component-names/shared.ts`.
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
