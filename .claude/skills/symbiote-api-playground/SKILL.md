---
name: symbiote-api-playground
description: "Symbiote 'API Playground' demo screens — one per example app (examples/react, vue-sfc, vue-tsx, svelte, angular), each exercising that framework's OWN idiomatic API surface (hooks, v-show/v-model, runes, signals, directives, ...) live under Symbiote's custom renderer, reachable from the app's MenuScreen. Read BEFORE adding a new API Playground screen (e.g. for Solid once it has Menu/Stack nav), extending an existing one, updating a .docs/framework-api-surface/*.md checklist, or auditing a demo screen for whether it's genuinely testing the adapter vs faking it. Covers the 4-step process (context7 research, unfiltered checklist → joint triage against real adapter source → build the screen → audit for fakes), the CORE ANTI-PATTERN this whole skill exists to prevent (a build agent under pressure hand-rolling a local reimplementation of a missing framework API instead of surfacing the gap — confirmed real: vue-tsx's ApiPlaygroundScreen.tsx faked withModifiers() before this was caught), the fix boundary (clean adapter/core shim vs honestly-documented gap — never a third option), and the stale-tarball gotcha that makes an adapter fix invisible to example apps until repacked."
---

# Symbiote "API Playground" demo screens

Every framework adapter (`@symbiote-native/react`, `@symbiote-native/vue`, `@symbiote-native/svelte`,
`@symbiote-native/angular`, eventually `@symbiote-native/solid`) claims to let that framework's own
idiomatic API surface — hooks, `v-show`/`v-model`, runes, signals, directives, lifecycle, DI — run
under Symbiote's custom renderer instead of React DOM / RN's own Fabric host config. The "API
Playground" is the standing proof: one demo screen per example app, reachable from that app's
`MenuScreen`, that exercises every applicable API from that framework's own docs live, on-device.

Built 2026-08-17 for react/vue-sfc/vue-tsx/svelte/angular. Solid (`examples/solid`) does not have
one yet — it has no Menu/Stack navigation scaffold at all (still Phase 0/L1), so only the research
checklist (`.docs/framework-api-surface/solid.md`) exists; building its screen is separate future
work, once its nav scaffold lands.

## The 4-step process

1. **Research (unfiltered).** Per framework, use context7 to pull the CURRENT official docs
   (react.dev, vuejs.org, svelte.dev, angular.dev — training data lags, especially for Svelte 5
   runes / Angular signals+new-control-flow) into a checklist at
   `.docs/framework-api-surface/<framework>.md`: every hook/directive/primitive/component the docs
   document, grouped by category, with a doc URL — including web/DOM/SSR-only items, with NO
   in/out-of-scope judgment yet. Vue is ONE checklist shared by both `vue-sfc` and `vue-tsx` (same
   API, different authoring syntax) with an extra "SFC syntax example" column.
2. **Triage (grounded in real adapter source, not guesswork).** Fill each row's blank
   `Applicable in Symbiote` (`Yes` / `Partial` / `No` / `Skip`) and `Notes` columns by actually
   reading `adapters/<fw>/src/**` and the relevant adapter-specific project skills (`vue-adapter-*`,
   `svelte-adapter-dom-shim`, `react-adapter-portal`, `angular-adapter*`) — never by assuming from
   the API's description. Mark `Needs discussion` for genuine judgment calls and resolve them with
   the user before building (a `Needs discussion` list of ~1-6 items per framework is normal — see
   the resolved examples already in each checklist file for the reasoning style expected).
3. **Build.** One new screen per example app — `examples/<app>/screens/ApiPlaygroundScreen.*` —
   with one live, interactive demo per `Yes`/`Partial` row, grouped into sections matching the
   checklist's own `##` categories. A `Partial` row's demo must surface its caveat VISIBLY in the
   UI (a shared `CaveatNote`-style component), not hide it. Register the screen in that app's
   `routes.ts`, `navigation-lines.ts`, root `App.*`, and `MenuScreen.*`, following the exact
   existing row format — don't invent a new navigation convention.
4. **Audit for fakes.** A dedicated pass, AFTER building, before considering the screen done — see
   the anti-pattern section below. This is not optional; it caught a real, already-shipped bug the
   build step itself missed.

## The core anti-pattern — a screen that "passes" without proving anything

**What happened (2026-08-17, confirmed):** while building `examples/vue-tsx/screens/
ApiPlaygroundScreen.tsx`, the build agent found Vue's real `withModifiers()` missing from the
adapter — `@vue/runtime-core` never exported it, and neither did `adapters/vue/src/runtime-
helpers/index.ts`. Instead of fixing the adapter, it wrote a HAND-ROLLED REIMPLEMENTATION of
`withModifiers()`'s guard logic directly inside the example screen, with a comment explaining the
gap. The demo LOOKED like it passed — the button worked, the modifier behavior was correct — but it
proved NOTHING about the adapter: a real Vue developer writing `import { withModifiers } from
'vue'` in their own app would still hit a hard import error. This is the generic failure mode of
this whole task shape ("prove framework API X works here") — under pressure to make a demo
observably work, an agent reaches for a local workaround instead of surfacing that the underlying
capability is missing. Assume it will recur; audit for it every time, in every framework's screen,
not just the one where it was first caught.

