// Side-effect ONLY. This module exports nothing, on purpose.
//
// A lowered `<symbiote-pressable>` is an element, so the press machine lives on the engine node
// instead of inside a component — and it gets there by `registerPressableBehavior()` having run
// before the first node of that tag is created. The entry imports this file as a bare
// `import './register';`.
//
// WHY IT CANNOT BE A RE-EXPORT, and why this file has no exports to re-export in the first place.
// Metro turns on `inlineRequires` for production only: it moves a `require()` down to the first
// place its binding is USED, and a barrel's `export { X } from './x'` compiles to a lazy getter. A
// module reached only that way never evaluates unless something names X as a VALUE, so its
// registration silently never happens — in RELEASE builds only, invisible to tsc, to vitest, and
// even to grepping the bundle, because the code IS bundled and simply never runs. A bare
// `import './register';` placed NEXT TO a re-export of the same specifier does not help either:
// Babel merges the two into one dependency and the merged one stays lazy. See CLAUDE.md, "Never
// make correctness depend on a module's load-time side effect".
//
// `adapters/vue/src/index.test.ts` pins the barrel against both halves of that.

import { registerPressableBehavior } from '@symbiote-native/components';

registerPressableBehavior();
