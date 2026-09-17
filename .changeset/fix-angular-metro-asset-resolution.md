---
"@symbiote-native/angular": patch
---

Fix Metro failing to resolve a bundled asset (`require('./assets/logo.png')`) from an Angular component under the ngc `outDir`: `withSymbioteAngularMetroConfig`'s buildRoot->source redirect only matched style extensions (`.css`/`.scss`/`.sass`/`.less`/`.styl`). Generalized to any relative, non-script (`.ts`/`.tsx`/`.js`/`.jsx`) import with an extension, so images and other bundled assets resolve the same way styles already did.
