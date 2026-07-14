---
"@symbiote-native/engine": patch
"@symbiote-native/components": patch
"@symbiote-native/css-parser": patch
"@symbiote-native/test-utils": patch
"@symbiote-native/react": patch
"@symbiote-native/vue": patch
"@symbiote-native/angular": patch
"@symbiote-native/android": patch
"@symbiote-native/navigation": patch
"@symbiote-native/slider": patch
"@symbiote-native/splash-screen": patch
---

Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
`LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
into a package's tarball at pack/publish time when the package has none of its own — confirmed
against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
`package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
own license check was missing on all eleven packages.
