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

## 6. A verification COMMAND that reports a false green — `prettier --check` through the rtk wrapper

Measured 2026-08-20 during the millionjs merge: `prettier --check` run through this environment's
`rtk` shell wrapper printed `All files formatted correctly` in the SAME run that emitted `[warn]`
lines naming dirty files. The wrapper summarizes and the summary contradicts the detail; whichever
is right, the output cannot be trusted as a gate.

This is the same failure class as the five above, one level out: not a test that passes for the
wrong reason, but a CHECK that reports success while its own output says otherwise. The habit that
catches it is the same — read the detail lines, not the summary, and confirm a clean result a
second way (the prettier Node API, or `--list-different`, which prints paths and nothing else)
before believing a formatting gate.

Generalised: when a tool's summary line and its detail lines disagree, believe the details. A
summary is a claim; the details are the measurement.

**And it swallows `console.log` from a vitest run outright.** Found 2026-08-20 while probing Vue's
Teleport: a probe that printed its findings produced NO output through the wrapper, silently — the
run looked like it had done nothing. The workaround that works is to have the probe WRITE ITS
RESULT TO A FILE and read the file afterwards. Worth knowing before concluding a probe found
nothing: the absence of output is not evidence of an absence of behaviour.

**The same wrapper swallows `tsc` too, and there it is worse — there are no detail lines to read.**
Measured 2026-08-20 on `examples/solid`: the wrapped `npx tsc --noEmit` printed
`TypeScript compilation completed` and exited 0, while `rtk proxy npx tsc --noEmit` on the SAME
tree reported `TS7006` and exit 2. Prettier at least contradicted itself out loud; tsc just looks
clean. So a typecheck gate is only believable through **`rtk proxy`** — and by extension any gate
whose whole signal is its exit code.

## The rule this leaves

**Every new test gets broken once.** Change the thing it guards, run it, read the failure message,
restore. Record the message. A test you could not make fail is either redundant or vacuous — say
which in the report rather than counting it as coverage. Where a break produces the SAME failure as
an existing test, pick a scenario that fails differently (a distinct number, a distinct shape), or
the two tests are one test.

## 11. The harness CONSTRUCTS the subject differently from production

The purest form of a false green: every test passes, every one fails correctly when broken, and the
feature cannot fire at all in an app. No assertion is wrong — the SUBJECT is.

Measured 2026-08-23 on the host-behavior seam. A behavior is registered under an intrinsic tag
(`'symbiote-pressable'`) and looked up by `node.component`. But `node.component` is the resolved
FABRIC view name: every adapter runs the tag through `descriptorFor` before calling `createElement`,
so `symbiote-view` arrives as `RCTView`. The tests built their node as
`createElement(PRESSABLE_TAG)` — which passes the tag AS the Fabric name and makes the key match by
accident. Seven tests, six of them break-tested on their own axes and failing correctly, guarding a
registration that could never have fired.

Break-testing does not catch this, and that is the point worth carrying. Breaking the machine
breaks the machine; the harness keeps handing it a subject production never builds, so every axis
stays honest while the whole thing is unreachable. It was found by a peer probing the INSTALLED
artifact, not by any test.

The check is one question, asked of the first line of the test rather than of the assertion:
**does anything in the shipped code construct the subject this way?** Grep the adapters for the
constructor call and compare argument for argument. Where the answer is no, the harness needs a
helper that builds it the production way and a comment saying why — and a second test that pins the
DISTINGUISHING case (here: a plain `createElement('RCTView')` must NOT get the behavior, which is
also what rules out the obvious "just key it by Fabric name" fix).

Related but distinct from §3: there the test FINDS the wrong node in a real tree; here the tree
itself is not one production would ever produce.

## `fabric.find()` returns a PRE-CLONE node — assert on the live tree, never on a search hit

`core/test-utils/src/fake-fabric.ts:177` — `find(predicate)` runs over `created`, the list of every
node the fake slot has ever built. Fabric is clone-on-write, so **any prop update produces a new
node and leaves the old one in that list**. `find` matches the original first and hands it back,
frozen at its pre-update props.

