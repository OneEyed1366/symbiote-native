// Side-effect ONLY. Exports nothing, and must never be re-exported from the barrel.
//
// The fourteen calls live once, in `@symbiote-native/components/register` — they were identical in
// all five adapters, and each copy carried a migration ledger justifying a call against a wrapper
// that no longer exists. What is per-adapter is only the SPELLING of the import below: every
// `*-tag.test.*` here reaches the registry through `import './register';`, and this adapter's own
// barrel guard pins that line.
//
// WHY A SIDE-EFFECT SUBPATH AND NOT A BARREL EXPORT. Metro turns on `inlineRequires` for PRODUCTION
// only: it moves a `require` down to the first place its binding is used as a VALUE, and
// `export { X } from './x'` compiles to a lazy getter. A registration reached that way never
// evaluates in a Release build — invisible to tsc, to vitest, and to grepping the bundle. A bare
// `import` placed NEXT TO a re-export of the same specifier does not help either: Babel merges the
// two into one dependency and the merged dependency stays lazy.
import '@symbiote-native/components/register';
