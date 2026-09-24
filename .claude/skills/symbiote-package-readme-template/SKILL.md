---
name: symbiote-package-readme-template
description: "Canonical README.md section order for a tier-3 (core + full adapter parity) @symbiote-native package, mined from ~30 shipped packages' READMEs. Use when writing a new package README, or when a README's structure has drifted from the rest of the repo (missing 'Required one-time step: native autolinking wiring', 'Shape', 'Use it', 'API', or 'Test it' sections; Install section not using the @symbiote-native/cli new/add pattern). Trigger on 'write a README for X', 'the README structure differs', 'fix this package's README', 'README template'. Not for the tier-1 bare-skeleton README (that's symbiote-new-package-skeleton's job — a skeleton package has no Shape/Use it/API/Test it to document yet)."
---

# Symbiote package README template

One structure, ~30 packages. Deviating (skipping a section, inventing a different order, using
plain `npm install` instead of the CLI) reads as unfinished even when the package itself is done —
found 2026-09-25: `font`/`asset` were the only 2 of 39 packages not following it.

## Section order (exact headings, `##` unless noted)

1. `# @symbiote-native/<pkg>` — 1-3 paragraph intro: what it wraps, links to
   `[SymbioteNative](../../README.md)`, which adapters ("every adapter — React, Vue, Svelte,
   Solid, and Angular"), one line on what recipe built it (link a sibling package + the mechanics
   skill, e.g. `symbiote-expo-native-module`).
2. `## Install` — CLI-first, manual as a collapsed fallback:
   ```md
   **New app:**
   \`\`\`bash
   npx @symbiote-native/cli new my-app --<layer-id>
   \`\`\`
   **Existing SymbioteNative app:**
   \`\`\`bash
   npx @symbiote-native/cli add --<layer-id>
   \`\`\`
   Either way: installs `@symbiote-native/<pkg>` and wires the native autolinking automatically —
   see [`@symbiote-native/cli`](../cli).

   <details>
   <summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>
   \`\`\`bash
   npm install @symbiote-native/<pkg>
   \`\`\`
   ...dependency notes...
   ### Required one-time step: native autolinking wiring
   ...
   </details>
   ```
   The `<layer-id>` must be a real `EXPO_PACKAGE_LAYERS` entry in
   `packages/cli/src/expo-package-layers.ts` — adding a package's README to this template without
   registering it there first makes the Install section lie. Registering a dependency-only layer
   needs: the `IExpoPackageLayerName` union entry, an `EXPO_PACKAGE_LAYERS` array entry
   (alphabetical), and `templates/layers/<id>/package.json.fragment.json` (`{"dependencies":
   {"@symbiote-native/<pkg>": "latest"}}`) — `expo-package-layers.test.ts` checks the fragment
   exists and its `dependencies` field matches.
3. `### Required one-time step: native autolinking wiring` (inside the `<details>`, so `###`; `##`
   if the package has no manual-install fallback split) — either a full table (Podfile/
   AppDelegate/settings.gradle/MainApplication.kt touches, see `network`'s README) for the first
   package establishing the pattern, or a one-line pointer to an earlier package's README anchor
   plus the `symbiote-expo-native-module` skill (see `task-manager`'s README) once the pattern is
   established. Package-specific extras (a permission string, an Android manifest attribute, an
   Info.plist key) get their own `###` subsection here.
4. `## Shape` — a fenced tree/table of `src/core/`, then each adapter's own bucket
   (`src/react/hooks/`, `src/vue/composables/`, `src/svelte/runes/`, `src/solid/primitives/`,
   `src/angular/services/`) with the one-line export each carries. Note which adapters are
   `exports`-map aliases straight onto `core` (no lifecycle needed) vs which wrap it.
5. `## Use it` — one fenced code example per adapter that has a lifecycle wrapper (React tsx, Vue
   SFC `<script setup>`, Svelte, Angular `@Component`, Solid tsx) pulled from a real
   `examples/expo-*` screen when one exists, not invented. A pure-function package (no
   hook/composable) gets one shared example instead of five.
6. `## API` — a fenced TS signature block (bare function signatures + one-line return-shape
   comments, not prose), then the exported types this port adds (enums, `I`-prefixed types),
   crediting the upstream source file they were hand-ported from.
7. `## Notes` (or a more specific heading when the content is that shape: `## Platform notes`,
   `## Deliberately not ported`, `## Not ported`, `## Known gaps`, `## Deliberately out of scope`)
   — the caveats a caller needs before shipping: what always throws and why, what upstream branch
   was dropped and the one-line reason, a platform-only behavior.
8. `## Test it` — how the package is actually tested: fake-native-module injection pattern +
   which test files, whether there's a Fabric/Descriptor angle at all, which `examples/expo-*`
   apps carry the native wiring for on-device verification.

## What NOT to do

- Don't invent section names a sibling package doesn't already use — grep 2-3 nearby packages
  first (`grep -n '^#\{1,3\} ' packages/*/README.md`) and match the closest precedent.
- Don't write `## Use it` as a single generic snippet when the package has 5 real adapter
  lifecycle wrappers — one block per adapter is the norm (see `network`'s README).
- Don't leave `## Install` on plain `npm install` once the package is CLI-registerable — that's
  the single most common drift, and it silently implies the package predates the CLI.

## References

- `symbiote-new-package-skeleton` — the tier-1 (bare-skeleton, no Shape/API/Test it yet) README
  shape; this skill only covers tier-3 (shipped, full parity).
- Reference READMEs by shape: `task-manager` (pure-function package, shortest full example),
  `network` (hook/composable package, full 5-adapter `Use it` section),
  `secure-store`/`notifications` (extra native-config subsections under native autolinking wiring).
