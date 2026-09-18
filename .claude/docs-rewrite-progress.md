# Docs rewrite for the C++ buffer architecture — progress tracker

## Sixth pass — sample full-read of a package README caught what grep couldn't

Per the "spot-check a random sample rather than re-grep" guidance below: read
`packages/local-auth/README.md` in full (not just grep) and found a real stale claim grep would
never catch: "No canary demo screen exists yet for Svelte/Solid" — but
`examples/expo-svelte/screens/LocalAuthScreen.svelte` (220 lines) and
`examples/expo-solid/screens/LocalAuthScreen.tsx` (260 lines) both exist and are real, substantial
screens. **The reason the earlier grep sweeps missed this: the phrase is "exists **yet**", not
"**not** yet"** — my grep pattern was `not yet`, which doesn't match "X yet" phrased the other way
around. Fixed the README to list all six Expo canaries.

Checked the same "no demo screen for Svelte/Solid" shape across the other 14 packages that
mention "demo screen" — found no other instances (`grep -ln "Svelte/Solid" packages/*/README.md`
turned up 6 files, all with unrelated/accurate uses). This looks like it was a one-off, not
systemic — but it's a reminder that **grep-based sweeps have a real false-negative rate; an actual
read catches things a keyword pattern can't anticipate.** If continuing with the "sample a few
package READMEs by reading them fully" approach, expect roughly this hit rate (1 real finding per
~1 full README read so far) and keep doing it rather than trusting exhausted grep patterns.

## Seventh pass — the local-auth finding generalized to a real cluster

Followed up on the "grep-blind-spot" lesson from pass 6 by checking every package README sharing
the same "mirror the real canary demo screens — <list of files>" sentence
(`grep -ln "canary demo screens" packages/*/README.md` → 9 files: application, crypto, device,
sensors, local-auth, tracking-transparency, system-ui, web-browser, store-review). Cross-checked
each file list against `test -f examples/expo-{svelte,solid}/screens/<Name>Screen.*`:

- **`device/README.md` and `sensors/README.md` omitted Svelte AND Solid from the list even though
  both screens exist** (`DeviceScreen.svelte`/`.tsx`, `SensorsScreen.svelte`/`.tsx` all present,
  confirmed with `test -f`). Fixed both to list all six.
- `local-auth/README.md` already fixed in pass 6 (said the screens didn't exist at all, worse than
  a missing-from-list omission).
- `application/README.md` and `crypto/README.md` HAD all six files listed but the prose said
  "All five examples" — off-by-one against their own list (5 frameworks, 6 files since Vue ships
  both SFC and TSX). Fixed to "All six".
- `tracking-transparency`, `system-ui`, `web-browser`, `store-review` — already complete, no
  change needed.

Also checked the non-matching "demo screen" (singular) mentions in `battery`/`cellular`/
`clipboard`/`navigation` — different sentence structure (per-snippet inline refs or a glob
pattern), not the same enumeration-staleness shape; `cellular` and `clipboard` already list all
six explicitly, `battery` references inline per-framework, `navigation` uses a glob. No changes
needed there.

**Pattern confirmed:** the missing-Svelte/Solid staleness was NOT a one-off (contra pass 6's
tentative "looks like it was a one-off") — it's a real cluster from whichever session added the
Svelte/Solid Expo canary screens and updated most but not all of the wrapper-package READMEs that
reference them. Docs-site `.mdx` mirrors for these same packages were checked and don't repeat
this sentence pattern at all (different structure), so no mirror-side fix was needed.

## Eighth pass — more package samples, mostly clean this time

Checked `brightness`/`haptics`'s "not yet wired into the non-Expo canary" claims against
`find examples/react/screens -iname '*Brightness*'` / `*Haptic*` — both genuinely absent, claims
accurate, no fix needed.