**Detection, mechanical:** grep the built screen + its component files for hedge language —
"equivalent", "workaround", "manual", "simulate"/"simulated", "mimics", "hand-rolled" — and for any
locally-defined function whose name/purpose mirrors a real framework API name. For every row marked
`Yes`/`Partial` in the checklist, confirm the demo actually imports the REAL API (directly from the
framework package, or through the adapter's own legitimate wrapper — like `Teleport`'s validating
wrapper, which delegates to the real `Teleport`, that's fine) rather than reimplementing its
behavior in plain screen-level logic.

**The fix boundary — exactly two acceptable outcomes, never a third:**

- **(a) Clean shim → fix it for real, at the adapter/core level.** "Clean" means pure JS/TS logic
  operating on objects the adapter ALREADY exposes (an `ISymbioteEvent`, a component instance,
  props) — NO native/Fabric/engine changes required. Precedent:
  `withModifiers`/`withKeys`/`useCssModule` were added to `adapters/vue/src/runtime-helpers/
  index.ts`, copied faithfully from upstream Vue's own `@vue/runtime-dom` implementation (verified
  by reading the installed `.d.ts`/`.cjs.js` source directly, not assumed), because they only call
  `event.stopPropagation()`/compare `event.target`/`currentTarget`/read `getCurrentInstance()` —
  all already real on Symbiote's own objects. Add a co-located unit test for the fix (see
  `adapters/vue/src/runtime-helpers/runtime-helpers.test.ts`'s `withModifiers`/`withKeys`/
  `useCssModule` `describe` blocks) — writing the test caught a real bug in the first version of
  this exact fix (a missing `\B` in a `hyphenate()` regex turned `"Enter"` into `"-enter"`).
- **(b) Not a clean shim → leave an HONESTLY DOCUMENTED gap in the screen.** If making the API work
  needs real compiler/engine/native work, do not force it and do not fake it — write a visible
  note/comment in the screen explaining what's missing and why, and record the same reasoning in
  the checklist's Notes column. Precedent: `useCssModule()`'s shim function itself is correct (a
  faithful copy reading `instance.type.__cssModules`), but this project's OWN `<style module>` SFC
  compiler (`examples/vue-sfc/metro-vue-transformer.js`, see the `symbiote-sfc-style-compiler`
  skill's "Inline Vue `<style module>`" section) emits a plain `const $style = {...}` binding
  instead of `__cssModules` on the component's options — genuinely unreachable without a COMPILER
  change, a bigger and different fix than an adapter shim. Left honestly documented in both
  `OtherApiDemo.vue`'s header comment and the checklist row, not wired into a fake-passing demo.

Never invent a third option (a screen-level workaround that "looks like" it demos the real thing).
If in doubt whether something counts as a clean shim, the test is: does the fix need to know
anything about Fabric, Yoga, the native host, or `core/engine/src/commit.ts`'s mutation API? If
yes, it's not clean — go with (b).

## The stale-tarball gotcha (fixing an adapter is invisible until repacked)

Example apps outside the pnpm workspace (`examples/*`) consume `@symbiote-native/<fw>` as an
ordinary npm dependency — during active local iteration, via a `file:` tarball, not the live
monorepo source (see CLAUDE.md's `<examples_vs_dot_examples>` invariant for the full mechanism).
**A fix inside `adapters/<fw>/src/**` is invisible to every example app until re-packed and
reinstalled — this bites mid-task, not just at initial example-app setup, and vue-tsc/tsc/eslint
all happily report success against the STALE installed copy with no warning.** After any adapter
change an example app depends on:

```bash
cd adapters/<fw> && pnpm pack --pack-destination /tmp   # reuses the filename, overwrites the old tarball
# then, in EACH consuming example app:
cd examples/<app> && rm -rf node_modules/@symbiote-native/<fw> && rm -f package-lock.json && npm install
# verify the fix actually landed BEFORE trusting typecheck/lint against it:
grep -c "<new export name>" node_modules/@symbiote-native/<fw>/build/**/*.d.ts
```

Deleting only `package-lock.json` OR only `node_modules/@symbiote-native/<fw>` is NOT enough — both
must go, every time, even when re-packing the SAME version twice in a row (see CLAUDE.md's own
"re-packing the SAME package at the SAME version" paragraph for the underlying npm-cache reason).
If a `withModifiers`-shaped fix typechecks clean in the adapter package itself but the EXAMPLE app
still reports "no exported member" — this is almost always why; repack before doubting the fix.

## Where things stand (2026-08-17)

- `.docs/framework-api-surface/{react,vue,svelte,angular}.md` — fully researched + triaged +
  resolved. `solid.md` — research-only (context7, targeted stable 1.9 not the 2.0-preview docs),
  no triage yet (adapter still under active development, nothing stable to triage against).
- All 5 non-Solid example apps have a working `ApiPlaygroundScreen`, audited once for the
  fake-vs-real anti-pattern (clean on React/Svelte/Angular/both-Vue-apps on the second pass; the
  `withModifiers` case above was the only real instance found, on the FIRST pass).
- Known, deliberately-left gaps (honest, not faked): Vue's `useCssModule()` (compiler mismatch,
  above); a handful of `Skip`-marked rows per framework with their own reasoning recorded in each
  checklist (e.g. Angular's `@defer` — questionable value on an app that ships its whole JS bundle
  at install time rather than fetching chunks over a network, `afterNextRender`/`afterEveryRender`/
  `afterRenderEffect` — superseded internally by `whenCommitted`).
- On-device verification (actually running each app on a simulator and clicking through) is
  intentionally NOT part of this skill's scope — that is a manual pass the project owner runs
  themselves; this skill's "done" bar is: every applicable row has a live demo backed by a real
  import, headless typecheck/lint/tests pass, and every gap is honestly disclosed in-screen.
