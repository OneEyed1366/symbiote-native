// The lowering SPEC — one description of which primitives compile to an intrinsic tag, what each
// folds, and when a transform must refuse. Data only: no AST, no framework, no code to share.
//
// WHY IT IS A `.cjs` AND NOT PART OF `src/`. Its consumers are Babel plugins and Metro
// transformers (`adapters/vue/metro-vue-transformer.cjs`, `adapters/{vue,solid}/babel-lower-host-
// primitives.cjs`), which run before any TS exists and cannot import from `src/`. That constraint
// is why the map was copied per adapter in the first place — `adapters/vue/src/components.ts`
// says so out loud: "keeps its own copy of this map (a .cjs cannot import from here)".
//
// WHAT IT DOES NOT UNIFY, stated here so nobody hunts for a contradiction that is not one: this
// says WHAT a fold is, never WHICH LAYER applies it. Svelte folds Text's defaults at compile time
// because a lowered `symbiote-text` has no wrapper left to do it; Vue and Solid apply the same
// fold at runtime in their renderers, where the wrapper used to. Both are correct.
//
// Four transforms carried their own copy of this before it existed, and it had already produced a
// real behaviour split — see `aliases` below.

/**
 * @typedef {{ op: 'nullish', value: unknown } | { op: 'notFalse' }} IFoldOp
 * @typedef {{ intrinsic: string, aliases: Record<string, string>, defaults: Record<string, IFoldOp> }} IHostPrimitive
 */

// `id` is RN's W3C-named alias for `nativeID` and it WINS when both are set. Verified against RN
// 0.86 rather than against our own adapters, because the three that implemented it disagreed:
//
//   View.js:77-79   if (id !== undefined) processedProps.nativeID = id;
//   Text.js:222     const _nativeID = id ?? nativeID;
//
// Same outcome on both tags: `nativeID = id ?? nativeID`, and the raw `id` key must NOT reach
// Fabric (no ViewConfig declares it, so it is silently dropped). What the adapters actually did:
// Solid folded it on both tags, Svelte on View only (its `else` branch skips Text), and Vue on
// neither — not in either transform, not in its renderer, not in `routeProp`. Vue's gap is OLDER
// than lowering (its `View` wrapper was always a bare pass-through), so it is a standing
// <adapters_reach_full_feature_parity> miss, not a lowering regression.
//
// WHICH LAYER APPLIES IT IS THE ADAPTER'S CHOICE, exactly as for `defaults` below. Solid and
// Svelte rename at COMPILE time inside the lowering transform; Vue applies it at RUNTIME
// (`PROP_ALIASES` in `adapters/vue/src/renderer/index.ts`, in `patchProp`) because Vue has FOUR
// paths to a node — lowered SFC, lowered TSX, the component wrapper, and a hand-written
// `h('symbiote-view', {id})` — and compile time only covers two of them. A transform reading this
// spec must therefore not assume it owns the fold. Applying it at both layers happens to be
// harmless here (the rename deletes `id`, so the second pass sees nothing), but that is a property
// of THIS alias, not a licence.
//
// KNOWN DIVERGENCE FROM UPSTREAM, present in two adapters and not introduced by this file: when an
// element carries BOTH `id` and `nativeID`, RN gives `id` unconditional priority, while a per-key
// rename (Vue's runtime patchProp, Solid's compile-time rename producing two `nativeID`
// attributes) lets the LAST one win. Honest parity needs per-node state; no example and no test
// sets both today.
const ID_ALIAS = { id: 'nativeID' };

/** @type {Record<string, IHostPrimitive>} */
const HOST_PRIMITIVES = {
  View: {
    intrinsic: 'symbiote-view',
    aliases: ID_ALIAS,
    defaults: {},
  },
  // The five-way switch, thrown 2026-08-23 once all three transforms carried the refusals
  // (`observesState` below). `symbiote-pressable` resolves to the SAME `RCTView` a plain view does
  // — the tag exists only so the host-behavior registry, which is keyed by TAG and never by
  // resolved name, can find the press machine.
  //
  // No aliases and no defaults: a lowered Pressable forwards its props untouched, and the machine
  // reads them off `node.props` at event time.
  Pressable: {
    intrinsic: 'symbiote-pressable',
    aliases: ID_ALIAS,
    defaults: {},
    // Turns on `stateInTemplate` and `renderPropChild`. Without them a render-prop button becomes
    // a tag with no machine — the whole reason this entry landed last.
    observesState: true,
  },
  Text: {
    intrinsic: 'symbiote-text',
    aliases: ID_ALIAS,
    // RN's Text.js applies both unconditionally on the non-virtual path. Each key below cites
    // the upstream line verbatim, because THIS DATA is now the thing that must not drift from RN.
    // The
    // authority on what they MEAN is `src/text-props.ts`'s resolveTextProps, which every wrapper
    // path already calls; this is the same fold expressed as data so a COMPILE-time transform can
    // emit it too. `notFalse`, never `nullish` — RN treats an explicit `undefined` like a missing
    // prop and only a literal `false` opts out. Emit both keys unconditionally: a fold whose two
    // branches emit different key sets is the hazard `.claude/rules/solid-descriptor-bridge.md` §1
    // exists for.
    defaults: {
      // Text.js:291  processedProps.ellipsizeMode = ellipsizeMode ?? 'tail';
      ellipsizeMode: { op: 'nullish', value: 'tail' },
      // Text.js:289  processedProps.allowFontScaling = allowFontScaling !== false;
      allowFontScaling: { op: 'notFalse' },
    },
  },
};

