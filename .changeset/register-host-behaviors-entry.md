---
"@symbiote-native/cli": patch
---

Every scaffold committed dead: `require()`'d images never resolved, and any host behavior beyond a plain press (Switch, TextInput, ScrollView, ...) silently did nothing.

`index.js` only imported each adapter's `/bootstrap` and `/jsx-runtime` subpaths. Neither reaches `import './register'`, which lives solely in the adapter's main barrel and registers the engine's host behaviors - so a fresh scaffold never ran it. Fixed by adding a bare `import '@symbiote-native/<adapter>';` to every framework's `index.js`.