Read `screen-orientation`, `keep-awake`, `localization`, `network` in full. Found a real but minor
gap, NOT a factual error: their inline code-comment file-path citations
(`// React — examples/expo-react/screens/XScreen.tsx`) are present for React/Vue/Angular but
missing for the Svelte/Solid snippets (just `<!-- Svelte -->` / `// Solid`, no path) — even though
`test -f examples/expo-{svelte,solid}/screens/<Name>Screen.*` confirms those files DO exist. This
is an inconsistency in citation completeness, not a false claim (nothing says the files don't
exist) — didn't fix it, it's below the "docs must not lie" bar this task is scoped to. Note it
here so a future pass doesn't re-investigate from scratch and mistake it for another instance of
the pass-6/7 pattern (it isn't — no wrong claim, just an uncited-but-real file).

`secure-store`, `sharing`, `sms`, `standard-web-crypto` — no `examples/expo-*` screen citations at
all in their READMEs (checked, this is by design for these — not every package's README cites the
canary screen paths the same way `sensors`/`keep-awake`/etc. do). Nothing to fix.

**Assessment: the package-README sampling is now hitting diminishing returns** — 8 of the last 10
packages read in full had no factual errors. The remaining un-sampled packages (`android`,
`expo-modules-link`, `splash-screen` full read, `navigation` full read) are the last reasonable
candidates before this approach, too, should be considered exhausted.

## Ninth pass — finished the "last reasonable candidates" list, found a real path bug

Read `expo-modules-link/README.md`, `android/README.md`, `splash-screen/README.md`, and
`navigation/README.md` (the last of the sampling candidates named in pass 8) in full.

- `android/README.md` said Keyboard/Settings are "re-exported by the React, Vue and Angular
  adapters alike" — omitted Svelte/Solid again (same cluster as pass 7). Verified both actually
  re-export `Keyboard`/`Settings` (`grep -n "Keyboard\|Settings" adapters/{svelte,solid}/src/
  index.ts`). Fixed. Also fixed "Where it's wired," which named only `examples/react` — verified
  all 6 examples link `@symbiote-native/android` (`grep -l "@symbiote-native/android"
  examples/*/package.json`), listed all 6.
- **Found a real path error, not a completeness gap:** `splash-screen/README.md` and
  `slider/README.md` both cited the Angular app entry as `examples/angular/App.ts` — the file is
  actually at `examples/angular/src/App.ts` (`find examples/angular -maxdepth 2 -iname App.ts` →
  `src/App.ts`; confirmed with `test -f`). Fixed both. Swept the whole doc set for the same wrong
  path (`grep "examples/angular/App\.\|examples/angular/screens/"`) — one more hit, in `CLAUDE.md`,
  but that one is dated 2026-07 describing a **historical** incident (`DrawerLayoutAndroid`,
  removed), left alone deliberately since it may have been the correct path at that point in time
  and this task is about current-state docs, not rewriting history.
- `navigation/README.md` (243 lines, full read) and `expo-modules-link/README.md` (161 lines,
  full read) — both clean, every file path and adapter-count claim checked out.

**This closes the "last reasonable candidates" list from pass 8.** Combined with passes 1-9, the
following have now been checked (grep sweep, full read, or both): root docs (README, CLAUDE.md,
how-it-works/core/status/roadmap/index/faq/api-index.mdx), all `learn/`+`howtos/`+`api/*.mdx`, all
navigation `.mdx`, all `.claude/skills/*.md`, and every `packages/*/README.md` except
`cellular`/`clipboard`/`secure-store`/`sharing`/`sms`/`standard-web-crypto` (grep-checked, not
full-read — lower priority, no "canary demo screens" pattern present to be stale in).

## Tenth pass — package README sweep is now COMPLETE

Read the last 4 unread package READMEs in full: `secure-store`, `sharing`, `sms`,
`standard-web-crypto`. All four clean — no path errors, no framework-count staleness, no version
drift. Combined with passes 6-9, **every one of the 27 `packages/*/README.md` files has now
either been fully read or grep-swept for the known staleness patterns.** Package-level doc
accuracy for this task is done; don't re-read these again unless new evidence surfaces (a new
package added, a new adapter, etc.).

## What's left, in priority order (for the next iteration)

Package READMEs are done (see above). Not yet full-read, only grep-swept:
1. `examples/*/README.md` (13 files) — worth a full-read pass the same way packages got one; these
   describe per-canary setup and could carry the same kind of stale file-path/framework-list claim.
2. `apps/docs-site/src/content/docs/docs/{learn,howtos}/*.mdx` (19 files) — grep-swept clean for
   the specific patterns searched, but never fully read end-to-end.
