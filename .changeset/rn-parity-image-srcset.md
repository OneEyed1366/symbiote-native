---
'@symbiote-native/engine': patch
---

`Image` reads a `srcSet` entry the way RN does: entries are cut on a single space, the second token is the scale and any further tokens are ignored. A double space gives an empty scale and skips the entry, and an empty `srcSet` is one source with an empty uri at 1x.
