// Side-effect ONLY — this module exports nothing, and that is the whole design.
//
// The host-behavior registry has to know that `symbiote-pressable` carries a press machine before
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
