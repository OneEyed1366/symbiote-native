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
// A `refuse` ROW IS UNPROVEN UNTIL A CONTROL ON THE SAME PRIMITIVE GOES THE OTHER WAY. `refuse` is
// the ABSENCE of an observation, and "no intrinsic in the output" is produced equally by a
// transform that refused and by a primitive nothing can lower — an unimported component, a
// hardcoded default element, an entry withheld from the spec while its runtime half is wired.
// Withholding is deliberate practice here, so the ambiguous state recurs by design. Measured
// 2026-08-31: the `TextInput` entry was withdrawn and both `intrinsic-choice-*` rows went GREEN on
// all three runners, in three different mechanisms. So a runner asserts a shape that MUST lower
// before it reads a refusal — and the control's failure message says the row cannot distinguish
// the two, which is the true state. Full account: `.claude/rules/adapter-parity-audit.md`.
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
  // THE ROW THAT PROVES A CATEGORY IS A DICTIONARY, NOT AN ENFORCEMENT POINT.
  //
  // `REFUSAL_CATEGORIES.bagFold` said an element carrying `role` / `aria-*` must refuse, because
  // the fold needs the whole bag and a transform reads one attribute at a time. Measured
  // 2026-08-31, ONE of the four transforms implemented it — Solid. Vue's two lowered such elements
  // and Svelte's preprocessor does not contain the string `role` at all.
  //
  // That was not a dead refusal, it was a live defect: a lowered `aria-label` reached Fabric as a
  // key no ViewConfig knows, so the accessibility LABEL was silently dropped on device. A category
  // written in the shared spec binds nobody — each transform separately decides to consult it, and
  // not consulting it breaks nothing visible. Only a ROW here makes a divergence red.
  //
  // The verdict is `lower` because the fold now runs in the engine (`core/engine/src/
  // accessibility-props.ts`, called from `fabricProps` — the one point where the whole bag is known
  // on every commit path), so the reason to refuse is gone for every adapter at once. A transform
  // still refusing is not being safe, it is losing coverage on the props real apps write.
  // THE TAG CHOICE ITSELF IS DELIBERATELY NOT A ROW, and the reason is this table's own admission
  // test (`.claude/rules/adapter-parity-audit.md`). A row's verdict vocabulary is `lower` /
  // `refuse`; it cannot say WHICH intrinsic was emitted. So a row asserting that
  // `<TextInput multiline />` lowers would pass against a transform emitting the single-line tag —
  // and `symbiote-text-input` is a PREFIX of `symbiote-text-input-multiline`, so even a
  // hand-written `toContain` check reads the wrong one as right. The tag choice is pinned by each
  // adapter's own test, where the emitted text is available; all three carry one.
  //
  // What the table CAN decide is the refusal, and that is what these two rows are for: a dynamic
  // selector must refuse on every transform, or one of them commits the wrong NATIVE VIEW — an
  // error no later prop write can correct, unlike a merely wrong prop value.
  {
    id: 'intrinsic-choice-dynamic',
    what: 'the intrinsic-selecting prop is a runtime value',
    expected: 'refuse',
    why: 'a transform prints a static tag, so a selector it cannot resolve at compile time leaves it guessing which native view to commit',
  },
  {
    id: 'intrinsic-choice-nonboolean-literal',
    what: 'the intrinsic-selecting prop is a truthy non-boolean literal',
    expected: 'refuse',
    why: 'the boundary is IDENTITY, not truthiness — a type-shaped check waves `multiline={1}` through and commits the multiline view for an author who wrote a number',
  },
  {
    id: 'aria-bag-fold',
    what: 'the element carries role / aria-* attributes',
    expected: 'lower',
    why: 'the fold moved to the engine, so a lowered element gets it too — a transform that still refuses only costs coverage, and three of the four never refused in the first place',
  },
  // THE VERDICT IS RIGHT AND THE REASON THIS ROW SHIPPED WITH WAS FALSE — kept as a comment because
  // the correction is the more useful half. It read "a lowered element has no component instance
  // for the binding to target", which assumes the binding targeted one before. It did not: NO
  // adapter exposes a public `ref` on `Pressable`. React's `ref: viewRef`
  // (`components/pressable/index.ts:204`) is internal, handed to the inner View so the machine can
  // measure its retention region; Vue and Svelte declare none, and Solid's own props type says so
  // out loud. So `ref={handle}` on an un-lowered `<Pressable>` does nothing at all.
  //
  // What lowering does is therefore not to BREAK the binding but to ADD one — the intrinsic hands
  // back a live engine node. That is the actual hazard, and it is worse than the stated one: the
  // capability would exist only when the transform happened to lower, so an unrelated attribute
  // elsewhere on the tag would decide whether an app's `ref` works. A surface that flickers with a
  // compiler's verdict is harder to reason about than one that is absent everywhere.
  //
  // Hence the rule this row now stands on, which generalises past `ref`: A LOWERING TRANSFORM IS AN
  // OPTIMISATION, AND AN OPTIMISATION THAT CHANGES THE OBSERVABLE SURFACE — IN EITHER DIRECTION — IS
  // A BUG. Refusing keeps lowered and un-lowered call sites indistinguishable to an app. If
  // `Pressable` is later given a public ref, it is given one on all five adapters by design
  // (`<adapters_reach_full_feature_parity>`), and only then can this row be revisited.
  //
  // Found by the Solid session 2026-08-30, when Solid's newly-added runner answered `lower` here
  // and the investigation went looking for the instance the row assumed.
  {
    id: 'instance-bound-directive',
    what: 'the element carries a directive binding the component instance',
    expected: 'refuse',
    why: 'lowering must not change the observable surface: no adapter exposes a public ref on Pressable, so lowering would ADD one that appears only when the transform happens to lower',
  },
  // The first FOLD-ONLY primitive, and the row exists because a transform genuinely decides it: an
  // entry can be present in the spec and still be dropped between the file and the transform's own
  // projection (`spec-projection-covers-fields.test.ts` exists because `intrinsicWhen` was), in
  // which case the tag is simply never recognised and the element stays a component. Nothing else
  // in this table would catch that.
  //
  // No attribute of its own on purpose: what is under test is that the NAME is recognised, not any
  // rule about a prop. A row that needed an attribute would be testing two things at once.
  {
    id: 'image-fold-only',
    what: 'a fold-only primitive with no attribute worth refusing',
    expected: 'lower',
    why: 'the spec carries the entry and the behavior carries the fold, so every transform should recognise the tag; a refusal here means the entry never reached this transform projection',
  },
  // A SECOND fold-only name, and it is not a duplicate of the row above. What that one proves is
  // that a transform's spec projection works at all; what this proves is that it is driven by the
  // spec rather than by a hardcoded list of names — the shape `adapters/angular` shipped for months
  // (`LOWERABLE_NAMES = ['View', 'Text']`). A transform can pass `image-fold-only` and fail here.
  {
    id: 'input-accessory-view-fold-only',
    what: 'a second fold-only primitive, proving the name list is read rather than written',
    expected: 'lower',
    why: 'nothing about this primitive is refusable — no state, no intrinsic choice, no aliasing — so a refusal can only mean the transform never saw the entry',
  },
  // A THIRD name, and it is not fold-only the way the two above are — it carries a real ENGINE
  // machine (mirrors the last value native reported, sends a platform snap-back command on
  // disagreement). What decides a TRANSFORM's verdict is `observesState`/`intrinsicWhen`, neither
  // of which this entry sets (its public surface has no function-valued style and no dynamic
  // intrinsic choice), so from a transform's perspective it is answered exactly like a fold-only
  // primitive — the machine is an engine-side fact, invisible to this row. `thumbColor` is a
  // CONSUMED alias (folds to `thumbTintColor`), same rationale as Image's `alt`.
  {
    id: 'switch-fold-only',
    what: 'a third name with an engine machine but no compile-time refusal — the verdict does not depend on it',
    expected: 'lower',
    why: 'no observesState, no intrinsicWhen — a refusal here can only mean the transform never saw the entry, same as the two fold-only rows above',
  },
];

// NO `safe-area-view` ROW, deliberately, and the reason belongs here or the next reader files it as
// a coverage gap. SafeAreaView is a third fold-only primitive, and the two rows above already spend
// that question: one proves a transform's spec projection works at all, the other proves the name
// list is READ rather than written. A third attribute-free name is answered identically by every
// implementation, including a broken one — the admission test in
// `.claude/rules/adapter-parity-audit.md` ("could a transform get this wrong?") says that is a row
// which proves nothing.
//
// It does carry one thing genuinely new — it is the first entry declaring `aliases: {}`, so a
// transform that folded `id -> nativeID` unconditionally would be wrong on it. That is NOT
// expressible here: this table's verdict is lower/refuse, and both the right and the wrong transform
// LOWER. It needs a payload oracle, which is per-adapter by construction; Svelte's is the pair in
// `preprocessor/lower-host-primitives.test.ts` ("folds no alias on a primitive whose spec declares
// none", with the control beside it).

module.exports = { LOWERING_CASES };
