---
name: symbiote-new-package-skeleton
description: "Symbiote new-package SCOPE triage — read BEFORE writing any code for 'create/port a new @symbiote-native package for X', and BEFORE reaching for symbiote-expo-native-module or symbiote-third-party-native-view (both assume the scope question is already settled). This repo's default assumption for any component/module is FULL feature-parity across core + all 3 adapters (<adapters_reach_full_feature_parity>, P0) — but a brand-new package has a real, recurring narrower option the default silently skips: a bare-skeleton package.json + README published early purely to reserve the npm name, with zero functional code. Ask which of 3 tiers is wanted — (1) bare-skeleton (reserve-the-name only), (2) core-only (no adapters yet), (3) core + full adapter parity (the repo default) — via grill-me or AskUserQuestion BEFORE implementing; this exact ambiguity has already surfaced twice in one session on the same task. Covers the verified bare-skeleton shape (packages/android is the existing minimal precedent, packages/local-auth is the newest): package.json carries ONLY name/version/description/license/repository/homepage/bugs/author/publishConfig.access — no main/exports/type/dependencies/peerDependencies/scripts pointing at src/ that doesn't exist yet; README.md explicitly states 'Status: skeleton only — not implemented, published early to reserve the npm name', documents the PLANNED api as forward-looking reference only, and links the nearest already-implemented sibling package plus the skill that documents the real mechanics. Also covers what NOT to touch yet at this tier: pnpm-workspace.yaml's catalog (no new native-lib pin until real implementation), examples/* (native wiring is a separate later step), CHANGELOG.md (changesets generates it on the first real version bump, never hand-written), and the pnpm lockfile (a new packages/* folder needs one pnpm install from repo root before a manual npm publish registers it as a workspace member — that step is the user's to trigger, not to run silently). Trigger on 'create a new package', 'port library X into @symbiote-native', 'wrap X for symbiote', 'reserve the npm name', or any request to scaffold packages/<name> before implementation exists."
---

# Symbiote new-package scope triage

Before touching `symbiote-expo-native-module` or `symbiote-third-party-native-view` — both
assume you already know how much to build — resolve one prior question: **how much of this
package should exist after this session?**

## The three tiers

| Tier | What exists after | When it's actually wanted |
|---|---|---|
| **1. Bare-skeleton** | `package.json` + `README.md` only, zero functional code | User wants to reserve the npm scope/name now and publish `0.0.1` by hand, implementation comes later, possibly in a different session/PR |
| **2. Core-only** | `src/core/` ported and working, no adapter entry points | User wants the framework-agnostic logic verified first, adapters deferred |
| **3. Core + full adapter parity** | `src/core` + `src/react` + `src/vue` + `src/angular`, matching `<adapters_reach_full_feature_parity>` | The repo's usual default for a component/module that's actually shipping |

**Do not assume tier 3 by default just because it's the repo-wide convention for components.**
A new *package* (as opposed to a component inside an existing package) has a real reason to
start at tier 1: publishing early to claim the name is a one-way door (someone else can squat
an unclaimed scope/name at any time — see the `npm-oidc-trusted-publishing` skill's own scope-
squatting warnings), while the implementation is not. The cost of asking which tier is wanted
is one `AskUserQuestion` call; the cost of not asking is building the wrong-sized thing — this
has already happened twice in a row on the same task (first an adapter-scope question, then a
full pivot down to tier 1 after the user clarified they wanted "just README and skeleton, not
functional").

**Ask, don't assume**, whenever the request is "create/port a new package for X" and the tier
isn't already stated. Use `grill-me` or a direct `AskUserQuestion` with these three tiers as the
options before writing anything.

## Tier 1 — the verified bare-skeleton shape

Precedents: `packages/android` (pre-existing, native-shim-only package with no `src/` at all)
and `packages/local-auth` (built 2026-07, a planned `expo-local-authentication` port).

**`package.json`** — only the metadata fields, nothing that points at code that doesn't exist:

```json
{
  "name": "@symbiote-native/<pkg>",
  "version": "0.0.1",
  "description": "...",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/OneEyed1366/symbiote-native.git", "directory": "packages/<pkg>" },
  "homepage": "https://github.com/OneEyed1366/symbiote-native/tree/master/packages/<pkg>#readme",
  "bugs": { "url": "https://github.com/OneEyed1366/symbiote-native/issues" },
  "author": "Andrey Prokopenko <psevdoproger@gmail.com>",
  "publishConfig": { "access": "public" }
}
```

Do **not** add, at this tier: `main`/`module`/`types`/`exports` (nothing to point at yet),
`type: "module"`, `dependencies`/`peerDependencies`/`devDependencies`, or a `scripts` block
(`typecheck`, `prepare`, `ng:build`) — any of these either breaks resolution against a
nonexistent path or forces wiring (tsconfig project references, vitest `include`, a root
typecheck pass) that has nothing real to check yet.

**`README.md`** must:

- State the status explicitly, e.g. `**Status: skeleton only.** ... Published early to reserve
  the npm name.` — never let a skeleton package's README read as if it's already functional.
- Document the *planned* API surface as forward-looking reference (function signatures, types,
  enums) — useful documentation even before it's real.
- Point to the nearest already-shipped sibling package as a shape precedent (e.g.
  `packages/sensors` for any future `expo-modules-core` wrapper, `packages/slider` for any
  future `codegenNativeComponent`-view wrapper).
- Point to the skill that documents the real mechanics once implementation starts:
  `symbiote-expo-native-module` (no native view, `expo-modules-core`-based) or
  `symbiote-third-party-native-view` (has a native view via `codegenNativeComponent`).

**What NOT to touch at tier 1** (all of these are legitimate *later* steps, not omissions):

- `pnpm-workspace.yaml`'s `catalog:` — no new `expo-*`/`react-native-*` version pin until real
  implementation lands and an actual dependency needs pinning.
- `examples/*` — native wiring (Podfile, Android Gradle autolinking, `MainApplication.kt`/
  `AppDelegate` bootstrap, Info.plist entries) is its own later step, not part of scaffolding
  the package skeleton.
- `CHANGELOG.md` — never hand-written. Changesets generates it automatically on the package's
  first real version bump.
- The pnpm lockfile — a brand-new `packages/<pkg>` folder needs one `pnpm install` from the repo
  root before the user's manual `npm publish` will see it registered as a real workspace member.
  That install is the user's action to trigger (it mutates a shared lockfile), not something to
  run silently as part of scaffolding.

## References

- `packages/android`, `packages/local-auth` — tier-1 precedents.
- `packages/sensors`, `packages/splash-screen`, `packages/slider` — tier-3 (full parity)
  precedents, each documented by its matching mechanics skill.
- `symbiote-expo-native-module` — mechanics for an `expo-modules-core`-based wrapper, once past
  tier 1.
- `symbiote-third-party-native-view` — mechanics for a `codegenNativeComponent`-view wrapper,
  once past tier 1.
- `npm-oidc-trusted-publishing` — scope/name squatting checks and the manual-publish + trust
  setup the user runs after a tier-1 skeleton is ready.
- `grill-me` — the interview mechanism for resolving the tier question with the user.
