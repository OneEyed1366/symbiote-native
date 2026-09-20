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
- [x] `apps/docs-site/src/content/docs/docs/packages/*.mdx` (25 files: android, application, battery,
      brightness, cellular, clipboard, crypto, device, haptics, keep-awake, local-auth, localization,
      network, screen-orientation, secure-store, sensors, sharing, slider, sms, splash-screen,
      standard-web-crypto, store-review, system-ui, tracking-transparency, web-browser) — same
      one-line pattern after each `## Installation` code fence, GitHub link since docs-site has no
      relative path to `packages/cli`. **Skipped on purpose**: `css-parser.mdx` and `test-utils.mdx`
      — neither has a CLI flag (`--testing` is Detox E2E scaffolding, unrelated to
      `@symbiote-native/test-utils`; verified in `packages/cli/src/add-layers.ts`, don't re-guess this).

## Done, continued
- [x] `adapters/{angular,react,solid,svelte,vue}/README.md` (5) — vue/angular/svelte already had it;
      react was STALE ("There's no @symbiote-native/cli scaffolder yet" — fixed); solid had no
      mention at all — added a pointer at the top of "Wiring an app".

## Skipped, verified
- `packages/cli/templates/**/README.md` (8 files) — checked all: these are maintainer/design docs
  about the CLI's OWN implementation (per-file rationale tables, "Status: new is wired for...",
  fragment derivations). Already extensively about the CLI; a "use the CLI" pointer here would be
  circular noise. Confirmed none of them is copied into a generated app (explicitly excluded, see
  `templates/js/react/README.md`'s own "What was deliberately excluded" section).

## Done, continued
- [x] `examples/*/README.md` (12: angular, react, solid, svelte, vue-sfc, vue-tsx + their expo-*
      siblings) — added a `>` note before each `## Run` heading pointing at the equivalent
      `npx @symbiote-native/cli new --framework <fw> [--<package>]`. `bare-rn` deliberately skipped
      (zero symbiote deps by design, see root CLAUDE.md `<examples_vs_dot_examples>`).

## Not yet done — pick up here, in priority order

1. **`core/{engine,components,css-parser,test-utils}/README.md`** (4) — lower priority, internal
   packages; only add a mention if there's a natural "getting started" section, don't force it.
5. **`apps/docs-site/src/content/docs/docs/{howtos,learn,navigation,api,examples,project}/*.mdx`**
   (~35 files) + `how-it-works.mdx`, `testing.mdx` — lowest priority, mostly deep-dive/reference
   content where a CLI mention may not fit naturally. Skim each; skip if forcing it would be noise.
6. `benchmarks/component-overhead/README.md`, `scripts/verdaccio/README.md` — internal tooling docs,
   likely skip (not user-facing "getting started" content) unless they document project setup steps.

## Method
Read the file, look for an install/getting-started code block, insert ONE line
(`Scaffolding or extending a SymbioteNative app? npx @symbiote-native/cli new --<flag> (or
add --<flag> in an existing app)...`) — don't rewrite unrelated prose, don't add a mention where it
reads as noise (e.g. deep internals pages). Verify flag names against `expo-package-layers.ts`
before writing, never guess. Delete this file once every row above is checked off or explicitly
marked skip-with-reason.
