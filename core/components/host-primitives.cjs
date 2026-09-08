// The PRIMITIVE SPEC — one description of which intrinsic tag each primitive is, what it folds,
// and which of its two Fabric views a prop selects. Data only: no AST, no framework, no code.
//
// WHY IT IS A `.cjs` AND NOT PART OF `src/`. Its consumers include build-tool files that run
// before any TS exists and cannot import from `src/` — `adapters/vue/intrinsic-tags.cjs`, which
// both Vue compilers read to answer element-vs-component. That constraint is why the map was
// copied per adapter in the first place.
//
// WHAT IT DOES NOT UNIFY, stated here so nobody hunts for a contradiction that is not one: this
// says WHAT a fold is, never WHICH LAYER applies it. Svelte folds Text's defaults in its DOM shim;
// Vue and Solid apply the same fold in their renderers. Both are correct.
//
// Four transforms carried their own copy of this before it existed, and it had already produced a
// real behaviour split — see `aliases` below.

// `intrinsicWhen` DECLARED AHEAD OF ITS FIRST ENTRY.
//
// WHAT IT IS FOR. `TextInput` is the first primitive whose TAG depends on a prop: `multiline`
// selects between two different Fabric views, `text-input` and
// `text-input-multiline` (`src/view/render-text-input.ts:33`), not between two values of
// one view. `src/resolve-intrinsic.ts` reads it at element creation, where the value is known.
//
// ONE selector and ONE alternative, deliberately — not a map and not a list. There is exactly one
// such prop in the whole surface, and a wider field would be invented rather than needed. Absent
// `intrinsicWhen` means "one tag", so no existing entry changes.
//
// THE BOUNDARY IS IDENTITY, not truthiness: only `true` picks the alternative, and a truthy
// non-boolean like `multiline={1}` does not. The spec types the selector as a boolean; guessing
// past that commits the wrong native view, and no later prop write moves a node between views.
//
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
// `h('view', {id})` — and compile time only covers two of them. A transform reading this
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
    intrinsic: 'view',
    aliases: ID_ALIAS,
    defaults: {},
  },
  // The five-way switch, thrown 2026-08-23 once all three transforms carried the refusals
  // (`observesState` below). `pressable` resolves to the SAME `RCTView` a plain view does
  // — the tag exists only so the host-behavior registry, which is keyed by TAG and never by
  // resolved name, can find the press machine.
  //
  // No defaults, and only the `id` -> `nativeID` alias every primitive carries: a lowered Pressable
  // forwards its props otherwise untouched, and the machine reads them off `node.props` at event
  // time. (This read "No aliases and no defaults" while the line below already said `ID_ALIAS`, and
  // a Solid test injected a `Pressable` entry with `aliases: {}` on the strength of it.)
  Pressable: {
    intrinsic: 'pressable',
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
  // 2. The component path no longer shares these tags. It renders `text-input-managed`
  //    (`component-names/shared.ts`), because the registry is keyed by TAG and the wrappers run the
  //    same machine in their own lifecycle — one shared tag would have installed both copies on a
  //    wrapper-built node and fired `setInputFocused` twice per focus.
  TextInput: {
    intrinsic: 'text-input',
    aliases: ID_ALIAS,
    defaults: {},
    // `multiline` picks between two SEPARATE native views, not one view with a flag, so the tag is
    // decided at compile time and a runtime selector must refuse — a wrong view here is
    // uncorrectable by any later prop write.
    intrinsicWhen: {
      prop: 'multiline',
      intrinsic: 'text-input-multiline',
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
  // engine's copy. `render-switch.ts` emits `switch-managed`; this key's `intrinsic` is
  // the bare tag the behavior registry attaches to.
  //
  // IDEMPOTENCE OF THE FOLD IS MOOT HERE FOR A DIFFERENT REASON THAN IMAGE'S. Image's entry has no
  // `-managed` twin, so its fold genuinely CAN run twice (component then lowered, same tag), and
  // idempotence is what makes that safe — asserted, not assumed. Switch's fold is NOT trivial (it
  // maps `trackColor`/`thumbColor`/`ios_backgroundColor` to native prop names, keyed on
  // `Platform.OS`) and running it twice would NOT be a no-op — but the question never arises: the
  // `-managed` split means only the bare `switch` tag ever carries this behavior, and the
  // wrapper never emits that tag, so no node's payload ever passes through this fold more than
  // once. Unreachable by construction, not idempotent by property — the same distinction
  // TextInput's own entry draws for its fold.
  //
  // No `observesState`: nothing in Switch's public surface is a function-valued style or a
  // render-prop child (`style?: IStyleProp<IViewStyle>`, never a callback), so neither
  // `stateInTemplate` nor `renderPropChild` applies — unlike Pressable, whose machine is what
  // forced that flag.
  Switch: {
    intrinsic: 'switch',
    aliases: ID_ALIAS,
    defaults: {},
  },
  Text: {
    intrinsic: 'text',
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
    intrinsic: 'image',
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
    intrinsic: 'input-accessory-view',
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
  // `safe-area-view` with children on its framework's own channel (React's third argument,
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
    intrinsic: 'safe-area-view',
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
module.exports = { HOST_PRIMITIVES };