Measured 2026-08-20 while wiring React's `Activity`: `hideInstance` was firing (proved by
instrumenting it), the engine was committing `display: 'none'` correctly, and the assertion read
the stale node and reported the fix as dead. Ten minutes went into the wrong half of the system.

Read the LIVE tree instead — walk `fabric.appRoot().children`, the way `Counter.test.tsx` does via
`fabric.serialize(fabric.appRoot().children)`:

```ts
function byTestId(id: string) {
  const walk = nodes => {
    for (const node of nodes) {
      if (node.props.testID === id) return node.props;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
  };
  return walk(fabric.appRoot().children);
}
```

`find` is still right for a node you only ever read once, before any update touches it.

### And a prop REMOVED on a clone reads as `null`, not `undefined`

Fabric spells "back to the default" as an explicit `null`, so a correctly-cleared prop fails
`toBeUndefined()`. Assert `expect(props.x ?? null).toBeNull()` — or the absence of the value you
care about — not the absence of the key.

## 7. `diff` through the rtk wrapper claims "Files are identical" for files that DIFFER

Same wrapper, same class as §6, but the worst instance yet — comparison is the entire job of this
command. Measured 2026-08-22, verifying an overlay:

```
$ diff core/engine/build/commit.js examples/react/node_modules/@symbiote-native/engine/build/commit.js
[ok] Files are identical
--- diff line count: 22 ---          # the same command, piped through wc -l, in the same shell
```

`diff -q` in the loop right before it had correctly reported all 12 files as different. So the
summary is not merely unreliable, it inverts the answer, and a verification step that trusts it
reports a stale install as fresh.

Use `rtk proxy` for any byte comparison, or do it in code (`difflib` / a hash) and print the
result yourself. Same rule as §6: a summary is a claim, the details are the measurement.

## 8. A scaffolding CLI through the rtk wrapper silently does NOTHING

The §6/§7 family again, and the most expensive shape of it: not a wrong answer, an absent action.
Measured 2026-08-22 while creating `examples/bare-rn` —
`npx @react-native-community/cli@20.1.0 init … --skip-install` run through the plain Bash path
produced no output and **no project**; the command reported no error and left the target directory
empty. The same invocation under `rtk proxy` created the full tree.

So the wrapper's damage is not limited to gates (`prettier`, `tsc`, `diff`, exit codes). It reaches
any command whose real work is a side effect on disk. Run generators, scaffolders and installers
through `rtk proxy`, and verify the artifact exists afterwards rather than trusting a silent exit.

## 9. Two copies of a framework loaded at once — a whole CATEGORY of test goes silently dead

Not a wrong assertion; an entire mechanism unplugged, with every existing test still green.

Measured 2026-08-23. `vitest.config.ts`'s `solid` project ran `solidPlugin()` with no `dev` option,
and vite-plugin-solid RE-ADDS the `development` export condition from its own `config()` hook — so
solid-js resolved to `dist/dev.js` on one path and `dist/solid.js` on another and BOTH were loaded.
A CPU profile of one create showed functions from both files, which is how it was spotted at all.

The consequence is worse than a profiling skew. Signals created in a test file live in one runtime;
the renderer's prop effects live in the other. **They never see each other**, so a signal driving a
prop on an intrinsic element produced NOTHING:

```
repo config (two builds)   clip -> clip -> clip     no update at all
dev: false (one build)     clip -> head -> tail     correct
```

Structural updates (`<Show>`, `<For>`) kept working, because those run inside the test file's own
solid-js — which is exactly why the suite was 644/644 green with prop reactivity entirely dead.

Two things to carry:

- **A test whose subject is a PROP update needs a step that proves the harness is live.** The
  re-seed test in `adapters/solid/src/renderer-text-defaults.test.tsx` asserts a defined -> defined
  change BEFORE the defined -> undefined one it exists for. With reactivity dead, the second
  assertion passes for the wrong reason (nothing updates, so nothing clears); the first one fails
  and names the cause.
