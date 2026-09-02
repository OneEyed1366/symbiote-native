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

## 15. A `.gitignore` entry that hides a suite's side effect, instead of removing it

Not a false green in the assertions — a false green in the REPOSITORY, and the fix made it worse.

Measured 2026-08-30. Three committed census probes each called
`writeFileSync('census-<adapter>.txt', …)` with a RELATIVE path, so every full-suite run from the
repo root dropped a file there (and into an arbitrary directory from any other CWD). The files were
noticed, and the response was a commit adding `census-*.txt` to `.gitignore`.

That is the wrong repair, and it is worse than none: the write still happens, but now `git status`
is clean, so the one signal anyone actually checks says nothing is wrong. A visible mess gets fixed
by whoever trips on it next; an ignored one is permanent.

The shape to fix instead — the tool survives, the side effect becomes opt-in:

```js
const outPath = process.env.SYMBIOTE_CENSUS_OUT;
console.log(line); // always
if (outPath !== undefined) writeFileSync(outPath, line); // only when asked
```

Verify BOTH directions, because only checking one is how the original slipped through: run the full
suite and confirm nothing appears, then run with the variable set and confirm the file does. A probe
that quietly stopped writing is the same defect pointing the other way.

Two things generalise beyond this instance:

- **A relative path in a test resolves against the CWD, not the test file.** Anything a test must
  write goes under `__dirname` (a package's own `build/` is fine — one of the four probes did this
  and was correct) or a caller-supplied absolute path. The three that were wrong and the one that
  was right sat side by side.
- **When the reflex is to add an ignore rule, ask what is producing the file.** Ignoring is right
  for an artifact a tool must produce (`build/`, `node_modules/`); it is a cover-up for output
  nothing needs. The tell is that the entry names a symptom rather than a tool's known output
  directory.

## 16. A cross-arm comparison cannot see a defect in the layer all the arms share

§12 and §13 are about a broken instrument. This one is about a WORKING instrument asking a question
that cannot fail. "Mount form A and form B with identical inputs, compare what they commit" is the
right oracle for a divergence BETWEEN the forms — and it is blind, by construction, to anything
living underneath both of them, because deleting that thing moves every arm the same way.

