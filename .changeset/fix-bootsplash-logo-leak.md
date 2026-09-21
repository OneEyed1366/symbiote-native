---
"@symbiote-native/cli": patch
---

Every scaffold shipped a stray `bootsplash-logo/` folder at its root, holding all four other frameworks' boot-splash logo assets on top of its own.

`templates/native/bootsplash-logo/<framework>` lived inside `native/`, which `generate.ts` copies wholesale into every app before the framework-specific overlay runs. Moved to `templates/bootsplash-logo/<framework>`, alongside `native/` rather than inside it.
