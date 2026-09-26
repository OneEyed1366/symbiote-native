---
'@symbiote-native/engine': patch
---

`c17d33f1` added `setAssetSourceResolver`/`resolveAssetSource` and wired them into
`bootstrapHost` (`@symbiote-native/components`) with no changeset for `@symbiote-native/engine`
itself. `@symbiote-native/components@3.1.1` published the next day already calling the new
export, but `@symbiote-native/engine` stayed on the already-published `1.3.0` and never
re-shipped - every consumer's `bootstrapHost()` crashes with `TypeError: undefined is not a
function` (`setAssetSourceResolver` resolves to `undefined`). This changeset bumps
`@symbiote-native/engine` so the existing code actually gets published.
