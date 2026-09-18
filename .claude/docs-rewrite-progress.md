# Docs rewrite for the C++ buffer architecture — progress tracker

Task: every tracked `.md`/`.mdx` file in this repo must describe the current architecture
(retained tree + platform-parity rules now in C++, `core/engine/cpp/SymbioteTree.cpp` +
`SymbioteFabricProps.cpp`, JS side reduced to a command buffer) accurately — this branch is
shipping as the stable release, so the docs can no longer describe the old JS-only engine as
current. No agents; do this by hand, iteration by iteration.

Research already done (don't redo it):
- Diátaxis is the current industry-standard structure for docs (tutorials / how-to / reference /
  explanation). `apps/docs-site/src/content/docs/docs/` is already shaped this way (`learn/` =
  tutorials, `howtos/` = how-to, `api/` = reference, `how-it-works.mdx` + `project/` =
  explanation) — keep that structure, fix content accuracy, don't restructure.
- Scope is `git ls-files '*.md' '*.mdx'` (138 files after excluding `CHANGELOG.md` and
  `.changeset/*.md`, which are auto-generated/ephemeral release notes — out of scope, do not
  hand-edit them). `.docs/*.md` seen in some sessions is untracked scratch, not part of the repo
  — ignore it. Full list was dumped once to `.claude/tmp-docs-rewrite/all-md-files.txt`
  (gitignored scratch, regenerate with the ls-files command above if missing).
- Ground truth for what changed: this file's own reasoning traced `core/engine/cpp/` (`Symbiote-
  Tree.{h,cpp}`, `SymbioteFabricProps.{h,cpp}`, `SymbioteEngineBindings.{h,cpp}`, `SymbioteDebug.
  {h,cpp}`) exists and is real; `core/engine/src/commit.ts` (the old JS clone-on-write file) is
  GONE — `measureInWindow`/`disposeRoot` now live in `core/engine/src/imperative.ts`. If a doc or
  skill cites `commit.ts`, that citation is stale.
- No fresh on-device benchmark exists for the C++ engine yet — only headless (JavaScriptCore, not
  Hermes) numbers do. Never present the headless table as a device table, and never present the
  old device table (pre-C++, still accurate for the `0.1.x` npm release) as current-architecture
  performance without saying which engine it measured.

## Done this pass (commit e9ed6990 base, on `feature/69-removing-shadow-tree`)

- `README.md` — badge Beta→Stable, "How It Works" diagram + details (JS buffer → SymbioteTree
  C++ → Fabric UIManager, tag-keyed platform rules explained), benchmark section (old device
  table relabeled as "last full on-device measurement, JS engine"; headless C++ table promoted
  to current-but-provisional with an explicit "no fresh device run yet" caveat), Status callout,
  FAQ, Repository Layout, Design Decisions.
- `core/engine/README.md` — opening paragraph (C++ tree, JS is a command-buffer shim), "What it
  does NOT do" (JS doesn't call Fabric directly anymore, C++ does), Test it section (added
  `test:cpp` / `test:itest` / `bench:itest` / `test:android`, noted itest≠timing-safe vs
  bench:itest).
- `CLAUDE.md` — fixed the top-of-file architecture ASCII diagram (was still showing "retained
  shadow-tree" living in `@symbiote-native/engine` as one JS box; now shows the JS buffer / C++
  SymbioteTree split). The rest of CLAUDE.md's body already documents the C++ migration in depth
  (it was written live during that work) — only the diagram summary was stale.
- `apps/docs-site/src/content/docs/docs/how-it-works.mdx` — pipeline diagram + "Why the engine
  exists" section, same fix as the root README.
- `apps/docs-site/src/content/docs/docs/api/core.mdx` — engine pipeline txt block + one
  paragraph noting the JS/C++ split.
- `apps/docs-site/src/content/docs/docs/project/roadmap.mdx` — Engine row was "In progress" with
  no detail; now names the C++ rewrite and links to the README's numbers. Added an "Engine
  rewrite" section with the honest perf tradeoff (create/append regressed, update-shaped ops
  improved, device numbers pending).
- `apps/docs-site/src/content/docs/docs/project/status.mdx` — engine core-status bullet updated
  same way.
- `.claude/skills/symbiote-devtools-inspector/SKILL.md` — one stale claim fixed (clone-on-write
  diffing is centralized in `SymbioteTree` C++ now, not `commit.ts`, which no longer exists).
  NOT fully swept: this file still cites `core/engine/src/commit.ts:550` twice and
  `core/engine/src/node.ts:38` once — both are stale line/file refs (real content moved to
  `imperative.ts`; `node.ts` still exists but `ISymbioteNode` is no longer at line 38). Low
  priority (design doc for unimplemented work, not user-facing), left for a later pass — don't
  redo the investigation, just fix the two `commit.ts` refs → `imperative.ts` and re-locate the
  `node.ts` line number if picking this up again.

Verified NOT stale (checked, no change needed — don't re-check unless code moves again):
- `adapters/{react,vue,angular,svelte,solid}/README.md` — all say "the engine does the
  clone-on-write commit," which is still true at their level of abstraction (they don't claim
  which language). Fine as-is.
- `core/components/README.md`, `core/test-utils/README.md` — same, abstraction level is fine.
- `examples/{react,expo-react,expo-solid}/README.md` — "`nativeFabricUIManager` is driven
  directly, RN's own renderer never runs" is a contrast with React's *own* renderer, not a claim
  about which language calls Fabric. Fine as-is.
- `packages/sensors/README.md`, `packages/secure-store/README.md` and their `.mdx` twins —
  "beta"/"alpha" hits were false positives (`rotation.beta` sensor axis, "Alphanumerics"), not
  project-status claims.

## Not yet checked (the bulk of the 138 — pick up here)

Priority order for the next iteration:

1. **`apps/docs-site/src/content/docs/docs/learn/*.mdx`** (7 files: angular, animations, events,
   react, solid, styling, svelte, vue) and **`howtos/*.mdx`** (12 files) — framework tutorials,
   check for stale perf claims or architecture asides, otherwise likely fine (they teach app-level
   APIs, not engine internals).
2. **`apps/docs-site/src/content/docs/docs/api/{angular,components,react,solid,svelte,vue}.mdx`**
   — per-adapter reference pages, check each for an engine-pipeline description like `core.mdx`
   had.
3. **`apps/docs-site/src/content/docs/docs/{index,quick-start,testing}.mdx`** and
   **`examples/index.mdx`**, **`project/faq.mdx`** — landing/overview pages, check for
   Beta-status language or old pipeline diagrams.
4. **`.claude/skills/*/SKILL.md`** (remaining 8) — check each for stale file/line citations into
   `core/engine/src/` the way `symbiote-devtools-inspector` had; only fix genuine staleness, don't
   rewrite for style.
5. **`packages/*/README.md`** (25) and **`apps/docs-site/.../packages/*.mdx`** (25 mirrors) —
   Expo-module wrapper docs, almost certainly architecture-agnostic (device/sensor APIs), spot-
   check a handful rather than reading all 50 in full; only rewrite if a file actually references
   the engine/tree.
6. **`examples/*/README.md`** (remaining ~11), **`benchmarks/component-overhead/README.md`**,
   **`scripts/verdaccio/README.md`**, **`core/css-parser/README.md`**, **`core/test-utils/README.md`**
   (already spot-checked, low risk).
7. **`apps/docs-site/src/content/docs/docs/navigation/*.mdx`** (6) — navigation package docs,
   unlikely to reference tree internals; spot-check.

When resuming: re-run `git ls-files '*.md' '*.mdx' | grep -v -E '(CHANGELOG\.md$|^\.changeset/)'`
to get the 138, diff mentally against "Done this pass" above, and continue down the priority list
rather than re-deriving it. Grep sweep that found the real hits so far (repeat if new files are
suspected to have drifted since):

```
grep -rlnE "shadow.tree|shadow-tree|JS.side retained|JS retained tree|mutation-buffer\.ts|@symbiote-native/shared\b" --include="*.md" --include="*.mdx" .
grep -rln -i "beta\|alpha" --include="*.md" --include="*.mdx" .   # then eyeball for false positives
grep -rln "retained tree\|clone-on-write\|nativeFabricUIManager" <dir>/*.md   # per-directory sweep
```
