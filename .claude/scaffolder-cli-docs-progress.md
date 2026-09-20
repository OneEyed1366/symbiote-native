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

## Done, continued
- [x] `core/{engine,components,css-parser,test-utils}/README.md` — checked all four.
      `core/css-parser/README.md`: added one clause (already installed automatically via adapters,
      now says the CLI wires it too). `core/engine`, `core/components`: no `## Install` section at
      all (deep internals, consumed only indirectly through adapters) — skipped, forcing it would
      be noise. `core/test-utils`: skipped — no CLI flag exists (it's a devDependency test harness,
      unrelated to any `add`/`new` layer; don't confuse with the unrelated `--testing` Detox flag).
- [x] `README.md` — fixed a real staleness bug: the milestones table's `DX | @symbiote-native/cli
      scaffolder` row still said `⏳ planned`; now `🔶 beta` (matches the "beta" wording already
      used in this file's own prose).
- [x] `apps/docs-site/src/content/docs/docs/project/roadmap.mdx` — added a milestones-table row for
      the CLI scaffolder + a one-line mention in "Package parity with Expo" (`add --<package>`).
- [x] `apps/docs-site/src/content/docs/docs/howtos/{splash-screen,expo-native-module-setup}.mdx` —
      both document a manual native-wiring dance the CLI's `--splash-screen`/`--<package>` flags
      now automate; added a short note up top saying so before the manual steps. High-value: these
      are exactly the two howtos where the CLI change makes the rest of the page optional.
- [x] **CORRECTION (found on a rigorous per-file re-audit, not just skimming headers):**
      `apps/docs-site/src/content/docs/docs/navigation/index.mdx` had the exact same
      `## Installation` code-fence pattern as the `packages/*.mdx` pages and was MISSED in that
      earlier pass — fixed now, `--navigation` flag mention added. The other 6 navigation pages
      (`drawer`, `faq`, `hooks`, `linking`, `stack`, `tabs`) are genuinely deep-dive feature/API
      pages assuming navigation is already installed — individually opened and confirmed, correctly
      skipped.
- [x] Individually opened and confirmed correct-to-skip: all of `learn/*` (8), the remaining
      `howtos/*` (styling/animations/events/two-way-binding/platform-code/third-party-views/
      debugging/svelte-refs/error-boundaries/solid-reactivity/index), `api/*` (7), `examples/*.mdx`
      (counter/pressable/text-input/index — small copyable snippet pages, not app scaffolding),
      `project/{status,faq}.mdx` (adapter-status and navigation-FAQ content, no scaffolding tie-in),
      `how-it-works.mdx`, `testing.mdx`. None has a natural "getting started" moment. `quick-start.mdx`
      already done, `index.mdx` already links to quick-start.
      **Lesson for next time**: "reviewed the rest" from a header-skim missed navigation/index.mdx's
      Installation block — always grep for `## Install` before declaring a directory fully skipped.
- [x] `benchmarks/component-overhead/README.md`, `scripts/verdaccio/README.md` — checked both:
      internal tooling docs (perf harness usage, local registry setup), no "start a new app" moment.
      Deliberately left alone.

## Remaining
None identified. Every md/mdx file with a genuine CLI-scaffolder tie-in has been updated (see
`git log --oneline` on this branch for the commit-by-commit breakdown). If a NEW file is added
later, or the CLI gains a capability that makes one of the "deliberately left alone" pages above
newly relevant (e.g. Reanimated ships and gets its own howto), extend this list — don't restart
the sweep from scratch.

## Method
Read the file, look for an install/getting-started code block, insert ONE line
(`Scaffolding or extending a SymbioteNative app? npx @symbiote-native/cli new --<flag> (or
add --<flag> in an existing app)...`) — don't rewrite unrelated prose, don't add a mention where it
reads as noise (e.g. deep internals pages). Verify flag names against `expo-package-layers.ts`
before writing, never guess. Delete this file once every row above is checked off or explicitly
marked skip-with-reason.