Measured 2026-08-31 on `adapters/vue/fold-parity.test.ts`, which compares three arms — the component
wrapper, the SFC-lowered element, the JSX-lowered element — against each other. Vue applies both of
its RN folds (`id` -> `nativeID`, Text's `ellipsizeMode`/`allowFontScaling`) in the RENDERER, i.e.
under all three:

```
PROP_ALIASES emptied, arms compared to each other only     4 of 5 cases GREEN on a dead fold
same break, each case also pinned to an absolute payload   4 of 6 RED — exactly the id-bearing ones
```

The one case that caught it in the first version did so by accident: it asserted a literal
`{nativeID: 'before'}` because the post-mount flow was easier to write that way, not because the
oracle was designed to.

**So pair the two assertions, and know what each buys.** Cross-arm catches a fold one path breaks
and the others keep — the drift a two-mechanism adapter is prone to. Absolute catches a fold that
stops running for everybody. Neither is redundant and neither subsumes the other; a suite carrying
only the first reports a healthy system while the feature is entirely gone.

The tell that you are exposed: ask WHERE the behavior under test is implemented, and compare that to
where the arms diverge. If the implementation sits below the fork, the comparison is structurally
incapable of failing on it. Three arms rather than two makes this MORE convincing and no more
sensitive — the agreement looks harder to fake and is exactly as easy.

## 17. A verdict oracle keyed to ONE member of a set answers "no" for every other member

§12 is an oracle written in one framework's shape. This is the same defect one scale down, inside a
single adapter, and it is easier to write because the hardcoded name is right for every row that
exists when you write it.

The shared lowering table is a list of snippets, each with an expected `lower`/`refuse` verdict, and
every transform runs the same list. Svelte's harness read the verdict as:

```ts
const out = lower(`${IMPORT_PRESSABLE}${snippet}`);
const verdict = out.includes('<symbiote-pressable') ? 'lower' : 'refuse';
```

Correct for all eleven rows, because all eleven happened to use `Pressable`. Measured 2026-08-31, the
twelfth row was about `role` / `aria-*` — which belong on a `View` far more naturally than on a
button — and the snippet came back `refuse`. It was not refused: the import line named only
`Pressable`, so `View` was never a lowerable name in that file, and the oracle then looked for a tag
that could not appear either way. **Two independent reasons for the same wrong answer**, which is
what made it read as a real verdict rather than as a broken harness.

The failure is worse than a one-off wrong reading. A shared table's whole purpose is that a new row
forces every transform to declare a position, so the harness must be able to express every position
the table can hold. Keyed to one tag, it silently converts "this adapter lowers a `View`" into "this
adapter refuses" — and the first person burned is the author of the next row, who is looking at
someone else's transform and has no reason to suspect the reader.

Fix both halves, and derive them from the spec rather than listing them:

```ts
const IMPORT_ALL = `import { View, Text, Pressable } from '@symbiote-native/svelte';`;
const INTRINSICS = Object.values(HOST_PRIMITIVES).map(p => `<${p.intrinsic}`);
const verdict = INTRINSICS.some(tag => out.includes(tag)) ? 'lower' : 'refuse';
```

Then re-run the rows that already existed and confirm every previous verdict is unchanged — a
widened oracle can flip a `refuse` row to `lower` by matching a nested tag, and that failure looks
like progress.

The general form, and it is the cheapest check in this file: **when a test's subject is drawn from a
SET, ask what the harness does with a member the set does not yet contain.** If the answer is a
verdict rather than an error, the harness is deciding instead of measuring.

## 18. The FIRST mount in a process is not comparable to the second, and the difference flips signs

Every two-arm mount comparison in this repo is exposed to this, and it does not announce itself: the
first `mount()` in a process creates chrome — RN's synthetic AppContainer among it — that later
mounts in the same process reuse. So an arm measured cold reads one `createNode` fewer than the
identical arm measured warm.

Measured 2026-08-31 while pricing a conditional child on Vue. The arms were `[child]` and
`[child, null]`, the cold one first:

```
cold arm (no condition)     createNode 4
warm arm (null child)       createNode 3      <- reads as "a null child REDUCES Fabric work"
```

The sign is the dangerous part. A result that is merely noisy invites a re-run; a result that
inverts the expected direction invites a MECHANISM, and the next hour goes into explaining a fact
that is not one. The same probe run twice earlier, both arms warm, had reported 4 and 4.

Fix: one throwaway mount in `beforeAll` before any arm is measured, so every arm sits on the same
side of it. Do not fix it by ordering the arms "carefully" — that survives exactly until someone
adds a case above them or vitest reorders a `describe`.

The general form, and it is not specific to mounting: **a per-process one-time cost lands entirely
on whichever arm runs first.** Ask of any A/B harness what the first iteration pays that the second
does not — module evaluation, a lazy registry, a compiler cache, a first commit — and burn one
iteration before measuring. The related trap where the SUBJECT is warm but the instrument is not is
§13's cousin: here both arms are correct in isolation and only their comparison is wrong.

## A type-level oracle inside a test file does not run — nothing type-checks tests here

Measured 2026-08-31 while closing the `onValueChange` hole. The natural repair for "which callbacks
must reach the app" is a `Record<DerivedUnion, ICase>` in the test: add a callback to the prop type
and the table stops compiling. It is the right shape and it was inert.

```
core/components/tsconfig.json   "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]   <- every package
tsconfig.json (root)            "files": [], references only                           <- pure shell
pnpm typecheck                  tsc --build  -> builds the references, sees no test
vitest                          esbuild strips types WITHOUT checking them
```

So **no test file in this repo is type-checked by anything**, and a compile-time assertion written
in one is decoration. It shows red in an editor and green in CI, which is the worst of the two.

The repair is placement, not mechanism: put the exhaustiveness `Record` in the SOURCE file beside
the type it guards, and export `Object.keys` of it as a runtime list the test consumes. Then the
chain has two live links and no way through:

```
add a callback to ITextInputProps        -> tsc red   (the Record in the source file)
satisfy tsc by listing it                -> vitest red (the test's key-set equality)
add the test row                         -> green, and the row asserts it reaches the app
```

Both arms were break-tested rather than assumed — the first attempt asserted only the first link and
a probe against it printed nothing at all, which reads as "no error" and was "never compiled".

Two working rules:

- **Before relying on a type to enforce anything, confirm the file is in a tsconfig's `include`.**
  `npx tsc --build --force --listFiles <project> | grep <file>` answers it in one line. A count of 0
  is the finding.
- **A probe that prints nothing has two readings — passed, and never ran.** Distinguish them by
  breaking the thing deliberately first and requiring the probe to speak.

## 19. Collapsing a differential oracle to an absolute one exposes the harness constant it hid

Sibling of §16, and it shows up the moment a two-arm test loses an arm. `adapters/vue/benchmark-row-shape.test.ts` asserted `withInput.shape.length === plain.shape.length + 1`. Both arms carried the surface's own container view, so the constant cancelled and nobody had to know it was there. The row-shape arm was then deleted and the assertion rewritten as an absolute — "the row commits ten views" — which promptly read 11.

The constant was benign; the two repairs are not equivalent:

```
expect(row.shape).toHaveLength(11)          a literal that silently absorbs whatever chrome is
expect(row.contentShape).toHaveLength(10)   shape net of the forest root — names what is counted
```

The literal passes today and turns any later change to the surface's own chrome into a row-count failure, with the failure text pointing at the row. Netting the container out in the probe keeps the number meaning the thing it is named after.

Two working notes. **A differential assertion is silent about everything its two arms share** — so when one arm goes away, re-derive the absolute rather than transcribing what the passing run printed. And an off-by-N on the first absolute run is evidence, not noise: it is the constant becoming visible for the first time, and the question to ask is what the extra unit IS, not what number makes it green.

## Pick the input that SEPARATES the two implementations, not the ones that look extreme

A guard derived from a spec still has to choose its inputs, and the obvious three are the extremes:
unset, `null`, `false`. Measured 2026-09-01 on a runtime guard for `HOST_PRIMITIVES`'s default ops,
they separate nothing:

```
authored     notFalse (the spec)    `value ?? true` (a plausible wrong fold)
undefined    true                   true
null         true                   true
false        false                  false
0            true                   0        <- the only input that splits them
```

So the guard was green under a renderer implementing the wrong operator, and the break-test is the
only reason anyone found out — arm B (delete the fold) reddened, arm C (implement it as `??`) did
not. Two arms, one moved, and the one that did not move was the informative one.

The general form: **an op is defined by the inputs where it DISAGREES with its neighbours, and
those are rarely the extremes.** `??` and `!== false` agree on everything except a falsy value that
is neither nullish nor `false`. Before trusting a value-fold test, write the truth table for the
operator you meant and the operator you might have typed, and pick a row where the columns differ.

Corollary for break-testing: **the arm that stays green is a finding, not a nuisance.** The instinct
is to conclude the arm was badly built (`verify-the-deciding-side.md` on arms that move nothing);
here the arm was fine and the TEST was underpowered. Both readings are live, and the way to tell
them apart is to ask what the two implementations do differently and whether any input exercises it.

## 20. Two guards that look redundant: break them SEPARATELY and read which rows fail

A second guard added beside an existing one reads as belt-and-braces, and the cheap review reflex is
to delete one. Whether that is safe is a measurement, not a judgement — break each guard on its own
and compare the row sets it reddens.

Measured 2026-09-01 on `adapters/svelte/src/preprocessor/lower-host-primitives.ts`, which refuses to
lower an element carrying an unreadable attribute (spread, `bind:`, `use:`) and — added the same day
— one NAMED `children`:

```
remove the children-name check    4 failed   exactly the children rows; spread and bind:this green
remove the attribute-type check   8 failed   spread AND bind:this; children rows stay green
restored                         17 passed
```

Disjoint, so neither subsumes the other, and now there is a measurement saying so instead of an
assumption. The mechanism is the interesting half: `children={kids}` is a perfectly ORDINARY
attribute, so the type check never sees it — a guard phrased as "anything this file cannot read
whole" does not cover a hazard that is entirely readable. Overlapping WORDING is not overlapping
COVERAGE.

Two working notes:

- **Overlapping row sets are the finding, not the clean answer.** If breaking guard A reddens a
  superset of guard B's rows, B may genuinely be redundant — or the suite may simply lack the input
  that separates them, which is §"Pick the input that SEPARATES the two implementations". Look for
  that input before deleting anything.
- **A new refusal needs a positive control on the same primitive**, or the block passes on a
  transform that lowers nothing. The control also pins WHAT the refusal keys on: an ordinary
  attribute must still lower, which is what distinguishes "refuses on this name" from "refuses when
  attributes exist".

## 21. Every Angular vitest test in this repo runs JIT — and JIT and AOT resolve `[style]` differently

Not one test's harness being wrong; the WHOLE MECHANISM every `adapters/angular/**/*.test.ts`
component test runs through is a different compiler path from what ships. `mount()`
(`adapters/angular/src/render/`) calls `createComponent()` on a plain `@Component`-decorated class —
`@angular/compiler`'s runtime JIT path, since nothing in the vitest pipeline runs `ngc`. Production
is `ngc --compilationMode partial` (Stage A) → this project's own babel plugins → the linker
(`babel-linker.cjs`, Stage B) → real Ivy. No existing Angular test in this repo exercises that chain
at all; every one of them proves a JIT fact and reports it as an Angular fact.

Found chasing whether a directive backing a bare intrinsic tag could reclaim `[style]` as an
ordinary property (rather than Angular's reserved styling-map binding) so a functional `style` could
reach the engine's `routeProp` unresolved. A JIT-compiled scratch test — directive declares
`@Input() style`, explicitly forwards via `Renderer2.setProperty` in `ngOnChanges` — mounted clean,
resolved the function correctly, matched the wrapped component's committed payload at both press
states. Reported as "confirmed working."

It was not. Compiling the IDENTICAL construct through the real chain (`ngc` + `babel-linker.cjs`)
and reading the linked Ivy template function:

```
JIT (vitest mount())      opacity/borderColor resolve correctly, no throw
AOT (ngc + linker)        ɵɵstyleMap(ctx.fn)  ->  throws: "Unsupported styling type: function"
```

`[style]` compiles to Angular's reserved `ɵɵstyleMap` instruction under AOT REGARDLESS of what any
matched directive or component declares as `@Input()` — verified across four constructs: a bare
directive alone, two directives sharing one selector with a component, a directive on its own
unshared selector, and — the one that settles it — the REAL shipped `<Pressable [style]="fn">`
importing the real `@symbiote-native/angular` package. All four: `ɵɵstyleMap`. Production's own
Pressable works anyway, but not by reclaiming the binding: `pressable/index.ts`'s `resolvedStyle`
getter calls the function in TypeScript and hands `[style]` an already-resolved plain value — the
function never reaches a template binding at all. JIT, evidently, resolves `[style]` differently
when a matching directive declares the input (an ordinary property write, not `ɵɵstyleMap`) —
unconfirmed WHY, only THAT, and it does not matter why for the purpose of trusting the test.

**So a JIT-green Angular test proves a JIT fact, and "does this reach the real intrinsic tag
correctly" is not one for anything touching `[style]`, `class`, or any other Angular-reserved
binding name.** The existing shipped tests are not wrong — they test real, correct JIT behavior, and
every one of them mounts a real wrapper COMPONENT (`Pressable`, `TextInput`, …), which never lets a
raw function reach `[style]` under EITHER compiler because the component resolves it in code first,
same as production. The gap is specific to testing a BARE tag with a directive standing in for a
not-yet-built runtime piece — exactly the shape a primitives-as-tags investigation needs, and exactly
the shape no existing test harness in this repo can certify.

The check that would have caught it immediately: `command grep -c ɵɵstyleMap` on the LINKED output,
same as `babel-lower-host-primitives.test.ts`'s own "the strongest proof available short of a
device" section already does for tag rewriting — that file compiles through the real linker and
reads `ɵɵdomElementStart`, never trusts a JIT mount for what it is proving. Style/class bindings need
the identical discipline; nothing in this repo currently gives it to them for a hand-built directive
that has no shipped wrapper equivalent to fall back on.

## 21. Reading a compiled INSTRUCTION NAME is not reading compiled BEHAVIOUR — two retractions, same root cause

First pass, 2026-09-01: a JIT-compiled scratch test (vitest's `mount()`, which uses `@angular/core`'s
runtime JIT compiler, never `ngc`) said a directive declaring `@Input() style` reclaims `[style]`
from Angular's reserved styling instruction. Reported "confirmed". Wrong — retracted after compiling
the identical construct through the real pipeline (`ngc --compilationMode partial` + this project's
`babel-linker.cjs`) and reading the emitted template function: `ɵɵstyleMap(ctx.fn)`, the SAME reserved
instruction as a bare tag with no directive at all. Conclusion drawn from that text: `[style]` always
routes through `ɵɵstyleMap` under AOT regardless of directive declarations, so "a declaring `@Input()`
reclaims the binding" does not exist in the compiler. Reported as the correction. ALSO WRONG.

**The compiled TEXT is not the runtime BEHAVIOUR, and this is a second, independent instance of the
same mistake the first retraction was supposed to be the cure for.** `ɵɵstyleMap` is the instruction
Angular emits for EVERY `[style]` binding, full stop — that part of the first correction was right.
What it does at RUNTIME is not visible in that text: `checkStylingMap`
(`.vendors/angular/packages/core/src/render3/instructions/styling.ts:259`) checks
`hasStylingInputShadow(tNode, ...)` first, and when a matched directive declares `@Input('style')`,
the value is redirected via `setDirectiveInputsWhichShadowsStyling` straight to that input —
`toStylingKeyValueArray` (the function-rejecting path the first retraction found) is never reached.
Angular's own source comments the exact scenario: `// Given <div [style] my-dir> such that my-dir has
@Input('style'). This takes over the [style] binding.` It is a real, first-class, documented Angular
mechanism — the SAME feature `hostDirectives` input composition rides on elsewhere in this codebase —
not something invisible to the compiler.

Settled only by executing the REAL compiled artifact, not reading it: write the AOT+linker output to
a plain `.mjs` (pure `ɵɵdefineDirective`/`ɵɵdefineComponent`, no decorators, the literal shape Metro
hands Hermes), import it directly in a vitest file, and mount it through the real `mount()`/fake-Fabric
harness the same way any other adapter test does. The directive (declaring `@Input() style`, forwarding
the raw value via `Renderer2.setProperty` in `ngOnChanges`) resolved a functional style correctly at
both press states, byte-identical to the wrapped component — running the SAME code path production
would.

**So the ordering that actually closes this class of error has three rungs, and both retractions
here stopped one rung too early:**

```
read the source                 what SHOULD happen, by reasoning        cheapest, least reliable
read the compiled TEXT          what the compiler DECIDED to emit       catches JIT-vs-AOT drift
execute the compiled ARTIFACT   what the runtime actually DOES with it  the only rung that is proof
```

Reading compiled text is real progress over JIT — it IS what caught the first, larger error (JIT
silently taking a code path AOT does not have at all, e.g. the earlier `ɵɵdomElementStart` tag-rewrite
proof in `babel-lower-host-primitives.test.ts`, which genuinely has no runtime branch to miss and where
reading text is the whole proof). It stops being sufficient the moment the emitted instruction is a
DISPATCHER whose behaviour depends on data the text does not show (here, `tNode` metadata populated
from directive matching, checked in a runtime `if`). No amount of staring at `ɵɵstyleMap(ctx.fn)`
distinguishes the shadowed case from the unshadowed one; only running it does.

Two working notes, revised from the first pass:

- **When a compiled instruction takes arguments derived from context the text does not show — a
  dispatcher, a runtime capability check, anything gated on metadata set elsewhere — stop at "read the
  text" is not enough. Execute the artifact.** The tell that text-reading might not be sufficient: the
  same instruction name appears for two constructs you expect to behave differently.
- **State which rung produced the claim, every time, not just after the first retraction.** "Read the
  source" / "read the compiled text" / "executed the compiled artifact" are three different confidence
  levels and a claim carrying the wrong one is what let this compound to a SECOND retraction of the
  SAME investigation. "Confirmed" without naming the rung is what shipped both wrong answers.
- **Delete the misleading scratch file rather than leave it standing** (still true) — but note that
  cost compounds too: this investigation deleted a working artifact once because its oracle was wrong,
  then had to rebuild an equivalent one to get the right answer. A scratch file that names its own rung
  in a comment survives being wrong in a way that's cheap to spot, instead of costing a rebuild.

## 22. A synthetic stand-in for the real input is a different input — three instances in one day

Same failure, three harnesses, all three producing a confident wrong answer that had to be retracted
after it had already been relayed:

```
angular   vitest's JIT compiler standing in for ngc + linker      -> `[style]` behaviour inverted
vue       hand-written `bindingMetadata` standing in for a real
          `import { View }`                                        -> setup-const vs setup-maybe-ref,
                                                                      and a different emission
solid     `createElement(PRESSABLE_TAG)` standing in for the
          production `createElement(FABRIC_NAME, false, TAG)`      -> registry matched by accident
```

The Solid one is already recorded in `pressable.test.ts`'s own header; the point of collecting them
is that the shape recurs and is invisible from inside the test. A stand-in is chosen because the real
thing is awkward to reach, and the awkwardness is usually load-bearing: it is where the pipeline does
something the stand-in does not.

Two working rules:

- **Name the stand-in in the result.** "Measured under JIT, unverified under AOT" costs one clause
  and stops a wrong fact from being relayed as confirmed. All three of these were reported as
  confirmed and all three had to be unwound in more than one file.
- **When the answer is load-bearing, pay to reach the real input** — a real import, the shipping
  compiler, the production call shape. Vue's answer changed once the probe used a real module; the
  synthetic arm was not a weaker version of the right answer, it was a different one.

### 21a. Compiled TEXT is not compiled BEHAVIOUR

The same Angular construct was read three ways in one day and only the third was right:

```
JIT-compiled, executed      a declaring @Input() reclaims [style]         WRONG
AOT-compiled, read as text  it emits styleMap, so a function throws       WRONG
AOT-compiled, EXECUTED      the runtime checks hasStylingInputShadow and
                            redirects to the directive's input first      right
```

Arm two is the subtle one: the text was read correctly. `ɵɵstyleMap` really is the emitted
instruction, and the conclusion drawn from it was still false, because an instruction NAME says
nothing about what the instruction does at runtime. A framework's compiler emits a generic call and
its runtime branches inside it — reading the emission is reading half the machine.

So: compile through the shipping pipeline AND run the artifact. On Angular that means importing the
LINKED output (pure `ɵɵdefineDirective` / `ɵɵdefineComponent`, no decorators — the shape Metro hands
Hermes) and mounting it, not inspecting a string.

## 23. A negative-control test goes SILENT, not red, when its subject changes sides

The pair to §20's disjointness check, and the more dangerous of the two because its failure mode is
absence rather than a wrong answer.

A case shaped "X is NOT transformed" — `does not touch a primitive we do not lower` — asserts that
the output still contains `X` untouched. That assertion **passes perfectly well against a transform
that transforms nothing at all**. It is doing real work only while `X` is genuinely outside the set
under test. The moment `X` joins the set, the case does not fail; it silently stops testing anything.

Measured 2026-09-01 in `adapters/svelte/src/preprocessor/lower-host-primitives.test.ts`. Its subject
had already moved twice — `Pressable` until 2026-08-23, `Image` until today — and both moves were
caught only because someone happened to notice a red. The third move would not have been red at all:
`Image` joining `HOST_PRIMITIVES` made the case lower its own subject, and a case that asserts
"untouched" against a lowered subject is simply a case that no longer runs.

**The repair is the same as §22's, from the other direction: make the test assert its own PREMISE
rather than name it.** The case now checks that its subject is outside `HOST_PRIMITIVES` before
asserting anything about the output, so the day `ScrollView` joins it fails with "pick another
subject" instead of going quiet.

Two shapes to check for, both in this repo on the same day:

```
a PROBE whose wrong answer looks like the bug being hunted     `head -1` picking register.test.ts,
                                                               reporting a false single-member gap
a TEST whose wrong answer looks like success                   a negative control whose subject
                                                               crossed into the set under test
```

Both are the artifact wearing the costume of the result, and in both the fix is that the locator or
the subject must assert the condition it depends on instead of assuming it. A hand-written list of
what is "outside the set" is the same stale-list bug `adapterNames()` exists to kill, applied to a
fixture rather than to an audit — so derive it (`Object.keys(HOST_PRIMITIVES)`) and let the failure
be a demand for a new subject.

## 23a. A fixed-tick settle forges the exact defect an equivalence oracle exists to find

Measured 2026-09-01 while wiring Svelte's arm of the lowering-equivalence oracle. The harness mounted
each primitive twice and waited three `setTimeout(0)` ticks per arm. Two runs of IDENTICAL code:

```
run 1   2 failed | 7 passed
run 2   4 failed | 5 passed     Text and InputAccessoryView joined, then left again
```

The wrappers do not all settle in the same number of ticks — a `$effect` that syncs attachments takes
more than a pure render — so a fixed count reads a finished tree for some primitives and a half-built
one for others, differently per run.

**Why this is worse here than in an ordinary flaky test, and it is the whole entry:** a half-built
tree differs from a finished one in exactly the currency this oracle reports — MISSING and EXTRA prop
keys on a committed node. The instrument's own output cannot distinguish "the wrapper lost a fold"
from "this arm was read too early". A timing bug arrives wearing the costume of the finding, and the
finding is a device-only defect nobody can check cheaply, so the wrong answer is expensive in both
directions.

The only symptom is the suite disagreeing with ITSELF, which no single run shows. So: **run a new
comparison harness twice before reading its first result**, and treat a changed failure SET — not
merely a changed count — as timing until proven otherwise.

The repair already exists in this repo: `waitForQuiet` (`core/test-utils/src/wait-for.ts`) samples
until the commit count stops moving, instead of guessing how many ticks the framework needs. After
it, two consecutive runs were byte-identical and the two surviving failures were both real. Same fix
this repo already made once for `.smoke-compiled-*` suites — see
`.claude/rules/smoke-compiled-artifact-collisions.md`, whose own lesson is that the timing repair was
worth keeping but was NOT the cause there. Here it was.

**And `waitForQuiet` carried the same defect one layer in, which is the part worth keeping.** It
sampled until the value held for three consecutive MACROTASKS — a count, so how much wall time it
spans is a property of the machine, exactly what it was written to stop measuring. Bisected
2026-09-02 on `flat-list-array-style`: the list commits its batch once more between tick 30 and 60,
so on an idle machine the settle declared quiet BEFORE the batch and the test passed by stopping too
early, while under a loaded full-suite run the same thirteen ticks spanned enough time to catch it
and read as free-running change detection. One test, both failure directions, neither about the
product.

Quiet is now a DURATION (`quietMs`, default 75ms — past RN VirtualizedList's 50ms batching period,
the longest deferred producer here) as well as a tick count, and `advanceMs` observes for a duration
so the second half of a "does not free-run" test is machine-independent too.

The general form: **a settle and its observation window both make a wall-clock claim, so neither may
be spelled in ticks.** When a fixed-tick wait is replaced, check the replacement is not the same unit
wearing a condition — and read WHICH direction the flake takes, because "passes when idle" and
"fails under load" here were one bug, not two.

## 23b. A fixed subject fails TWO ways when its premise moves, and only one of them is loud

§23 records a subject that changes SIDES and takes the test silent. The sibling case, measured
2026-09-01, is a subject whose premise is DECIDED AWAY, and it behaves differently:

```
subject changes sides       false GREEN   §23 — nothing tells you
premise decided away        false RED     announces itself, then tempts the wrong repair
```

A case named `folds no alias on a primitive whose spec declares none` was written the day
`SafeAreaView` was the only entry with an empty alias map. The next day the owner added `id` to all
five wrappers and gave the entry `ID_ALIAS`, and the case went red — correctly, for a reason that had
nothing to do with the transform it tests.

**The loud failure is the trap.** The obvious repair is to re-aim the case at another fixed subject
that still has the property, which buys exactly the same debt at exactly the same price, payable the
next time the spec moves. Re-aiming it at "the fold happens" instead is worse — that is the existing
control, so the suite keeps its count and loses the assertion.

The repair that does not rot is to make the SPEC the subject: iterate `Object.entries(HOST_PRIMITIVES)`
and assert each primitive against its OWN map, so an entry declaring a pair asserts the fold and one
declaring none asserts the raw key survives. Break-tested in three arms — emptying one map keeps the
suite GREEN (the row flips branch, which is the point), emptying every map fires the anti-degeneracy
guard, and breaking the transform reddens eleven rows.

**A derived-per-member assertion needs that anti-degeneracy guard**, and it is the non-obvious half:
every row is conditioned on its own member's data, so emptying ALL the data leaves every row green by
agreement. One unconditional assertion that the data is non-empty is what stops the whole block from
being satisfiable by the spec going quiet.

## 24. "Derived" is not "complete" — a list derived from ONE member does not grow

`adapterNames()` and `Object.keys(HOST_PRIMITIVES)` are safe because they enumerate the SET. A list
computed by calling one member's function looks identical in the diff and has the stale-list bug
intact: it cannot report a member it never asks about.

Measured 2026-09-01 in `adapters/vue/lowering-parity.test.ts`. `WRAPPER_TAGS` was derived by calling
`renderTextInput` — real derivation, survives a rename of the private constant, and exactly the shape
this repo recommends. When `Switch` landed with its own `-managed` split, the list silently stopped
covering the newcomer, because `renderTextInput` was never going to mention it.

The tell is the arity of the source: a listing (`readdirSync`, `Object.keys`) grows on its own; a
CALL grows only when someone adds another call. Check which one a "derived" list actually is before
trusting it the way you trust `adapterNames()`.

### And the row does not witness the guard — which is the part that feels like the work

Same session, same change, and the more expensive half. Adding the shared fixture row for the new
primitive is the visible task; the guard it appears to exercise is not exercised at all:

```
remove Switch from WRAPPER_TAGS   the shared table stays 25/25 GREEN
```

Because no transform emits a `-managed` tag — the wrappers print it at RENDER time, after
compilation — so the hazard is unreachable through a table that asks transforms for verdicts. The
addition was correct and completely unwitnessed. Fixed by asserting on the READER directly, which
reddens 1 of 25.

**So a `-managed` split owes TWO things in the same change: the row, and a reader assertion.** Ship
only the row and the guard looks covered while nothing tests it.

One break-test caution from the same round, because it produced a confident wrong signal: pointing
the row's `lowered` marker at the managed name throws from `markersFor` — an EARLIER guard — so the
arm proves that guard works and says nothing about the mechanism under test. That is
`verify-the-deciding-side.md` reached by accident; when a break-test fails loudly, check WHICH check
caught it before reading it as confirmation.

## 25. When a list CANNOT be derived, flip its polarity — choose which way the omission fails

§24 and `adapterNames()` both say the same thing: derive the list. Sometimes you cannot. A Babel
plugin cannot read TypeScript component sources at build time, so a set it consults stays
hand-written whatever anyone decides, and the staleness is not removable.

**What IS removable is the blast radius of forgetting.** Measured 2026-09-01 on Solid's ref-refusal
set:

```
was   INTRINSICS_REFUSING_REF        a DENYLIST — a new primitive defaults to LOWERING a ref,
                                     so the omission is a correctness bug: the lowered element
                                     hands back an object the component never did
now   INTRINSICS_YIELDING_HOST_REF   an ALLOWLIST — a new primitive defaults to REFUSING,
                                     so the omission costs coverage and nothing else
```

Identical maintenance, opposite consequence. The same forgetting now produces a missed optimisation
instead of a changed observable surface — and this project's whole lowering contract is that an
optimisation may not move the surface.

**Pair the flip with a test that turns the default back into a decision**, or the allowlist just
hides the omission more politely: the test asserts membership equals the answer DERIVED from each
component's own source, so a name absent by accident still reddens. Derivation is unavailable at
build time and perfectly available in a test — that asymmetry is the whole trick.

The general question, asked whenever a list resists derivation: **when someone forgets to add the
next member, does the system become wrong or merely slower?** If wrong, the polarity is backwards.

## 26. A shared control's PREMISE is a fact about one framework — Vue's arm needed the opposite one

`assertArmsAreDistinct` compares retained node counts on the premise that a component form
allocates a wrapper node the lowered form does not. Measured 2026-09-01 while wiring Vue's arm of
the equivalence oracle: **the count is 1 for both arms, on all eight primitives, on both Vue
paths** — a Vue component allocates no host node at all, functional or stateful. The control
fails every correct row, which is a false RED, and "make the numbers differ" would have been the
wrong repair.

Vue's discriminator is at the SOURCE instead: the lowered arm's compiled text names the intrinsic
as a string literal, the component arm's names an imported identifier. Matched WITH its quotes —
`symbiote-text-input` is a prefix of `-multiline` and both `-managed` spellings, so a bare
`includes(tag)` reads any of the four as lowered.

The general form, and it is the same rule this file's §22 applies to inputs: **a control encodes a
mechanism, and a mechanism is per-framework by construction.** Before porting one, ask what
artifact actually differs on YOUR adapter — allocation, compiled text, module graph — rather than
adjusting the shared helper until it agrees.

Break-test the whole file, not just the new row: emptying `PROP_ALIASES` reddened 16 of 25 and left
every cross-path row GREEN, because both lowered paths lose a shared fold identically. That is the
false green `expectCommittedProps` exists for, observed rather than argued.

## 27. Subtract a known divergence from BOTH sides, and say when the entry dies

Vue's oracle went red on `TextInput` for a real reason: the wrapper seeds
`mostRecentEventCount: 0` at create, the shared behavior writes it only on a change EVENT. The
wrapper is the side matching RN (which passes the prop every render); Fabric's default for the
field is 0, so the two commits are behaviourally identical and the divergence is payload-only.

Not a Vue finding — React's and Svelte's arms hit the same key the same day, so the repair is one
seed in `core/components/src/behaviors/text-input.ts` and belongs to whoever owns that file, not to
an adapter's test.

Handled as `WRAPPER_ONLY_KEYS`, the `EAGERLY_FORWARDED_GATES` shape: subtract the key from BOTH
arms, name it, state the repair, and mark the entry for deletion. A skip would trade one known red
for zero reds and no coverage. Break-tested — removing the entry reddens exactly 2 of 25, so the
subtraction is as narrow as it claims.

## 28. Instrument a guard you just added — "it went green" does not mean it did anything

<!-- Renumbered from 26 on 2026-09-02: two sessions appended a section to this file within the same
     hour and both picked the next free number from the copy they had read. A heading number is a
     hand-written identifier in a file that several writers append to concurrently, which is the
     same stale-list bug §24 describes, wearing a table of contents. Check the tail of the file
     rather than counting from memory before adding a section. -->

The shape that ships dead code with a confident comment: add a guard, watch the suite go green,
write a comment claiming the guard is why. The green may predate the guard entirely.

Measured 2026-09-01 on the Solid equivalence arm. Its settle loop was changed from a fixed
macrotask count to sampling `completeRoot` until quiet — the correct repair, made for a real reason
(Svelte's fixed-count arm produced a suite that disagreed with ITSELF across two runs of identical
code, because a half-built tree diffs as a fold divergence). The session then measured what the new
loop actually did:

```
all sixteen mounts settle at TWO ticks with ONE commit — one to commit, one to see the count stop
```

So no case needs the extra waiting today and the guard is not currently load-bearing. It stays, and
**the comment says exactly that**, because what it removes is silent and the hazard is real though
unreached: `requestCommit()` is microtask-coalesced, and TextInput's handshake and Switch's machine
both commit again after their first effect.

Two things follow, and the second is the one that gets skipped:

- **A guard whose necessity you have not measured is a guard whose comment you cannot write
  honestly.** "Waits for the tree to settle" and "waits for a settling that does not currently
  happen" are different claims, and only one of them survives a reader checking it.
- **Recording that a guard is not yet load-bearing is what keeps it.** An unexplained guard that
  never fires reads as ceremony and gets deleted by the next person tidying; one that names the
  hazard it anticipates, and admits the hazard is unreached, survives that reading.

## 29. A test that PRINTS between two stages measures a pipeline the app does not run

`adapters/angular/babel-lower-host-primitives.test.ts` linked the transform's output and asserted
`ɵɵdomElementStart(0, "symbiote-view"`. Its header called that "the strongest proof available
without a real device". It ran the plugin, took `.code`, and fed that STRING to a second
`transformSync` with the linker. The app runs both in ONE pass, and one pass gives the opposite
answer:

```
lower -> print -> link      symbiote-pressable / symbiote-view / symbiote-text
lower + link, one pass      Pressable / View / Text, and dependencies already stripped
```

The generator is the whole difference. Angular's linker reads an inline template by SLICING THE
FILE'S SOURCE TEXT at the AST node's byte range (`templateFromPartialCode` — `code: this.code`,
`range: {startPos, endPos}`), so a `template` string rewritten in the AST is invisible to it, while
the same transform's `dependencies` edit — an ordinary array read — lands. Printing to text between
the stages laundered exactly the mutation the linker cannot see.

**Half-applied shipped, and it is worse than not applied**: the tags stayed `<View>`/`<Pressable>`
and the directives that answer them had been deleted, so they matched nothing, no component
template ran, and every screen in `examples/angular` lost its styles and its press handlers.
`tsc` clean, 5 400 tests green, device-diagnosed 2026-09-02.

Two things generalise, and the second is the cheap one:

- **A serialisation step between stages is not a neutral join.** Any stage that reads SOURCE
  POSITIONS — a linker, a source-map consumer, a `magic-string` edit, anything slicing by offset —
  sees a printed intermediate and a shared AST differently. Compose the stages the way the app
  composes them, and if the harness cannot, say so where the assertion sits.
- **When a transform edits two fields, assert on BOTH under the real composition.** One landing and
  one not is a state no single-field assertion can see, and it is the state that breaks the app.

The repair that survives is a guard rather than a warning: the plugin now detects the linker BY
EFFECT (a `ɵɵdefineComponent` present at its own `Program` exit — the linker's babel key is a
generated `base$N`, so a name check would rot) and throws, and the rewrite moved to a source
pre-pass in `@symbiote-native/angular/metro-transformer`, which prints the lowered code to text
before Metro parses it.
