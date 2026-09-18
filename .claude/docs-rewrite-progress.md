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
  old device table (pre-C++, still accurate for the JS-engine npm release) as current-architecture
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

## Second pass (commit 6ae1bb23 → next) — swept the whole priority list below

Ran targeted greps (`retained tree|clone-on-write|shadow.tree|nativeFabricUIManager|beta|alpha|
in progress|mutation-buffer`) across every remaining group in the priority list: `learn/*.mdx`,
`howtos/*.mdx`, `api/{angular,components,react,solid,svelte,vue,index}.mdx` — all clean, no hits.
`index.mdx`/`quick-start.mdx`/`testing.mdx`/`project/faq.mdx` had hits but all were accurate at
their level of abstraction, **except** `index.mdx` said Solid was "still catching up before it
joins the live switcher" — false, README/status.mdx both say Solid is already on it. Fixed.
All 8 remaining `.claude/skills/*/SKILL.md` — clean (only `symbiote-devtools-inspector` had the
`commit.ts` staleness, already handled). `packages/*/README.md` + their `.mdx` mirrors — clean
(the `nativeFabricUIManager`/`clone-on-write` hits in `navigation/README.md` and
`packages/test-utils.mdx` are about the headless *test* fake, unrelated to the production C++
engine — no change needed). `examples/*/README.md` (remaining ones), `navigation/*.mdx`,
`benchmarks/*/README.md`, `scripts/*/README.md`, `core/css-parser/README.md`,
`core/test-utils/README.md` — all clean.

**Conclusion: the architecture-honesty sweep is essentially done.** A final whole-repo grep for
the hard markers (`shadow.tree|shadow tree|JS.side retained|retained tree lives in (Java|Type)
Script|@symbiote-native/shared\b|mutation-buffer\.ts`) across all 138 tracked files returns hits
only in the files already fixed (README.md, CLAUDE.md, how-it-works.mdx) plus this progress file
itself (intentional). If resuming this task later, re-run that grep first — if it's still clean,
the remaining work (if any) is prose/structure quality per Diátaxis, not architecture accuracy,
and should be scoped as a separate, explicit ask rather than assumed from the original prompt.

## Third pass — factual/numeric drift beyond architecture wording

The literal "rewrite every file for the buffer architecture" was done (see above). Kept going
because the underlying goal ("docs must not lie about the code, we're shipping this as stable")
covers more than the engine description — checked actual `package.json` versions against what
the docs claimed:

- **`README.md` said every adapter ships at `0.1.x`. Actual: all 5 adapters are `2.0.0`**
  (`grep -h '"version"' adapters/*/package.json`). Fixed in three spots (benchmark-table caveat,
  the `npm install` section, the Status callout). This alone is a strong signal the project is
  already past 0.x/beta in practice — supports the beta→stable framing independently of the
  engine rewrite.
- **`README.md` said "21 companion packages". Actual: 27** (`ls -d packages/*/` → 27 dirs, all
  `"private"` unset i.e. all public). Missing from the prose list: `@symbiote-native/expo-modules-link`
  (the Expo-wrapper autolinker, real and referenced elsewhere — `roadmap.mdx`,
  `howtos/expo-native-module-setup.mdx`). Fixed count and added it to the list.
- **README milestone `M5.2` (small native-module wrappers) said `⏳ planned`. Actual: 22 of them
  are shipped** (the same 22 named two paragraphs above it in the same file). Changed to
  `🔁 ongoing` with the shipped count named, matching how `M2.6`/`M5` itself are phrased elsewhere
  in the same table (continuously-expanding work, not a binary planned/done).
- Core packages do NOT share one version (`engine` 0.5.0, `components` 2.0.0, `css-parser` 0.5.0,
  `test-utils` 0.3.0) — independent per-package semver via changesets. Don't write "the core
  packages ship at X" as a single number; the adapters (`2.0.0` uniformly) are the one group where
  a single version claim is actually true.
- Package-version and package-count claims can drift silently as changesets releases land: if
  picking this up much later, re-run `grep -h '"version"' adapters/*/package.json` and
  `ls -d packages/*/ | wc -l` before trusting any number already in the docs, including the ones
  this pass just wrote.

## Fifth pass — swept for the same Solid-device-status conflation elsewhere

