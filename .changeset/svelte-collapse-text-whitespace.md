---
"@symbiote-native/svelte": patch
---

Fix a sentence wrapped across source lines inside a `<Text>` rendering with a forced line break
and stray leading spaces on device. Unlike Vue's template compiler, Svelte does not collapse
whitespace inside a text node, so the literal newline and indentation reached the native text
content unchanged. A new build-time preprocessor (`collapseTextWhitespace`, wired into both
`svelte.config.js` and the Metro transformer) now collapses whitespace inside Text nodes the way a
browser or Vue would, and deletes a whitespace-only text node stranded between siblings.
