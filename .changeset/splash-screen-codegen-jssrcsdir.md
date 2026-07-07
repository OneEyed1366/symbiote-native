---
"@symbiote-native/splash-screen": patch
---

Fix RN codegen failing with `ENOENT: no such file or directory, lstat '.../splash-screen/node_modules/react-native-bootsplash/src/specs'` for any real npm/pnpm install of this package. `codegenConfig.jsSrcsDir` pointed at `node_modules/react-native-bootsplash/src/specs`, assuming react-native-bootsplash is nested inside this package's own `node_modules` — true for a pnpm workspace member (which gets a real nested `node_modules`), but never true for a package installed from the registry (pnpm places its dependencies as siblings in the enclosing store directory, not nested inside it). Fixed by vendoring the spec files into this package's own `codegen-specs/` at `prepare` time (a new `vendor-codegen-specs.cjs` step) and pointing `jsSrcsDir` there instead.