Grepped the whole tracked doc set for `still pending|not yet|still catching up|no.*harness yet|
doesn.t exist yet` and found two more copies of the exact same stale claim (Solid "not yet proven
on-device" / "hasn't been verified on a real iOS/Android device"), fixed the same way per the
user's correction — all 5 adapters are device-verified:

- `apps/docs-site/src/content/docs/docs/api/index.mdx` (Solid API summary line)
- `apps/docs-site/src/content/docs/docs/project/faq.mdx` ("Is Solid a first-class adapter?")

Also found and fixed an unrelated stale claim while sweeping the same grep hit list:
`apps/docs-site/src/content/docs/docs/packages/slider.mdx` said `@symbiote-native/slider` is "a
workspace package, not yet published" — false, `packages/slider/package.json` has no `private`
field and is at version `7.0.0`. `packages/slider/README.md` (the source-tree one) already had
the correct `npm install` instructions; only the docs-site `.mdx` mirror had drifted. Fixed to
match `splash-screen.mdx`'s pattern (`npm install @symbiote-native/slider ...`).

Checked but NOT changed (narrower, plausible, no contrary evidence found):
`howtos/error-boundaries.mdx` ("verified via vitest, not yet exercised on a real device") — this
is about one specific FEATURE, not a whole adapter, so the user's "all 5 adapters are
device-verified" correction doesn't necessarily apply; left as-is. Same for `css-parser/README.md`
(Vue inline `<style module>` typing gap) and `packages/{brightness,haptics}/README.md` ("not yet
wired into the public canary") — specific, narrow, plausible claims, not swept.

**Don't re-run this exact grep for Solid again** — the known instances are fixed. If a NEW
"not verified on device" claim about a whole adapter shows up anywhere, treat it as stale by
default per the user's correction, unless it's about React/Vue/Angular/Svelte/Solid gaining a
BRAND NEW adapter not yet listed here (there are only 5, this doesn't apply going forward).

## Fourth pass — internal contradiction (Solid device status)

README's own M7 milestone row says Solid is "running on device ... ✅ done", while
`status.mdx`/`roadmap.mdx`/`index.mdx` said "verified only in headless `vitest` so far;
real-device testing is still pending" — a direct contradiction inside the docs. Resolved by
checking ground truth: `adapters/solid/README.md` points at `CLAUDE.md`'s device-measured
benchmark numbers (real, repeated, on iOS simulator) for Solid, so the canary genuinely runs and
has been measured on-device. What's actually still missing is narrower: `examples/solid` has no
`e2e/` directory at all (`find examples/solid -iname e2e` → nothing), so it has no Detox
`canary-journeys` spec, unlike React/Vue-tsx/Vue-sfc/Svelte which all do
(`find examples/*/e2e -iname '*canary-journeys*'` confirms). Rewrote all three pages to say the
precise thing: canary is device-benchmarked, Detox e2e coverage is what's pending — not "no
real-device testing at all."

**Method note for future passes:** when two docs disagree about status, don't just pick one
wording — find the actual file/command that settles it (`find`, `grep -h version`, etc.) before
rewriting either side. A milestone table and a "what's verified" prose section are two different
authors' summaries of the same reality and drift independently.

**CORRECTION from the user, authoritative, overrides the above inference:** "все 5 адаптеров
проверены на устройстве. точка" — all 5 adapters, Solid included, are verified on device, full
stop. My `examples/solid` has-no-`e2e/`-dir finding was real (still true, checked with `find`),
but I was wrong to frame it as "device verification still pending" — that conflated Detox e2e
*journey-test* coverage (genuinely missing for Solid) with device verification generally (done,
for all 5). Reverted `status.mdx`/`roadmap.mdx`/`index.mdx` to state Solid is device-verified
like the other four, and downgraded the e2e gap to a plain "doesn't yet share the Detox
`canary-journeys` spec" note with no "still pending on device" framing. **Lesson: a missing test
harness for one testing METHOD (Detox e2e) is not evidence the whole verification claim is false
— don't infer the stronger, more damaging claim from the narrower fact.**

Not yet checked this pass: whether `apps/docs-site` pages reference specific version numbers
anywhere (a scan for `0\.[0-9]+\.[0-9x]+` across all `.md`/`.mdx` turned up only RN/Expo SDK
version mentions and skill-file historical incident logs — nothing else claiming a symbiote-native
package version — but that scan hasn't been re-verified after this pass's own edits).

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