// A transform must refuse — leave the element a component — whenever it hits one of these. The
// categories are framework-independent; how each compiler DETECTS one is not, and stays in that
// transform. Modelled on the Svelte preprocessor's set, which is the most developed of the three.
//
// Refusing is always safe: a refused element simply keeps today's behaviour. Guessing is not — a
// half-read attribute set is a silently wrong render, on device only. Design every new category
// around that asymmetry.
// A stateful primitive carries `observesState: true`, and that flag is what turns the two refusal
// categories below ON in a transform. Declared in one place so five transforms agree on the
// spelling rather than inventing five.
//
// ADDING A STATEFUL ENTRY TO HOST_PRIMITIVES IS A FIVE-WAY SWITCH and must be the LAST step. Every
// transform lowers whatever the spec lists, so an entry that lands before a transform can refuse
// turns a render-prop button into a tag with no machine: a button that does not press, with nothing
// red in any suite. `Pressable` was held back for exactly that and thrown only once all three
// transforms carried the detections — verified by grep for `observesState` in
// adapters/{solid,vue}/*.cjs and adapters/svelte/src/preprocessor/, not by asking.
const REFUSAL_CATEGORIES = {
  // `{...spread}` / `v-bind="obj"` — the attribute set cannot be read whole.
  unreadableAttributeSet: 'an attribute set this transform cannot enumerate',
  // A computed or otherwise non-literal attribute KEY.
  unreadableKey: 'an attribute key this transform cannot resolve to a string',
  // A value shape the transform cannot reproduce in the lowered form.
  unreadableValue: 'an attribute value this transform cannot read whole',
  // `bind:` / `use:` / `{@attach}` / a template ref — binds the COMPONENT INSTANCE, which a
  // lowered element does not have.
  instanceBoundDirective:
    'a directive that binds the component instance, not the host node',
  // `role` / `aria-*`: resolveAccessibilityProps folds these into COMPOSITE accessibility props
  // and needs the whole bag, which a per-key element path does not have. Removing this refusal
  // without adding the corresponding compile-time fold breaks accessibility silently.
  bagFold: 'an attribute whose fold needs to see its siblings (role, aria-*)',
  // The two below exist for a STATEFUL primitive (Pressable) and nothing refuses on them yet.
  // They are declared ahead of the spec entry on purpose: the moment a stateful tag appears in
  // HOST_PRIMITIVES, every transform lowers it, and a transform that cannot yet refuse lowers a
  // render-prop button into a tag with no machine — a button that does not press, with nothing
  // red anywhere. So the spec entry goes in LAST, after all five can refuse, and the names live
  // here from the start so five detections do not invent five spellings of one rule.
  //
  // A functional `style` — `style={({pressed}) => …}`. The TEMPLATE reads the press state, which
  // is exactly what tier 2 cannot do: the state resolves below the framework, through the style
  // registry's `:active`, and never crosses back up. The migration target is a `:active` CSS rule,
  // not a smarter transform (`.claude/rules/host-primitive-tier.md`).
  //
  // DETECT IT AS AN ALLOW-LIST, NOT AS A HUNT FOR A FUNCTION LITERAL. All five transforms must land
  // the same side of this or they diverge on the one call site that hoists its style: `style={fn}`
  // is an Identifier at compile time and no transform can tell whether it holds an object or a
  // function. So only provably inert value shapes lower — object / array / literal / template
  // literal — and everything else refuses. The asymmetry is what settles it: a refused element
  // keeps exactly today's behaviour, while a wrongly lowered one is a button that renders and does
  // not respond.
  stateInTemplate: 'a prop whose value is not provably inert at compile time',
  // NOT A REFUSAL — kept as a named requirement because it was briefly written as one, and the
  // difference is worth the paragraph.
  //
  // The resting/pressed pair needs the style callback invoked twice. A transform that emits the
  // guard INLINE — `typeof f === 'function' ? f({pressed:false}) : f` — puts the expression in its
  // own output three times, so `style={getStyle()}` calls the author's function three times,
  // `style={bag[i]}` evaluates the index three times, and `style={flag ? a : b}` can take
  // different branches on different reads. Faced with that, the first instinct is to refuse those
  // shapes.
  //
  // THAT IS THE WRONG FIX, and encoding it in this file would have made one transform's emission
  // defect a law binding the others. The double read is a property of the EMISSION SHAPE, not of
  // the expression: wrap once — `resolveStateStyle(expr)` — and the expression is evaluated
  // exactly once while its RESULT is what gets called twice. All three shapes above then lower and
  // stay correct.
  //
  // So the rule for every transform is: **emit the style expression exactly once**, and assert it
  // on the output text (`occurrences(out, expr) === 1`) rather than trusting the shape. What
  // survives as a real contract is only that the callback must be PURE in `pressed` — its result is
  // invoked twice under any emission.
  //
  // Caught by the Svelte session after this had been written here as a refusal and sent to two
  // adapters; the Vue session found the underlying double-read in the first place.
  emitStyleExpressionOnce:
    'REQUIREMENT, not a refusal: wrap the style expression once, never repeat it in the output',
  // A function child with arity >= 1 — `{({pressed}) => …}`. Same rule, through children rather
  // than props. Arity ZERO is an ordinary lazy child, not a render prop, and must NOT refuse.
  renderPropChild:
    'a function child that takes the primitive own state as an argument',
};

// Lowering rewrites `class="x"` into an opaque bag expression, so any pass that matches on literal
// attributes can no longer see it. Reversed against Svelte's style scoper, every scoped class
// silently stopped being scoped — nothing threw, the styles just stopped applying on device. The
// hazard belongs to any transform that folds attributes into an expression, not to Svelte, so it
// is stated once here as an ordering contract.
const LOWERING_RUNS_LAST =
  'lowering is the LAST attribute-rewriting pass in its pipeline';

module.exports = { HOST_PRIMITIVES, REFUSAL_CATEGORIES, LOWERING_RUNS_LAST };
