---
"@symbiote-native/clipboard": minor
---

Add `@symbiote-native/clipboard`, a framework-agnostic wrapper around `expo-clipboard` (built on
`expo-modules-core`, never the `expo` meta-package). Ships `getStringAsync`, `setStringAsync`,
`hasStringAsync`, the iOS-only URL variants (`getUrlAsync`, `setUrlAsync`, `hasUrlAsync`), the
image variants (`getImageAsync`, `setImageAsync`, `hasImageAsync`), and one listener-based
subscription, `addClipboardListener` — a mix between `@symbiote-native/local-auth`'s pure free
functions and `@symbiote-native/sensors`' per-adapter hooks: every stateless function is a plain
re-export shared by all three adapters, while the listener gets its own lifecycle wrapper per
adapter (`useClipboard` for React and Vue, `ClipboardService.connect()` for Angular). Upstream's
native paste-button view (`ClipboardPasteButton`, iOS 16+) is not ported in this pass.
