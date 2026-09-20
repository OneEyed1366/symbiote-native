# CLI-mention doc sweep — progress tracker

Task: every user-facing md/mdx file should mention `@symbiote-native/cli` (the scaffolder in
`packages/cli`) where relevant. Excluded from scope entirely: `CHANGELOG.md` (changesets-generated),
`.changeset/*.md`, `.vendors/`, `wolf-tui/`, `.claude/skills/`, `.notes/`, `.docs/`, `node_modules`.

CLI facts (verified from `packages/cli/README.md` + `packages/cli/src/expo-package-layers.ts`):
- `npx @symbiote-native/cli new <app> --framework <react|vue|angular|solid|svelte>` scaffolds a full app.
- `npx @symbiote-native/cli add --<layer>` extends an existing SymbioteNative app.
- Layer flags: `--navigation`, `--expo-modules`, `--testing`, `--splash-screen`, `--slider` (hand-named)
  + one `--<id>` per `EXPO_PACKAGE_LAYERS` entry (application, battery, brightness, cellular, clipboard,
  crypto, device, haptics, keep-awake, local-auth, localization, network, screen-orientation,
  secure-store, sensors, sharing, sms, standard-web-crypto, store-review, system-ui,
  tracking-transparency, web-browser) — flag id == package dir name in every case.
- `add` does NOT yet wire symbiote into a plain non-symbiote RN app — only extends an existing one.
- GitHub remote is `OneEyed1366/symbiote-native` (verified via `git remote -v` — don't re-guess this).

## Done (this pass, 2026-09-20)
- [x] `packages/{application,battery,brightness,cellular,clipboard,crypto,device,haptics,
      keep-awake,local-auth,localization,navigation,network,screen-orientation,secure-store,
      sensors,sharing,slider,sms,splash-screen,standard-web-crypto,store-review,system-ui,
      tracking-transparency,web-browser,expo-modules-link,android}/README.md` (27 files) — added
      a one-line CLI cross-reference right after the `## Install` / `npm install` code block.
- [x] `apps/docs-site/src/content/docs/docs/quick-start.mdx` — was actively stale (said "instead of
      starting from a published scaffolder"); added a "Scaffold a fresh app" section up top.
- [x] `README.md`, `CLAUDE.md` — already covered pre-existing (verified, no action needed).

## Not yet done — pick up here, in priority order

1. **`apps/docs-site/src/content/docs/docs/packages/*.mdx`** (22 files, one per package above minus
   android/expo-modules-link/navigation/slider/splash-screen which live under docs/navigation or
   elsewhere — verify each). Same bulk pattern as the repo READMEs: find the `## Installation`
   code fence, add one line after it with `npx @symbiote-native/cli new --<id>` / `add --<id>`.
2. **`adapters/{angular,react,solid,svelte,vue}/README.md`** (5) — per-framework adapter npm package
   docs; add a "quick start" pointer near the top: scaffold a whole app with
   `npx @symbiote-native/cli new --framework <fw>` instead of wiring the adapter by hand.
3. **`packages/cli/templates/**/README.md`** (8: `templates/README.md`, `templates/layers/README.md`,
   `templates/native/README.md`, `templates/js/{react,vue-sfc,vue-tsx,solid,svelte,angular}/README.md`)
   — these ARE the CLI's own template docs; check whether they already explain `add` for growing the
   app after scaffold — if not, add a short "add more layers" pointer.
4. **`examples/*/README.md`** (13: angular, bare-rn(**skip** — deliberately zero symbiote deps, see
   root CLAUDE.md `<examples_vs_dot_examples>`), expo-*, react, solid, svelte, vue-sfc, vue-tsx) — add
   a short note that these predate the CLI / are for in-repo development, and a real new app should
   use `npx @symbiote-native/cli new`.
5. **`core/{engine,components,css-parser,test-utils}/README.md`** (4) — lower priority, internal
   packages; only add a mention if there's a natural "getting started" section, don't force it.
6. **`apps/docs-site/src/content/docs/docs/{howtos,learn,navigation,api,examples,project}/*.mdx`**
   (~35 files) + `how-it-works.mdx`, `testing.mdx` — lowest priority, mostly deep-dive/reference
   content where a CLI mention may not fit naturally. Skim each; skip if forcing it would be noise.
7. `benchmarks/component-overhead/README.md`, `scripts/verdaccio/README.md` — internal tooling docs,
   likely skip (not user-facing "getting started" content) unless they document project setup steps.

## Method
Read the file, look for an install/getting-started code block, insert ONE line
(`Scaffolding or extending a SymbioteNative app? npx @symbiote-native/cli new --<flag> (or
add --<flag> in an existing app)...`) — don't rewrite unrelated prose, don't add a mention where it
reads as noise (e.g. deep internals pages). Verify flag names against `expo-package-layers.ts`
before writing, never guess. Delete this file once every row above is checked off or explicitly
marked skip-with-reason.
