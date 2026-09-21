---
"@symbiote-native/cli": patch
---

Fix the published package's entry point naming a file that isn't in the tarball. `files` is `["bundle.js", "templates"]`, but npm force-includes whatever `main` points at regardless of it — and `main` was `src/index.ts`, so 0.0.1 shipped that one source file, orphaned: it imports `./cli.js` and `./commands/*.js`, neither of which is published. `publishConfig` now overrides `main`/`module`/`exports` onto `./bundle.js`, the same shape every other package in the repo uses, which also stops the force-include. The library fields stay in the source manifest because `require-package-fields` applies its full-library tier to any package with a `src/` directory. `npx @symbiote-native/cli` was never affected either way — npx resolves `bin`, not `main`.

`bundle.js` is also built by `prepublish-build` now rather than by hand, and `clean:build` sweeps a stale one. It is gitignored and nothing in the pipeline ran its script, so the published bytes were whatever the last manual build left behind, with nothing able to notice they had drifted from `src/`.

Adds `keywords`, which this was the only publishable package without — so the one package that could not surface in an npm search, while being the first thing the root README tells you to run. The description now leads with what you get, inside the ~120 characters npm's search results actually render, instead of a parenthetical framework list trailing into a reference to the root README's manual steps.