- **Suspect duplicate module instances whenever a mechanism is dead rather than wrong.** The tell
  is the profile, not the test output: grep a CPU profile for two build filenames of the same
  package. `NODE_ENV=production` does not fix it — resolution conditions do.

**Vue and React were checked for the same hole and are CLEAN** (2026-08-23) — record the negative
so nobody re-runs it. Vue was the plausible one: the adapter imports `@vue/runtime-core` while app
code and tests import `vue`, and a bundled-vs-separate split there would give two reactivity
systems. It does not; verified in both `NODE_ENV` modes. React uses the single specifier `react`
everywhere, and only the `solid` project carries a plugin that can re-add a condition.

The decisive probe is a CROSS-ENTRY effect, not an identity comparison — identity can match while
a second copy still exists behind a different specifier:

```ts
import { ref as vueRef } from 'vue';
import { effect as coreEffect } from '@vue/runtime-core';
const v = vueRef(1);
const seen: number[] = [];
coreEffect(() => seen.push(v.value));
v.value = 2;
v.value = 3; // one runtime => [1, 2, 3]; two => [1]
```

Run that shape for any framework whose adapter and app code enter through different specifiers,
and read the SEQUENCE — a single-element array is the symptom, and every structural test stays
green beside it.

## 10. A string assertion on GENERATED CODE pins the operator, never the value

A compile-time transform's tests naturally assert on its output text —
`expect(out).toContain('ellipsizeMode: (mode) ?? "tail"')`. That is a real assertion and it does
catch a rewritten operator. What it cannot see is the only thing that ships: what the expression
EVALUATES to, for the values a user actually passes.

The gap is not theoretical. Measured 2026-08-23 across two adapters in one week, the same shape
both times — a lowering transform's Text defaults applied only when the incoming value was
`undefined`. Solid's shipped it: `<Text ellipsizeMode={null}>` yielded `null` on the lowered
intrinsic tag and `'tail'` through the component wrapper, so **lowering itself introduced a
divergence**, invisible to every test and visible only on a device with text long enough to clamp.
Svelte's emitted the right operator by luck of authorship and had no test for `null` or `undefined`
as values at all.

The fix is not more string assertions. **Evaluate the generated expression and hold it against the
authority the transform is reproducing** — here `resolveTextProps` in `core/components`, which the
wrapper path already calls:

```ts
const build = new Function('mode', `return (${bagSourceOf(lower(source))});`);
for (const value of [undefined, null, 'clip', 'head']) {
  expect(build(value).ellipsizeMode).toBe(
    resolveTextProps({ ellipsizeMode: value }).ellipsizeMode,
  );
}
```

Two things make this the right shape rather than just a bigger test: it fails when someone
"simplifies" an operation back into a literal, and it fails when the two encodings of one rule
drift apart at all — which is the whole hazard of having a fold written once at compile time and
once at runtime. Extract the generated sub-expression by BRACE MATCHING, not by regex; a nested
object in any value truncates a regex silently and the test then passes on a fragment.

Generalises to every generator in the repo: a transform, a codegen, a template compiler. Assert the
text to pin the SHAPE, evaluate the output to pin the BEHAVIOUR, and only the second one is what
runs on a device.

## 11. The mirror: a harness that builds the subject wrong produces a false RED, and it is louder

Every entry above is a test passing for the wrong reason. The same defect points the other way too,
and the wrong-way version is more expensive socially: it sends other people to debug code that is
fine.

Measured 2026-08-23, verifying that a `:active` rule reaches the committed node. The probe called
`setNodePressed(node, true)` and read the payload: unchanged, no `opacity`, in every state. Read
literally, the whole tier-2 press mechanism was dead.

It was the probe. `setNodePressed` only DIRTIES the node — a press arrives from a native event,
outside any renderer mutation, so nothing else asks for a commit. The production path pairs it:

```ts
setNodePressed(node, pressed);
requestCommitFor(node); // core/components/src/behaviors/pressable.ts
```

With both, the same probe reads `opacity: 0.6` pressed and `opacity: null` released — `null` being
Fabric's spelling for "back to the default", per the note above.

The rule that generalises, and it is the §10 rule turned around: **before reporting that a
mechanism is dead, check that your harness drives it the way production does.** A missing call in
the harness and a broken mechanism produce the identical observation, and only one of them is worth
anyone's afternoon. Concretely: find the production call site, read the lines AROUND the call you
copied, and copy the whole sequence — the second line of a two-line contract is exactly the kind of
thing a probe drops.

## 12. A cross-adapter probe whose ORACLE encodes one adapter's shape answers about the oracle

Measured 2026-08-23, chasing whether a ref resolves on a lowered element. The probe was
`typeof ref?.measure`, and it is the natural one — on React and Vue a host ref IS the public
instance, so `.measure` sits directly on it. Run against Svelte it reports `undefined`, which reads
as "refs are broken here". They are not:

```
bind:this yields           ShimElement          <- the ref resolved
typeof ref.measure         undefined            <- the oracle's answer
hostInstance(ref)          SymbioteNode
typeof host.measure        function             <- the imperative surface, one hop away
```

Svelte's `bind:this` yields the ELEMENT, so the adapter's documented accessor is
`hostInstance(shim)` (`adapters/svelte/src/host-instance.ts`, which exists for exactly this and says
so). The probe was asking "is this adapter shaped like React", and every adapter that answers no
looks broken.

This sits next to §11 rather than inside it: §11 is a harness that DRIVES the subject wrong, this is
a harness that drives it right and MEASURES it wrong. Both produce a red that is about the test.

The same run showed the complementary trap on the other side. A sibling session probed three arms —
lowered element, plain element, component — and got `null` on all three, then correctly refused to
conclude anything: a result identical across every arm, including the arm that should differ, is a
tautology confirming any hypothesis. **An oracle that cannot distinguish the arms has not run the
experiment** — the same shape as "a bisect arm that moves nothing does not refute"
(`verify-the-deciding-side.md`), one layer up.

### The recipe that makes a probe distinguishing: an OBSERVED control step FIRST

Stating the trap is not enough to avoid it — it caught the same session three times in a row the
next day, chasing whether a press commits. First probe: flat `v0` on every arm, which reads as "the
first press is lost". Second: flat `v7` — and `v7` turned out to be the FIRST commit, not an update,
so nothing had ever been observed to change. Third only worked because it was built as a SEQUENCE
where each step must be seen to move the reading before the next step means anything:

```
mount                 -> v0     the baseline
external update +10   -> v10    CONTROL: if this does not move, nothing below is attributable
the press             -> ?      the actual question
external update +10   -> ?      tells a dead node from a one-tick loss
```

And read TWO layers where the stack has two, or a lost commit is indistinguishable from a write that
never happened: the probe above reports `COMMITTED/ENGINE-NODE` per step, and `v10/v11` — committed
stale, node correct — is what localised the defect to the commit rather than to the adapter's shim.

So: **a control step you WATCHED move, before the arm you are asking about; and one reading per
layer.** A probe without the control is not weaker evidence, it is no evidence.

So for any cross-adapter probe: state the oracle in terms of the CAPABILITY (can app code reach
`measure` from what the framework hands it?), never in terms of one framework's object graph, and
check the arms actually differ before reading the result.

## 13. A swapped ARGUMENT makes a probe answer every question the same way

The cheapest false result in this file, and it produced three wrong conclusions in one session — one of
which was sent to another session before it was caught.

`mount` in the Vue adapter takes the ROOT TAG FIRST: `mount(ROOT_TAG, component)`. Called the other
way round it neither throws nor mounts. A probe built on it then reads an empty tree, and the
readings look like findings:

```
ref surface   component: []   lowered: []        "neither exposes anything"   -> null both sides
text commit   intrinsic: []   component: []      "text never reaches Fabric"  -> nothing mounted
loop repro    renders=0 both                     "lowering is irrelevant"     -> nothing ran
```

