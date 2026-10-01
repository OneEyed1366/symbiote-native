---
'@symbiote-native/angular': minor
---

`bootstrapApplication` accepts a `providers` option for app-level providers such as `provideHttpClient()`. A `FinalizationRegistry` stand-in is installed when Hermes lacks one, which `@angular/core` 22.2 and later needs at module load.
