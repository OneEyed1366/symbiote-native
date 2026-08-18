---
paths:
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '**/*.smoke.test.ts'
---

# Four ways a harness in this repo makes a test pass for the wrong reason

All four were found in real files here, and all four look identical to a passing test. A green run
proves nothing until you have broken the thing the test guards and watched it fail — that discipline
is the only reliable detector, and each entry below is a case where it caught a test that had been
"passing" for a while.

## 1. A module-scoped install plus a per-test reset

`installDeviceEventHub` registers ONCE per module and keeps an `installed` flag. A `beforeEach` that
does `deviceHub = undefined` therefore does not re-arm anything — it just drops the reference, and
every `deviceEmit` after the FIRST test silently no-ops. Found 2026-08-18 in
`adapters/angular/src/components/keyboard-avoiding-view/keyboard-avoiding-view.test.ts`: the
existing "enabled is false → no inset" test was passing because nothing was ever emitted.

The tell: a suite where only the first emit-driven test could actually fail.

Fix both halves — stop resetting a once-per-module install, and make the emit helper **throw** when
the hub is missing rather than return quietly. A harness that no-ops on a missing precondition
converts every downstream assertion into a tautology.

## 2. Asserting off `fabric.created` after a second commit

A created node's props are frozen at its first `createNode`; a clone-on-write supersedes it. Read
`fabric.committed` whenever the assertion is about state after an update (`symbiote-engine-core` §8).
Reading `created` makes an update test pass forever.

## 3. Finding the node under test by `viewName`

The committed tree carries container nodes of the same view name, so "the first `RCTView`" is
usually not your node. Found this session in
`adapters/solid/src/components/class-resolution.test.tsx`: matching on `viewName` made a `flex`
assertion pass against a wrapper that happens to carry `flex` — a false green that survived a
deliberate break. Match on `testID`.

## 4. A guard whose failure is the RUN, not the assertion

The inverse case, worth recognising so it is not "fixed" away. In
`adapters/solid/src/components/keyboard-avoiding-view.test.tsx`, the test pinning
`readPrefersCrossFadeTransitions` over the raw engine getter has an assertion that passes EITHER
way — the value is `false` in both. What fails on the break is vitest itself:

```
⎯⎯ Unhandled Rejection ⎯⎯
Error: native getter failed
      Tests  1 passed | 21 skipped
     Errors  1 error
```

The leaked rejection is the guard. When a test's real detector is the runner rather than an
`expect`, say so in the test comment, or someone later will add a "missing" assertion and delete the
point.

## 5. A timing THRESHOLD tested behind a helper that burns real time

A constant that gates "how long before X" is invisible to any test that awaits a flush helper first.
The helper sleeps past the threshold, so the assertion reads the same value whether the constant is
0 or 130 — the test guards the behaviour but not the number.

Measured TWICE in one day (2026-08-19), on the same constant, through different helpers:

- `core/components` + Solid: flipping `TOUCHABLE_MIN_PRESS_DURATION_MS` 0 -> 130 failed NOTHING
  across 37 passing tests.
- React, independently: the same flip failed nothing, because every fade assertion sits behind
  `await flushFrames()`, which burns enough real time for a 130 ms floor to expire on its own.

Both were found only by deliberately breaking the constant and watching zero tests fail. The fix in
both cases was a test that fires the whole cycle with NO await in it — press-in and press-out
back to back — so the threshold is the entire difference between a synchronous and a deferred
release.

Generalised: when a value is a DURATION, the test that pins it must be the one that does not wait.
If every test in the file awaits something first, the duration is uncovered no matter how many
tests there are.

## The rule this leaves

**Every new test gets broken once.** Change the thing it guards, run it, read the failure message,
restore. Record the message. A test you could not make fail is either redundant or vacuous — say
which in the report rather than counting it as coverage. Where a break produces the SAME failure as
an existing test, pick a scenario that fails differently (a distinct number, a distinct shape), or
the two tests are one test.