Every one of those is a TAUTOLOGY dressed as a comparison: two arms of a bisect that both return the
empty value agree with each other, so the probe confirms whatever it is pointed at. It is §11's
"harness constructs the subject differently" reduced to its cheapest possible form — no wrong
subject, no subject at all.

**The check costs one line and belongs at the TOP of any new probe: assert the KNOWN-GOOD case
first.** A probe that cannot see a plain `<Text>string</Text>` reach `RCTRawText` has not earned the
right to report anything about a lowered one. Concretely — before comparing arms, assert the harness
is live:

```ts
mount(
  ROOT_TAG,
  defineComponent({ setup: () => () => h(Text, null, 'sentinel') }),
);
await tick();
expect(committedTexts(), 'harness is live').toContain('sentinel');
```

And prefer copying the mechanism wholesale from a suite that is already GREEN — for this adapter
`adapters/vue/src/renderer/renderer.test.ts` (`mount(ROOT_TAG, …)`, `tick = setTimeout 0`, walk
`fabric.committed`, never `fabric.find`) — over reconstructing it from the signature. Three of the
three failures above came from reconstructing.

The generalisable rule: **an empty result on BOTH arms is not a finding, it is a broken instrument.**
Treat identical degenerate readings as a harness failure until the sentinel proves otherwise.

## 14. The worst false green ASSERTS the defect — a test that encodes the bug as the contract

Three harness failures landed on 2026-08-24 and they are not equal. Two were "the instrument shows
nothing": a probe that returned `null` on every branch, a probe whose arguments were swapped. Those
are loud once anyone looks, and they die the moment the instrument is fixed.

The third is worse and it was in a real suite, not a probe. `core/components/src/behaviors/pressable.test.ts`
contained:

```
it('routes the app callback through the machine, not straight from the slot', …)
  touchWithoutClaiming(node);          // a bare pressIn, no responder claim
  expect(onPressIn).not.toHaveBeenCalled();
```

That assertion is a faithful description of what the code did, and what the code did was the bug:
the engine bubbles `PRESS_IN` **before** it negotiates the responder, so a bare `pressIn` is the
NORMAL opening of every gesture, and dropping it silently killed the press-in half of every press.
The test did not merely fail to catch that — **it asserted it, so fixing the bug turned the suite
red and the fix looked like the regression.**

Two things follow.

**A test that encodes a defect outlives the defect.** It survives refactors, gets copied into new
suites as precedent, and defends the bug against the next person who tries to remove it. A silent
test is a gap; this is an active obstacle.

**The tell is an assertion of ABSENCE justified by internal state.** "Nothing happens, because the
machine has not been built yet" describes an implementation detail and calls it a contract. Rewrite
such a case around an observable the two hypotheses genuinely disagree on — here, the app callback
and the pressed style have to move TOGETHER, which a callback sitting directly in the listener slot
cannot do. Assert what a user could see, not what the object currently is.

**And what makes that particular replacement strong is not that it is observable — it is that it
couples TWO INDEPENDENT CONSEQUENCES OF ONE CAUSE.** The callback firing and the style changing are
separate effects of the machine being in the path; a single mistake can produce either one alone,
so no single mistake satisfies both. A test that asserts one observable can be satisfied by a wrong
implementation that happens to produce it. A test that asserts two effects which only share a cause
demands the cause. Prefer that shape wherever the mechanism has more than one visible consequence.

**And rank the two harms in the right order: the second is worse.** A test that encodes a defect
does not merely miss it — when someone finally fixes the code, the suite goes red, and the honest
reading of a red suite is "the change broke something". So the next person reverts the FIX. A gap
costs a bug; this costs the repair.

Related and distinct: §11 is the harness CONSTRUCTING the subject wrong, §12 is an oracle in one
framework's shape, §13 is a swapped argument. This one is the assertion itself being wrong in the
direction of the code.
