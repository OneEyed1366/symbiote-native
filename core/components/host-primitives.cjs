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
  // `TouchableOpacity` is DELIBERATELY ABSENT, and this note is here so the next reader does not
  // add it as an oversight. Its tag exists (`touchable-opacity`) and its behavior is registered;
  // what is not ready is the other four adapters' wrappers, which still build TWO nodes — a
  // `pressable` around a faded `view` — where RN and the tag build ONE
  // (`TouchableOpacity.js:302`). An entry here is a switch for every adapter at once: the
  // equivalence arms demand a component spelling that commits what the tag commits, and today
  // four of them cannot. It lands when the wrappers collapse to a forwarder over the tag.
  //
  // Until then the `id -> nativeID` alias this entry would carry is applied by the behavior's own
  // `foldPayload` (`behaviors/touchable-opacity.ts`), so the tag is not missing the fold — it is
  // getting it one layer down, on its own path only.
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
  // Filed as NOT LOWERABLE for a week under `.claude/rules/host-primitive-tier.md`'s "SECOND
  // disqualifier" — its own node is a single element, but its POSITION is decided by the ScrollView
  // and differs per platform (iOS a sibling before the content view, Android the scroll view's
  // PARENT), and a per-node behavior cannot own a decision another component makes.
  //
  // That is settled and it was settled elsewhere: the ScrollView states the placement as DATA
  // (`claimedChildren: { [REFRESH_CONTROL]: platform.claimMode }`, `behaviors/scroll-view/shared.ts`)
  // and the ENGINE moves the node in `appendChild`. So the claim needs nothing from this primitive's
  // own behavior — verified on a bare node with no wrapper anywhere, both platforms, in
  // `behaviors/refresh-control.test.ts`.
  //
  // What the behavior owes is therefore only the CONTROLLED HANDSHAKE, and no fold at all: four of
  // the five wrappers folded exactly `resolveAccessibilityProps`, which the engine already runs at
  // `fabricProps` on every path — the same reason SafeAreaView has no behavior file.
  //
  // ID_ALIAS, and it is the SafeAreaView resolution rather than the SafeAreaView position: none of
  // the five wrappers declared `id`, and upstream's RefreshControl spreads `...ViewProps`
  // (RefreshControl.js:70), so that was a standing parity gap rather than a deliberate omission.
  // The prop is declared on all five in the same change as this alias — half of it in either
  // direction is broken (a fold for a key nobody can pass, or a raw `id` reaching a view whose
  // ViewConfig declares none).
  //
  // No `-managed` twin: the behavior carries a machine, so it needs one owner per node, and it has
  // one — the wrappers forward to this tag and none of them runs a mirror any more.
  RefreshControl: {
    intrinsic: 'refresh-control',
    aliases: ID_ALIAS,
    // None. RN seeds nothing: `refreshing` is required, and every other prop is per-platform
    // styling the native view defaults itself.
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
  // THE ENTRY IS NOT OPTIONAL HERE, and the reason has nothing to do with folds: this table is what
  // `adapters/vue/intrinsic-tags.cjs` derives element-vs-component from, and a hyphenated tag it
  // does not name compiles to `resolveComponent("image-background")` — children become a slot the
  // element path never reads, so the subtree renders BLANK with no error. `image`/`view`/`text` are
  // real SVG element names and survive that gap; this one is not.
  //
  // `aliases: ID_ALIAS` was MEASURED against the arm without it rather than reasoned about, because
  // `behaviors/image-background.ts` folds `id` itself on the built image. Both arms commit
  // `nativeID` on the image and no `id` anywhere, and the two compose because an alias DELETES its
  // source key — so the second pass finds nothing. Kept for the property `foldHostBag` provides and
  // the behavior cannot: the rename happens on the OWNER bag, before the redirect, so any adapter
  // path that folds bags gets it whether or not the behavior ever runs.
  ImageBackground: {
    intrinsic: 'image-background',
    aliases: ID_ALIAS,
    // None. The absolute-fill style, the box-dimension proxy and the Image mapping are all derived
    // from live props at commit, which a compile-time seed cannot express.
    defaults: {},
  },
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
  // The one primitive that commits NO NODE: its intrinsic resolves to the engine's anchor, and the
  // behavior (`src/behaviors/touchable-native-feedback.ts`) clones the owner's props onto the single
  // child instead — RN's own shape (TouchableNativeFeedback.js:289,339). Entered in the same commit
  // that deletes the five wrappers, because the registry is keyed by TAG: a wrapper still emitting
  // its own `pressable` while the behavior is registered would put two press machines on one tree.
  //
  // ID_ALIAS, and it was proposed WITHOUT one on the reasoning that the behavior already reads
  // `id ?? nativeID` itself (:373) so the shared alias would double-fold. Measured instead of
  // reasoned (`behaviors/touchable-native-feedback.test.ts`, "folds `id` the same whichever layer
  // renamed it"): the two compose idempotently — the alias renames on the OWNER, whose props never
  // reach Fabric, and the behavior's `??` then reads the renamed key to the same answer. Declining
  // the pair would have bought nothing and broken Solid's constant-pair fast path, whose guard
  // (`adapters/solid/src/renderer-alias-fold.test.ts`) is what makes one string compare legal on
  // 32 001 prop writes.
  //
  // No `defaults`: RN's TNF seeds nothing at all — every value it derives (`accessible`,
  // `focusable`, `accessibilityState`, the ripple background) depends on ANOTHER prop or on a
  // listener, which is a fold and not a default.
  TouchableNativeFeedback: {
    intrinsic: 'touchable-native-feedback',
    aliases: ID_ALIAS,
    defaults: {},
  },
  // The SECOND primitive that commits no node, same anchor shape and same reason
  // (TouchableWithoutFeedback.js:229,286). Its clone list is not TNF's: the passthrough half is
  // copied only when SET (:281), there is no ripple, and `onBlur`/`onFocus` are cloned where TNF
  // drops them — read `src/behaviors/touchable-without-feedback.ts`'s header rather than inheriting
  // the neighbour's fold.
  //
  // ID_ALIAS for the reason measured on TNF: the alias renames on the OWNER, whose props never reach
  // Fabric, and the behavior's own `id ?? nativeID` then reads the renamed key to the same answer.
  // Upstream's passthrough loop lets an explicit `nativeID` win over `id` here (:280-284, unlike
  // TNF's :373); NOT reproduced, because with the alias in place that quirk would depend on which
  // adapter folds where. No `defaults` — every value TWF derives depends on another prop or on a
  // listener, which is a fold and not a default.
  TouchableWithoutFeedback: {
    intrinsic: 'touchable-without-feedback',
    aliases: ID_ALIAS,
    defaults: {},
  },
  // RN's Button is a touchable wrapping a View wrapping a Text and takes NO children — `title` is a
  // string prop (Button.js:363-388) — so the behavior owns the whole subtree and the tag is the
  // only spelling. Entered in the same commit that deletes the five wrappers: the registry is keyed
  // by TAG, and a wrapper still building its own View/Text under a registered `button` would give
  // every existing Button a second copy of the subtree.
  //
  // ID_ALIAS, and here it is REQUIRED rather than inherited — the one entry so far where declining
  // it would have shipped a PLATFORM-DEPENDENT bug. Button's touchable is swapped by platform
  // (Button.js:281-284), and only one of the two arms renames `id` itself: `touchable-opacity`'s
  // own `foldPayload` does (it has no spec entry to do it for it), the bare press behavior does not
  // (`Pressable`'s entry does it instead). Measured on the committed payload, no entry here:
  //
  //   iOS      nativeID: 'from-id'   id: absent      the touchable-opacity fold
  //   Android  nativeID: undefined   id: 'from-id'   a key no ViewConfig declares -> dropped
  //
  // So the alias is what makes the two platforms agree, and it composes idempotently with the
  // iOS-side fold exactly as TNF's does: the rename happens on the bag, so `Object.hasOwn(next,
  // 'id')` one layer down finds nothing left to do.
  //
  // No `defaults`: every value RN's Button seeds is derived from another prop or from a listener
  // (`accessible`, `focusable`, the greyed label, the uppercased title), which is a fold, not a
  // default.
  Button: {
    intrinsic: 'button',
    aliases: ID_ALIAS,
    defaults: {},
  },
  // RN wraps the native spinner in a centering `<View>` (ActivityIndicator.js:112), so this tag is
  // that View and the behavior builds `activity-indicator-spinner` under it. Entered in the same
  // commit that deletes the five wrappers: the registry is keyed by TAG, and a wrapper still
  // painting its own spinner while the behavior is registered would give every indicator two.
  //
  // ID_ALIAS, and unlike Button's it is not platform-dependent — measured on the committed payload,
  // both platform arms, with the entry absent:
  //
  //   iOS      spinner: id 'probe'   nativeID absent    ActivityIndicatorView declares no `id`
  //   Android  spinner: id 'probe'   nativeID absent    AndroidProgressBar declares no `id`
  //
  // i.e. identically broken on both, because the platform half of this primitive is the spinner's
  // COLOUR and native extras, and nothing about it touches the name fold. The alias renames on the
  // OWNER's bag, before `slotPropsExcept` routes the survivor down — so the key that reaches the
  // spinner is `nativeID`, which is where RN's `...restProps` puts it too (ActivityIndicator.js:99).
  //
  // No `defaults`: `animating` and `hidesWhenStopped` ARE `notFalse` folds, but they belong to the
  // SPINNER, and this table's ops are applied to the tag's own bag before any slot routing. They
  // live in the behavior's spinner fold instead, which is the only layer that can see that node.
  ActivityIndicator: {
    intrinsic: 'activity-indicator',
    aliases: ID_ALIAS,
    defaults: {},
  },
};
module.exports = { HOST_PRIMITIVES };
