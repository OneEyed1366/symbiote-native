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

// `intrinsicWhen` DECLARED AHEAD OF ITS FIRST ENTRY, like the refusal categories below it.
//
// WHAT IT IS FOR. `TextInput` is the first primitive whose TAG depends on a prop: `multiline`
// selects between two different Fabric views, `symbiote-text-input` and
// `symbiote-text-input-multiline` (`src/view/render-text-input.ts:33`), not between two values of
// one view. A transform prints a static tag, so it can resolve the choice only for a literal.
//
// ONE selector and ONE alternative, deliberately — not a map and not a list. There is exactly one
// such prop in the whole surface, and a wider field would be invented rather than needed. Absent
// `intrinsicWhen` means "one tag", so no existing entry changes.
//
// THE ACCEPTED STATIC FORMS ARE THREE, and the boundary is IDENTITY, not truthiness: a bare
// attribute is `true`, an explicit boolean literal is itself, absence is `false`. Everything else
// refuses — including a truthy non-boolean literal like `multiline={1}`, which a type-shaped check
// would wave through. The spec types the selector as a boolean; guessing past that is exactly how a
// silently wrong native view gets committed, and no later prop write can correct one.
// THE TYPEDEF BELOW IS NOT WHAT TYPESCRIPT READS. `host-primitives.d.cts` is a hand-written
// declaration file, and a field added here and not there compiles fine in every `.cjs` transform
// while failing `tsc` in the one consumer written in TypeScript — measured 2026-08-31, when
// `intrinsicWhen` landed here alone and reddened Svelte's preprocessor with the whole suite green
// (vitest does not typecheck). The reverse is worse and silent: a field in the `.d.cts` and not
// here typechecks everywhere and arrives `undefined` in all five transforms. Change both, together.
/**
 * @typedef {{ op: 'nullish', value: unknown } | { op: 'notFalse' }} IFoldOp
 * @typedef {{ prop: string, intrinsic: string }} IIntrinsicWhen
 * @typedef {{ intrinsic: string, aliases: Record<string, string>, defaults: Record<string, IFoldOp>, intrinsicWhen?: IIntrinsicWhen }} IHostPrimitive
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
  // No defaults, and only the `id` -> `nativeID` alias every primitive carries: a lowered Pressable
  // forwards its props otherwise untouched, and the machine reads them off `node.props` at event
  // time. (This read "No aliases and no defaults" while the line below already said `ID_ALIAS`, and
  // a Solid test injected a `Pressable` entry with `aliases: {}` on the strength of it.)
  Pressable: {
    intrinsic: 'symbiote-pressable',
    aliases: ID_ALIAS,
    defaults: {},
    // Turns on `stateInTemplate` and `renderPropChild`. Without them a render-prop button becomes
    // a tag with no machine — the whole reason this entry landed last.
    observesState: true,
  },
  // Landed 2026-08-31, on the second attempt. The first threw the switch with the runtime half
  // unwired and was reverted the same hour; both gaps it exposed are closed here, and the record is
  // kept because the SEQUENCE is the reusable part — an entry here is a switch for four transforms
  // at once, so it goes in after every side is ready, never to prove the transforms work.
  //
  // 1. `registerTextInputBehavior()` is now called by `adapters/{vue,svelte,solid}/src/register.ts`,
  //    the three that lower. React and Angular have no lowering transform, so no lowered node ever
  //    exists there and neither carries a `register.ts` — the same reason they skip Pressable's.
  //
  // 2. The component path no longer shares these tags. It renders `symbiote-text-input-managed`
  //    (`component-names/shared.ts`), because the registry is keyed by TAG and the wrappers run the
  //    same machine in their own lifecycle — one shared tag would have installed both copies on a
  //    wrapper-built node and fired `setInputFocused` twice per focus.
  TextInput: {
    intrinsic: 'symbiote-text-input',
    aliases: ID_ALIAS,
    defaults: {},
    // `multiline` picks between two SEPARATE native views, not one view with a flag, so the tag is
    // decided at compile time and a runtime selector must refuse — a wrong view here is
    // uncorrectable by any later prop write. `REFUSAL_CATEGORIES.dynamicIntrinsicChoice`.
    intrinsicWhen: {
      prop: 'multiline',
      intrinsic: 'symbiote-text-input-multiline',
    },
  },
  // Landed 2026-09-01, same order as TextInput and Image: runtime half built
  // (`core/components/src/behaviors/switch.ts`), registered by the four lowering adapters, proven
  // against the wrapper's payload (positive + negative controls, a break-tested async-timing case)
  // before this key existed.
  //
  // `-managed` twin, same reason as TextInput: the behavior carries a machine (mirrors the last
  // value native reported, sends a platform snap-back command on disagreement), so a wrapper-built
  // node — which already runs that same machine in its own lifecycle — must not also get the
  // engine's copy. `render-switch.ts` emits `symbiote-switch-managed`; this key's `intrinsic` is
  // the bare tag the behavior registry attaches to.
  //
  // IDEMPOTENCE OF THE FOLD IS MOOT HERE FOR A DIFFERENT REASON THAN IMAGE'S. Image's entry has no
  // `-managed` twin, so its fold genuinely CAN run twice (component then lowered, same tag), and
  // idempotence is what makes that safe — asserted, not assumed. Switch's fold is NOT trivial (it
  // maps `trackColor`/`thumbColor`/`ios_backgroundColor` to native prop names, keyed on
  // `Platform.OS`) and running it twice would NOT be a no-op — but the question never arises: the
  // `-managed` split means only the bare `symbiote-switch` tag ever carries this behavior, and the
  // wrapper never emits that tag, so no node's payload ever passes through this fold more than
  // once. Unreachable by construction, not idempotent by property — the same distinction
  // TextInput's own entry draws for its fold.
  //
  // No `observesState`: nothing in Switch's public surface is a function-valued style or a
  // render-prop child (`style?: IStyleProp<IViewStyle>`, never a callback), so neither
  // `stateInTemplate` nor `renderPropChild` applies — unlike Pressable, whose machine is what
  // forced that flag.
  Switch: {
    intrinsic: 'symbiote-switch',
    aliases: ID_ALIAS,
    defaults: {},
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
  // FOLD-ONLY: the behavior registered for this tag carries a prop fold and nothing else — no
  // listeners, no commit hook, no per-node runtime (`core/components/src/behaviors/image.ts`). The
  // whole of the wrapper's body was prop mapping, so the lowered form owes exactly that.
  //
  // No `-managed` twin, unlike TextInput, and the reason is a measured PROPERTY rather than a
  // precedent: `mapImageProps` is idempotent, so registering the fold on the tag `renderImage`
  // already emits means a wrapper-built node simply folds a second time to no effect. Asserted in
  // `behaviors/image.test.ts`; break-tested. TextInput's split is NOT about idempotence (its fold
  // is idempotent too) — it is about one owner per node, because that behavior carries a machine.
  //
  // Entered LAST, after the runtime half was built, registered by all four lowering adapters and
  // proven against the wrapper's payload. Adding this key is what makes every transform start
  // lowering `Image` at once, so a fold that had not landed would surface as a raw `src` reaching
  // Fabric — a key no ViewConfig declares, which throws nothing and paints nothing.
  Image: {
    intrinsic: 'symbiote-image',
    aliases: ID_ALIAS,
    // None. Every default RN's Image applies is already inside the shared mapping (the source
    // array shape, the width/height style fold, `alt` -> accessibilityLabel), which the behavior
    // runs at commit — so there is nothing left for a compile-time seed to do.
    defaults: {},
  },
  // Entered LAST, same order Image used: runtime half built, registered by the four lowering
  // adapters, and proven against the wrapper's payload before this key existed.
  //
  // The ONLY primitive so far whose intrinsic resolves to a different Fabric component per
  // platform — `RCTInputAccessoryView` on iOS, a plain `RCTView` on Android. The fold is
  // platform-invariant on purpose (it reproduces the wrapper's mapping on both, so the lowered and
  // wrapped paths cannot diverge per platform); what it does NOT do is repair what sits underneath,
  // where upstream RN renders nothing at all off iOS. That divergence predates the lowering, is
  // identical on both paths, and is with the owner as its own decision.
  InputAccessoryView: {
    intrinsic: 'symbiote-input-accessory-view',
    aliases: ID_ALIAS,
    // None. The mapping has no aliasing and no derived value — every consumed name leaves under the
    // same name — so there is nothing for a compile-time seed to do.
    defaults: {},
  },
  // The emptiest entry here, and deliberately so — the withholding protocol has nothing to protect
  // for this one. Every other primitive was held back until its runtime half existed and was proven
  // against the wrapper's payload; SafeAreaView has no runtime half to build. All five adapters fold
  // exactly one thing, `resolveAccessibilityProps`, and that fold already runs in the engine at
  // `fabricProps` on both commit paths (the `aria-bag-fold` row). So there is no
  // `behaviors/safe-area-view.ts`, and a reader who assumes one exists will go looking for a file
  // that was never needed.
  //
  // Counted before writing, which is the only thing standing behind that claim: five
  // implementations, zero shared, none synthesizing a node — each renders ONE
  // `symbiote-safe-area-view` with children on its framework's own channel (React's third argument,
  // a Vue slot, a Solid JSX child, Angular's `<ng-content>`, a Svelte snippet). That clears the
  // disqualifier in `.claude/rules/host-primitive-tier.md`.
  //
  // NO `ID_ALIAS`, and this is the one place SafeAreaView departs from every entry above it. The
  // alias exists to REPRODUCE a fold the wrapper performs; not one of the five SafeAreaView wrappers
  // folds `id`, and none declares it. Adding the alias here would make the lowered element fold a
  // prop its component spelling passes through untouched — a lowering that ADDS a capability, which
  // `.claude/rules/adapter-parity-audit.md` records as a bug in the same way as one that drops it.
  // That the five entries above all share `ID_ALIAS` is a property of those five primitives, not a
  // house style to copy: the sixth is where "every case so far did X" stops being a rule.
  //
  // The `id` surface gap itself is real and PRE-EXISTING — upstream's SafeAreaView takes `ViewProps`,
  // so RN accepts `id` where our wrappers do not. It predates lowering, is identical on both paths,
  // and closing it means adding `id` to five wrappers AND this alias together, never one of the two.
  SafeAreaView: {
    intrinsic: 'symbiote-safe-area-view',
    // ID_ALIAS was deliberately ABSENT here until 2026-09-01, because none of the five wrappers
    // declared `id` and aliasing on the lowered path alone would have made lowering ADD a fold the
    // component spelling does not perform. That exposed a real divergence — Solid's renderer folds
    // `id` from two string constants on the write path, so it aliased for a primitive whose spec
    // said not to (`adapters/solid/src/renderer-alias-fold.test.ts`, whose header predicted exactly
    // this the day a primitive stopped sharing the pair).
    //
    // Resolved by closing the gap rather than routing around it: `id` is now declared on all five
    // wrappers and folded here. That keeps Solid's constant-pair fast path (32 001 writes on a
    // benchmark create) and removes a real parity deficit — upstream's SafeAreaView takes the full
    // ViewProps surface, so RN accepts `id` where none of ours did. Half of this is not an option
    // in either direction: the alias without the prop folds a key nobody can pass, and the prop
    // without the alias sends a raw `id` to a view whose ViewConfig declares no such key.
    aliases: ID_ALIAS,
    defaults: {},
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
  // RETIRED 2026-08-31 — `bagFold`, "an attribute whose fold needs to see its siblings (role,
  // aria-*)". Kept as a comment because the retirement carries two lessons the entry itself never
  // could.
  //
  // WHY IT IS GONE. The aria fold moved into the engine — `core/engine/src/accessibility-props.ts`,
  // called from `fabricProps`, the one point where the whole bag is known on BOTH commit paths — so
  // a lowered element gets it exactly like a wrapped one. The premise that a per-key element path
  // cannot fold a composite was right; the conclusion that a TRANSFORM had to refuse was not. The
  // fold belongs at the layer every path goes through, not at the one layer lowering removes.
  //
  // AND IT WAS NEVER IN FORCE. Measured before removing it: of the four transforms, only Solid's
  // consulted this category. Vue's two lowered such elements happily and Svelte's preprocessor does
  // not contain the string `role` at all. So every lowered `aria-label` had been reaching Fabric as
  // a key no ViewConfig declares — the accessibility label silently dropped, on device only. This
  // constant is a VOCABULARY, not an enforcement point: writing a category down binds nobody, and
  // a transform that never consults it breaks nothing visible.
  //
  // What replaced it is a ROW, not a rule: `aria-bag-fold` in `lowering-fixtures.cjs`, verdict
  // `lower`, which every transform's runner must answer. Retiring or adding a category owes a row
  // there in the same change, or the prose goes unenforced again
  // (`.claude/rules/adapter-parity-audit.md`).
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
  // DECLARED AHEAD OF ITS SPEC ENTRY, the same way the two above were, and for the same reason: the
  // moment `TextInput` appears in HOST_PRIMITIVES every transform lowers it at once, and one that
  // cannot yet refuse would pick the WRONG Fabric view. Four detections written against a name that
  // already exists cannot invent four spellings of one rule.
  //
  // `multiline` is the first prop in this project that selects between TWO intrinsics —
  // `symbiote-text-input` and `symbiote-text-input-multiline` are different Fabric views, not one
  // view with a flag (`core/components/src/view/render-text-input.ts`). A transform prints a static
  // tag name, so it can resolve `multiline` only when the value is a literal. `multiline={isLong}`
  // is a RUNTIME value and there is no tag to print — the element must stay a component.
  //
  // NOT the same hazard as an unreadable attribute VALUE. A value the transform cannot read is a
  // prop that ends up wrong; this one ends up committing the wrong native view, which no prop write
  // can correct afterwards. Refusing keeps today's behaviour exactly.
  dynamicIntrinsicChoice:
    'a prop that selects between two intrinsics and is not a compile-time literal',
};

// Lowering rewrites `class="x"` into an opaque bag expression, so any pass that matches on literal
// attributes can no longer see it. Reversed against Svelte's style scoper, every scoped class
// silently stopped being scoped — nothing threw, the styles just stopped applying on device. The
// hazard belongs to any transform that folds attributes into an expression, not to Svelte, so it
// is stated once here as an ordering contract.
const LOWERING_RUNS_LAST =
  'lowering is the LAST attribute-rewriting pass in its pipeline';

module.exports = { HOST_PRIMITIVES, REFUSAL_CATEGORIES, LOWERING_RUNS_LAST };
