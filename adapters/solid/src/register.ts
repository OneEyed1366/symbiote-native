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
import { registerPressableBehavior } from '@symbiote-native/components';

registerPressableBehavior();
