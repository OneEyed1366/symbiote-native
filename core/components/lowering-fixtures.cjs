// The shared VERDICT table for host-primitive lowering — the fifth parity surface named in
// `.claude/rules/adapter-parity-audit.md`.
//
// WHY A TABLE OF CASES AND NOT SHARED CODE. Four transforms implement one rule set —
// `adapters/solid/babel-lower-host-primitives.cjs`, `adapters/vue/babel-lower-host-primitives.cjs`,
// `adapters/vue/metro-vue-transformer.cjs`, `adapters/svelte/src/preprocessor/lower-host-
// primitives.ts` — over three different plumbings: a Babel plugin holding a real AST, an SFC
// transform handed SOURCE TEXT, and a Svelte preprocessor that reads ESTree and emits text. They
// share a spec (`host-primitives.cjs`) and a specialiser (`specialize-state-style.cjs`), and
// sharing those proves NOTHING about the answer each one gives — which is the whole gap. So what is
// shared here is the QUESTION and the EXPECTED ANSWER; the snippet that asks it stays per-framework,
// because `<View {...spread}>` and `<View v-bind="x">` are the same case in two syntaxes.
//
// TWO LEVELS, ONE VERDICT. Coverage is decided by INVOCATION — the style callback is called once
// per state and both results ride the bag as `style` + `activeStyle`, which is the same answer on
// all five adapters. Compile-time SUBSTITUTION (`specialize-state-style.cjs`) is an optimisation a
// transform applies when it can prove the body, saving a closure allocation; it never changes a
// verdict. So every row below is an equality across adapters even though what each one costs
// differs. A transform reporting `refuse` on a row the specialiser cannot prove has wired
// substitution as the MECHANISM rather than as the optimisation, and that is the drift this table
// exists to catch.
//
// A REFUSAL CATEGORY CAN BELONG TO THE TRANSFORM RATHER THAN TO THE LANGUAGE, and
// `REFUSAL_CATEGORIES.emitStyleExpressionOnce` is the worked example — and it carries that name
// because it was FIRST written as a refusal called `unrepeatableRead`, then corrected to a
// requirement on the output. It names `style={getStyle()}`,
// `style={bag[i]}`, `style={flag ? a : b}` — expressions that change meaning when read twice. But
// the pair is only built by reading TWICE if the transform prints the expression twice, which an
// inline guard (`typeof f === 'function' ? f({pressed}) : f`) does and a runtime helper
// (`resolveStateStyle(expr)`) does not: the helper reads the expression ONCE and calls its RESULT
// twice. Measured 2026-08-23 — Svelte lowers all three with exactly one read in the emitted text;
// Vue refused them while emitting the guard inline.
//
// So a row asserting `refuse` there would encode one transform's emit shape as a shared law and
// cost every other transform real coverage. Rows for these shapes belong in the table as `lower`,
// with "emit the expression once" stated as the requirement — which makes a double-reading
// transform FAIL the table instead of being ratified by it. The general form: before adding a
// refusal row, ask whether the hazard survives a different emit. If it does not, the row belongs
// to the emit.
//
// THE CONTRACT INVOCATION IMPOSES, stated because it is now observable: a style callback must be
// PURE in `pressed`. It is executed twice. A side-effecting body was already broken under
// substitution, but only invocation runs it.
//
// WHY IT MATTERS THAT NO OTHER AUDIT SEES THIS. Barrels, subpaths, `files` coverage and exported
// symbols are all untouched by a transform that lowers a call site its sibling refuses. Every suite
// stays green and the divergence surfaces either as one adapter being mysteriously slower, or as a
// button that lowered when it should not have and therefore does not respond.

/**
 * @typedef {'lower' | 'refuse'} IVerdict
 * @typedef {{ id: string, what: string, expected: IVerdict, why: string }} ILoweringCase
 */

/**
 * Every case a lowering transform must answer the same way. Each adapter's test supplies its own
 * snippet per `id` and asserts `expected`; a case with no snippet is itself a failure, so adding a
 * row here forces every transform to declare where it stands.
 * @type {ReadonlyArray<ILoweringCase>}
 */
const LOWERING_CASES = [
  {
    id: 'inert-object-style',
    what: 'style is an object literal',
    expected: 'lower',
    why: 'provably not a function, so the template cannot be reading press state through it',
  },
  {
    id: 'hoisted-identifier-style',
    what: 'style is a bare identifier that may hold an object OR a function',
    expected: 'lower',
    why: "the compile-time allow-list could never decide this one, which is why it used to refuse. INVOCATION decides it at runtime instead — `typeof f === 'function' ? f({pressed}) : f` — so the shape that no substitution can prove becomes the shape that needs no proof",
  },
  {
    id: 'specialisable-state-style',
    what: 'style is an arrow taking { pressed } and returning one object literal',
    expected: 'lower',
    why: 'INVOCATION covers it — the callback is called once per state and both results ride the bag as style + activeStyle. `specialize-state-style.cjs` is an OPTIMISATION on top for the bodies a transform can prove, saving the closure; it never changes the verdict',
  },
  {
    id: 'nested-function-state-style',
    what: 'the state style body contains another function',
    expected: 'lower',
    why: 'the SPECIALISER refuses this body — it cannot prove a nested function — but the verdict is set by invocation, which does not need to prove anything. The case stays in the table precisely because it separates the two levels: a transform that reports `refuse` here has wired substitution as the mechanism instead of as the optimisation',
  },
  {
    id: 'call-expression-style',
    what: 'style is a call expression',
    expected: 'lower',
    why: "`REFUSAL_CATEGORIES.emitStyleExpressionOnce` — safe exactly when the transform prints the expression ONCE and calls the RESULT twice. A transform printing an inline guard repeats it and runs the author's call once per copy per recompute; that is its emit to fix, not a shape to ban. Assert `occurrences(out, expr) === 1` on the output",
  },
  {
    id: 'computed-member-style',
    what: 'style is a computed member expression',
    expected: 'lower',
    why: 'same requirement as the call expression, and the index is the tell: printed twice, `bag[i]` is evaluated twice',
  },
  {
    id: 'conditional-style',
    what: 'style is a conditional expression',
    expected: 'lower',
    why: 'same requirement, and the sharpest failure of breaking it: printed twice, the two reads are free to take DIFFERENT branches, so the resting and pressed halves come from unrelated objects',
  },
  {
    id: 'zero-arity-child',
    what: 'children take no parameter',
    expected: 'lower',
    why: 'an ordinary lazy child, not a render prop. On Svelte EVERY child is a snippet whether the author wrote one or not, so arity is the only thing separating the two',
  },
  {
    id: 'render-prop-child',
    what: 'children take a parameter',
    expected: 'refuse',
    why: 'the parameter is the press state, and tier 2 resolves that state BELOW the framework where the template cannot read it back',
  },
  {
    id: 'spread-attributes',
    what: 'the element carries a spread',
    expected: 'refuse',
    why: 'the attribute set cannot be enumerated, and a half-read set is a silently wrong render',
  },
  {
    id: 'instance-bound-directive',
    what: 'the element carries a directive binding the component instance',
    expected: 'refuse',
    why: 'a lowered element has no component instance for the binding to target',
  },
];

module.exports = { LOWERING_CASES };
