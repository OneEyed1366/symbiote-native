---
"@symbiote-native/cli": patch
---

Fix Svelte scaffolds rendering zero logos on device (every other element — text, counter, buttons — rendered fine). `require('./assets/x.png')`'s numeric-asset-id path had no working precedent anywhere in this project for Svelte — every other Svelte image use, `examples/svelte` included, is a plain `{uri}` object, and exhaustive headless investigation across the JS/prop/CSS pipeline found no discrepancy, pointing at something specific to that untested path in the real Metro bundle. Both the base and `--navigation` Svelte templates now inline each brand image as a `data:` URI (`{ uri: '...' }`), the one shape proven to work — sidestepping `require()`/Metro asset resolution entirely for this screen.
