---
paths:
  - 'adapters/svelte/src/**/*.test.ts'
  - 'packages/*/src/svelte/**/*.test.ts'
---

# Two suites must never compile to the same `.smoke-compiled-*.mjs` path

No `.svelte`-aware loader is wired into this repo's Vitest, so a Svelte smoke test pre-compiles
its component to a real file next to the source and imports that. Vitest runs test FILES
concurrently. Two suites sharing one output path therefore race to write, read and delete it.

Measured 2026-08-19: `button.smoke.test.ts` compiled Pressable into
`components/pressable/.smoke-compiled-pressable.mjs` — the path `pressable.smoke.test.ts` owns,
`rmSync`s in its own `afterEach`, and mid-run overwrites with a **different** (`disabled`) variant.
Under a loaded full run two pressable cases failed and passed in isolation.

The naming convention that fixes it already existed, applied to one pair and missed on the other:

```
components/flat-list/flat-list.smoke.test.ts:40
  .smoke-compiled-virtualized-list-for-flat-list.mjs   ← -for-<consumer> suffix
```

So: a suite that compiles a component it does not own writes `-for-<consumer>`, in that
component's directory (relative imports inside the compiled output must still resolve).

`join(__dirname, …)` is NOT a collision when the two suites live in different directories —
`switch/` and `text-input/` both spell `.smoke-compiled-bind-parent.mjs` and are fine.

## The misdiagnosis worth remembering

The first fix aimed at TIMING: those tests waited a fixed number of `setTimeout(0)` ticks for
"the framework settled", which genuinely breaks under load, and they were rewritten onto
`waitUntil` / `waitForQuiet` (`core/test-utils/src/wait-for.ts`). That change is worth keeping —
but it was not the cause here, and reporting the flake as closed on the strength of it was wrong.

Both failure modes read identically from the outside: green in isolation, red under a loaded full
run. Distinguishing them is a file-level question, not a test-level one — **before treating a
concurrency flake as timing, check whether the suite shares a mutable artifact with another
file.** Grep the compiled-output names across suites; strip `//` comments first, or a comment that
names the other suite's file reads as a collision.

Verified: three consecutive full runs, 454 files / 3807 tests, zero failures.

Still open: `keyboard-avoiding-view.smoke` was reported failing once under load. Its
`.smoke-compiled-*` paths are not shared with any other suite, so it is NOT this bug — uninvestigated.

## A THROWAWAY PROBE inherits the artifact path along with the header it was copied from

The rule fired again on 2026-09-01, in a session that had cited this file the same hour. Not
carelessness — a property of how probes get written here. Building a probe by copying a test file's
header is the RIGHT move (`test-harness-false-greens.md` §13 says to copy the mechanism from a suite
that is already green), and the header carries `const PROBE_OUT = join(__dirname, '.smoke-compiled-…')`.
So the copy races its own source under a full run, and only under a full run.

What made it expensive is the SHAPE of the failure, not the failure. The probes were arms of a spike
in `dom-shim/`, and the collision reddened `bare-tag-parity.test.ts > children under a tag` — which
reads exactly like "the spike broke child mounting". The file passed in isolation with the spike
installed; deleting the scratch copies turned the full suite green with the spike still in. A
verdict about the change under test was one message away from going out.

So, for any scratch probe copied from a suite: **rename the artifact constants in the same paste**,
`-for-<probe>` per the convention above. And when a spike's full-suite run reddens a file the spike
plausibly touches, check for a scratch copy sharing its artifact BEFORE forming a hypothesis — the
isolation run distinguishes them in one command and costs nothing.

The mechanical guard this wants — a test asserting no two files in the repo write the same
`.smoke-compiled-*` path — does not exist yet, and would not have caught this one either, since the
scratch files were never committed. The cheaper habit is the rename.
