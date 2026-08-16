---
'@symbiote-native/css-parser': minor
'@symbiote-native/engine': minor
'@symbiote-native/svelte': patch
'@symbiote-native/vue': patch
---

Make a partial `:global(...)` work inside a larger selector. `:global()` is the escape hatch for
reaching markup a scoped style block does not own, and reaching into part of a descendant chain
(`.card :global(.legacy-widget) span`) is its main use, not an edge case - but only a whole-selector
wrapper was ever unwrapped. Anything else fell through the parser's guards and registered nothing.

The wrapper is now erased wherever it sits, and its payload participates exactly as if written bare,
following Svelte's per-part semantics rather than Vue's. Vue's `pluginScoped` replaces the WHOLE
complex selector with the wrapper's contents, so `.card :global(.reset)` would collapse to a
stylesheet-wide `.reset` and throw the `.card` half away - a scoped rule silently leaking globally,
the opposite of what `<style scoped>` promises. One registry serves every adapter here, so the
conservative reading wins.

New export `globalClassTokensIn`, the token-level twin of the existing key-level
`globalClassNamesIn`: it answers which MARKUP token stays unsuffixed, where the older function
answers which registered key is global. Both the Vue SFC transformer and the Svelte scoped-style
preprocessor consume it, so a token from a `:global()` payload is no longer scope-mangled while the
rest of its selector is correctly scoped.

`globalClassNamesIn` was rewritten to walk the parser's own tokenizer instead of matching text, and
now returns a key only when every token in the selector came from a payload. Without that, a fully
global COMPOUND selector (`:global(.btn.primary)`) would have regressed the moment token exemption
landed: its key would have stayed suffixed while its tokens went exempt, leaving the rule dead. It
also drops a false positive where `.reset { }` beside `.card :global(.reset) { }` unscoped the
file's own rule.

Fixes a latent tokenizer bug found alongside: a descendant chain link collected only its first
class, so `.card .btn.primary` registered as `cardBtn` - a key no element carrying all three classes
resolves to.

The runtime half now meets the build-time one. Both halves of a partial `:global()` were correct on
their own and still could not find each other: the two are suffixed by DIFFERENT rules - the
registered key as a whole (`cardLegacy__<scope>`, because the rule still only applies where the
file's own `.card` does), the markup token not at all (`legacy`, because that is what the escape
hatch means). The engine's compound lookup rebuilds a scoped key by factoring the shared suffix out
of the element's tokens, and it gave up the moment any token had none - which is every partial
`:global()`, and every class handed down from a parent component. It now treats an unscoped token as
contributing its own name and no scope, so the one scope present is still factorable. Two tokens
carrying DIFFERENT suffixes still do not resolve: no rule legitimately spans two components.

That widening is real and deliberate: a fully-scoped `.card.reset` collapses to the same key a
`.card :global(.reset)` does, so an element carrying a foreign `reset` now matches a rule its author
scoped to their own. The key format cannot tell the two apart - separating them needs a registry
indexed by token set, with per-token scope, which is a larger change than this fix. Recorded in
`scoped-conformance.test.ts` beside the behavior it comes with.