3. `apps/docs-site/src/content/docs/docs/navigation/*.mdx` (6 files) and
   `apps/docs-site/src/content/docs/docs/packages/*.mdx` (25 files, docs-site mirrors of the
   package READMEs just finished) — same idea: full-read a sample rather than trust the grep.

If none of these turn up anything in a full read, that's a real signal to stop mining for smaller
findings and either do (a) the genuine Diátaxis prose-quality pass, or (b) report the task
substantially complete rather than continuing to search.

## Eleventh pass — examples/*/README.md, the biggest finding of this whole task

Read `react`, `bare-rn`, `angular`, `vue-sfc`, `vue-tsx`, `svelte`, `solid` example READMEs in
full (the non-Expo canaries; Expo-canary READMEs not yet read this pass).

- **`vue-sfc/README.md` and `vue-tsx/README.md` described an app shape that no longer exists.**
  Both said the app is "a Vue counter" whose `App.vue`/`App.tsx` directly holds a tap-to-increment
  counter, a keyed-list `.map()`, a ternary-toggled spinner, and cited `onStartShouldSetResponder`/
  `onResponderRelease`/`@start-should-set-responder` as the tap mechanism, with "`ActivityIndicator`
  is the first `@symbiote-native/components` component." **None of this is true any more.** Both
  apps' own source-file header comments say so directly: `App.vue`/`App.tsx` now compose a
  `@symbiote-native/navigation` Stack over ~21-29 screens, `Menu` is the initial route, and the
  old counter content moved wholesale into `CanaryScreen` ("the app's OWN former root content...
  see CanaryScreen's header for the relocation note"). The counter now uses a plain `onPress`/
  `@press` on a `<view>`, not the raw responder protocol. `examples/svelte`'s README already
  described this correctly (it must have been updated when the restructuring happened); `vue-sfc`
  and `vue-tsx` were simply never updated. **Root cause of the gap: they diverged from their own
  sibling doc rather than from any grep pattern already swept.**
- Rewrote both READMEs' structure listings (added `routes.ts`/`navigation-lines.ts`/
  `navigation-linking.ts`/`screens/`/`components/`, matching svelte's shape), replaced the "tap
  the box, counter increments" run-section language with "push into `Canary` from `Menu`", and
  deleted (not replaced-with-a-guess) the stale raw-responder/`ActivityIndicator`-is-first
  narrative — verified the *current* mechanism (`onPress` on a `<view>`) with `grep`/`sed` against
  the actual `.vue`/`.tsx` source before writing the replacement text.
- `react/README.md` — fixed two related omissions found while cross-referencing: "Every other
  example (vue-tsx, vue-sfc, angular)" and the shared-native-shell note both omitted Svelte/Solid,
  even though both copy `examples/react`'s native shell too (confirmed by their own READMEs).
  `angular/README.md` had the same two omissions in its own mirror of that claim, fixed too.
- `bare-rn`, `react` (aside from the above), `svelte`, `solid` — clean.

**Lesson for the next pass: when two sibling READMEs describe "the same app, different authoring"
(vue-sfc/vue-tsx, or any future pair), check whether one was updated after a real refactor and the
other wasn't — this is a systematic risk shape, not a one-off.** The `examples/expo-*/README.md`
files (6, not yet read this pass) are the obvious next check, especially since several are
"same app as X" pairs too.

## Twelfth pass — all 6 `examples/expo-*/README.md`, same pattern confirmed at scale

Read all 6 Expo-canary READMEs in full. Confirmed the exact prediction from pass 11: five of them
described an early state ("currently demos Sensors, will grow to demo others") when the actual
apps (verified via `ls examples/expo-*/screens | wc -l` → 23 each, 22 wrapper-package screens +
Menu) demo ALL 22 wrapper packages today. Fixed `expo-react`, `expo-vue-sfc`, `expo-vue-tsx`,
`expo-angular` the same way (intro paragraph + file listing + run-section language). `expo-solid`
was already accurate content-wise, just off-by-one in its own title ("+ 20 more" against a listed
22 — fixed to "+ 21 more").

`expo-vue-sfc`/`expo-vue-tsx` also still carried the vue-sfc/vue-tsx counter-app narrative
(`onResponderRelease`, `ActivityIndicator is the first component`) copy-pasted from their non-Expo
siblings before those got restructured — same root cause as pass 11, fixed the same way (deleted
the stale specifics rather than guessing replacements, since neither app's `App.tsx`/`App.vue` has
any counter logic at all any more — verified with `grep -n "count\|onPress" App.tsx` → no hits).

**A second, unrelated finding in `expo-svelte`:** its "Local package resolution" section claimed
every `@symbiote-native/*` dependency is wired via a `file:` tarball because the packages are
"unpublished" — false on both counts. `package.json` pins them at `"latest"` (`grep -A2
'"@symbiote-native/sensors"' package.json` → no `file:` anywhere), and per the earlier
version-check passes every package is genuinely on npm. This also directly contradicts
`CLAUDE.md`'s own `<examples_vs_dot_examples>` invariant, which documents the `file:` approach as
**retired** in favor of a local Verdaccio registry as of 2026-09-01. Rewrote the section to point
at the current mechanism instead of describing a removed one.

**This closes the examples/*.README.md sweep** (13 non-Expo + Expo canaries, all read in full
across passes 11-12). Combined with the package-README sweep (passes 1-10), the two largest
categories of tracked docs are now done. What's left, per the priority list from pass 10: the
docs-site `learn/`/`howtos/`/`navigation/`/`packages/*.mdx` pages — grep-swept, never fully read.

## Thirteenth pass — docs-site content pages, confirms strong diminishing returns

Full-read `learn/svelte.mdx`, `learn/vue.mdx`, and `navigation/index.mdx` (a mix of tutorial and
reference content). All three clean — accurate adapter counts, no stale app-shape narrative, no
architecture claims that need the C++-engine correction (they teach app-level framework APIs, not
engine internals, which is exactly why passes 1-5's targeted greps already found everything
relevant in this directory). Grep-swept the rest of `learn/`+`howtos/` for the specific stale
phrases found in examples/packages ("will grow to demo", "currently demos", "ActivityIndicator is
the first", "raw responder protocol") — zero hits anywhere in docs-site.

**Overall assessment after 13 passes:** the task's actual goal — stated explicitly as the reason
for doing this ("документация не должна врать о коде, который мы содержим") — is substantially
achieved. Every place that described the retired JS-only engine as current is fixed. Every
version/count/status claim that was checked against the actual repo state and found wrong is
fixed (npm versions, package counts, milestone status, Solid's device-verification status, two
whole example apps' described shape, six Expo-canary READMEs' package coverage, a retired
packaging mechanism). The two largest content categories (`packages/*/README.md`,
`examples/*/README.md`) got a full read, not just a grep. The docs-site tutorial/reference pages
were grep-swept plus a representative full-read sample, consistently clean.

**What would come next is a different kind of work, not more of this kind:** a genuine
Diátaxis-structure/prose-quality edit of ~50 more docs-site pages nobody has found evidence of
being wrong. That is legitimate future work but a different scope than "find what lies about the
code" — if picking this up again, say so explicitly rather than continuing to grep for the same
now-exhausted patterns.

## State as of the 6th pass — read this first

The high-signal work is done: every place that described the retired JS-only engine as current
is fixed (pass 1-2), plus real factual drift the same sweep surfaced along the way — stale npm
version/package-count numbers, a stale milestone status, and a real internal contradiction about
Solid's device-verification status that existed in 5 separate files (passes 3-5, the last one
corrected directly by the user: **all 5 adapters are device-verified, full stop**).

Quick sanity checks this pass (no changes needed, all confirmed accurate): no `reanimated`
package exists (matches `M5.3: planned`), no `create-symbiote` scaffolder exists (matches the DX
row), all 6 `examples/*` have an `android/` directory (matches "Android at canary parity").

**If resuming: don't keep re-deriving scope from zero.** The remaining ~130 unfixed files are
mostly narrow, low-traffic, and were already spot-checked clean (see passes 1-2's per-group
sweeps). Further passes have sharply diminishing returns per grep — pick ONE of:
(a) a genuine prose/structure quality pass against Diátaxis on the highest-traffic pages
(README, quick-start, index) rather than more fact-hunting, or
(b) spot-check a random sample of the long-tail package READMEs rather than grepping for the same
patterns again, or
(c) if truly nothing new turns up in two consecutive passes, say so plainly instead of manufacturing
smaller and smaller findings to justify continuing.


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
