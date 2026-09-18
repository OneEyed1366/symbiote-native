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
// real behaviour split — the `aliases` note below is what is left of it.

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
 * @typedef {{ prop: string, intrinsic: string }} IIntrinsicWhen
 * @typedef {{ intrinsic: string, intrinsicWhen?: IIntrinsicWhen }} IHostPrimitive
 */

// `aliases` LEFT THIS SPEC ON 2026-09-18, and what it held was one pair — `id` -> `nativeID` —
// repeated on all nineteen entries. It is `routeProp`'s now
// (`core/engine/cpp/tests/js/id-alias-coverage.itest.ts`), which reaches every node rather than
// every REGISTERED one, and resolves precedence the way upstream does instead of by write order.

/** @type {Record<string, IHostPrimitive>} */
const HOST_PRIMITIVES = {
  View: {
    intrinsic: 'view',
  },
  // The five-way switch, thrown 2026-08-23 once all three transforms carried the refusals
  // (`observesState` below). `pressable` resolves to the SAME `RCTView` a plain view does
  // — the tag exists only so the host-behavior registry, which is keyed by TAG and never by
  // resolved name, can find the press machine.
  //
  // No defaults: the tag forwards its props untouched, and the machine reads them off `node.props`
  // at event time.
  Pressable: {
    intrinsic: 'pressable',
    // Turns on `stateInTemplate` and `renderPropChild`. Without them a render-prop button becomes
    // a tag with no machine — the whole reason this entry landed last.
    observesState: true,
  },
  // The three that were WITHHELD until their wrappers collapsed, landed 2026-09-11 now that none
  // exists on any adapter. The condition the old note stated — "it lands when the wrappers collapse
  // to a forwarder over the tag" — was met by deleting them outright.
  //
  // What the entry buys, since the tag and its behavior already worked without one: a hand-written
  // `<scroll-view>` was resolving as a COMPONENT on Vue, because `adapters/vue/intrinsic-tags.cjs`
  // derives its element set from this table and both Vue compilers read it. Missing here, the tag
  // cost a dev-mode resolve warning per element plus the component codegen path — a slot closure
  // instead of `_createElementBlock`.
  TouchableOpacity: {
    intrinsic: 'touchable-opacity',
  },
  TouchableHighlight: {
    intrinsic: 'touchable-highlight',
  },
  // The second primitive whose TAG depends on a prop, and the first where the prop is one RN's own
  // API takes (`<ScrollView horizontal>`): the axis is a SEPARATE native ViewManager, not a flag on
  // one view (`behaviors/scroll-view/shared.ts:131`). So an app may write either spelling and
  // `resolveIntrinsicTag` picks the view, which is also what puts `horizontal-scroll-view` into
  // Vue's element set — a tag apps write directly and which would otherwise resolve as a component.
  ScrollView: {
    intrinsic: 'scroll-view',
    intrinsicWhen: {
      prop: 'horizontal',
      intrinsic: 'horizontal-scroll-view',
    },
  },
  // Landed 2026-08-31, on the second attempt. The first threw the switch with the runtime half
  // unwired and was reverted the same hour; both gaps it exposed are closed here, and the record is
  // kept because the SEQUENCE is the reusable part — an entry here is a switch for four transforms
  // at once, so it goes in after every side is ready, never to prove the transforms work.
  //
  // `registerTextInputBehavior()` is called by every adapter's `src/register.ts`: the tag is the
  // only path an app has, so the machine has exactly one owner per node.
  TextInput: {
    intrinsic: 'text-input',
    // `multiline` picks between two SEPARATE native views, not one view with a flag, so the tag is
    // decided at compile time and a runtime selector must refuse — a wrong view here is
    // uncorrectable by any later prop write.
    intrinsicWhen: {
      prop: 'multiline',
      intrinsic: 'text-input-multiline',
    },
  },
  // Landed 2026-09-01, same order as TextInput and Image: runtime half built
  // (`core/components/src/behaviors/switch.ts`), registered by every adapter, proven
  // against the wrapper's payload (positive + negative controls, a break-tested async-timing case)
  // before this key existed.
  //
  // The behavior carries a machine: it mirrors the last value native reported and sends a platform
  // snap-back command on disagreement.
  //
  // ITS FOLD IS NOT IDEMPOTENT, and that is safe for a reason Image's entry does not share. Switch
  // maps `trackColor`/`thumbColor`/`ios_backgroundColor` onto native prop names keyed on
  // `Platform.OS`, so running it twice would NOT be a no-op — the question never arises because a
  // payload reaches this fold once, on the one tag that carries the behavior. Unreachable by
  // construction, not idempotent by property.
  //
  // No `observesState`: nothing in Switch's public surface is a function-valued style or a
  // render-prop child (`style?: IStyleProp<IViewStyle>`, never a callback), so neither
  // `stateInTemplate` nor `renderPropChild` applies — unlike Pressable, whose machine is what
  // forced that flag.
  Switch: {
    intrinsic: 'switch',
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
  // `id` is declared on all five wrappers, which it was not until 2026-09-01: upstream's
  // RefreshControl spreads `...ViewProps` (RefreshControl.js:70), so its absence was a parity gap
  // rather than a decision. The rename itself is the engine's.
  RefreshControl: {
    intrinsic: 'refresh-control',
    // None. RN seeds nothing: `refreshing` is required, and every other prop is per-platform
    // styling the native view defaults itself.
  },
  // `defaults` LEFT THIS SPEC ON 2026-09-18, and Text was the last entry that had any — RN's
  // `ellipsizeMode ?? 'tail'` and `allowFontScaling !== false` (`Text.js:289,291`). The other
  // eighteen entries had declared `{}` for months.
  //
  // It was the THIRD copy of that one rule. `applyTextDefaults` (`core/engine/src/fabric-props.ts`)
  // and its C++ twin apply both to every node committing as `RCTText`, whoever authored it and
  // whatever tag it carries — strictly WIDER than this table, which reached only a registered
  // primitive. Proven redundant rather than argued: emptying it turned ZERO itests red, and the
  // itests are the side that reads a real committed payload.
  Text: {
    intrinsic: 'text',
  },
  // FOLD-ONLY: the behavior registered for this tag carries a prop fold and nothing else — no
  // listeners, no commit hook, no per-node runtime (`core/components/src/behaviors/image.ts`).
  //
  // `mapImageProps` is idempotent, asserted in `behaviors/image.test.ts` and break-tested, so a bag
  // that reaches the fold twice folds to no effect.
  //
  // The runtime half has to land before this key does: without the fold a raw `src` reaches Fabric,
  // a key no ViewConfig declares, which throws nothing and paints nothing.
  // THE ENTRY IS NOT OPTIONAL HERE, and the reason has nothing to do with folds: this table is what
  // `adapters/vue/intrinsic-tags.cjs` derives element-vs-component from, and a hyphenated tag it
  // does not name compiles to `resolveComponent("image-background")` — children become a slot the
  // element path never reads, so the subtree renders BLANK with no error. `image`/`view`/`text` are
  // real SVG element names and survive that gap; this one is not.
  ImageBackground: {
    intrinsic: 'image-background',
    // None. The absolute-fill style, the box-dimension proxy and the Image mapping are all derived
    // from live props at commit, which a compile-time seed cannot express.
  },
  Image: {
    intrinsic: 'image',
    // None. Every default RN's Image applies is already inside the shared mapping (the source
    // array shape, the width/height style fold, `alt` -> accessibilityLabel), which the behavior
    // runs at commit — so there is nothing left for a compile-time seed to do.
  },
  // The ONLY primitive so far whose intrinsic resolves to a different Fabric component per
  // platform — `RCTInputAccessoryView` on iOS, a plain `RCTView` on Android. The fold is
  // platform-invariant on purpose; what it does NOT do is repair what sits underneath, where
  // upstream RN renders nothing at all off iOS. That divergence is with the owner as its own
  // decision.
  InputAccessoryView: {
    intrinsic: 'input-accessory-view',
    // None. The mapping has no aliasing and no derived value — every consumed name leaves under the
    // same name — so there is nothing for a compile-time seed to do.
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
  SafeAreaView: {
    intrinsic: 'safe-area-view',
  },
  // The one primitive that commits NO NODE: its intrinsic resolves to the engine's anchor, and the
  // behavior (`src/behaviors/touchable-native-feedback.ts`) clones the owner's props onto the single
  // child instead — RN's own shape (TouchableNativeFeedback.js:289,339). Entered in the same commit
  // that deletes the five wrappers, because the registry is keyed by TAG: a wrapper still emitting
  // its own `pressable` while the behavior is registered would put two press machines on one tree.
  //
  // No `defaults`: RN's TNF seeds nothing at all — every value it derives (`accessible`,
  // `focusable`, `accessibilityState`, the ripple background) depends on ANOTHER prop or on a
  // listener, which is a fold and not a default.
  TouchableNativeFeedback: {
    intrinsic: 'touchable-native-feedback',
  },
  // The SECOND primitive that commits no node, same anchor shape and same reason
  // (TouchableWithoutFeedback.js:229,286). Its clone list is not TNF's: the passthrough half is
  // copied only when SET (:281), there is no ripple, and `onBlur`/`onFocus` are cloned where TNF
  // drops them — read `src/behaviors/touchable-without-feedback.ts`'s header rather than inheriting
  // the neighbour's fold.
  //
  // Upstream's passthrough loop lets an explicit `nativeID` win over `id` here (:280-284, unlike
  // TNF's :373); NOT reproduced — the engine resolves that precedence once, on the way in, and a
  // per-primitive exception to it would be invisible from anywhere the app can see. No `defaults`:
  // every value TWF derives depends on another prop or on a listener, which is a fold and not a
  // default.
  TouchableWithoutFeedback: {
    intrinsic: 'touchable-without-feedback',
  },
  // RN's Button is a touchable wrapping a View wrapping a Text and takes NO children — `title` is a
  // string prop (Button.js:363-388) — so the behavior owns the whole subtree and the tag is the
  // only spelling. Entered in the same commit that deletes the five wrappers: the registry is keyed
  // by TAG, and a wrapper still building its own View/Text under a registered `button` would give
  // every existing Button a second copy of the subtree.
  //
  // `id` used to be PLATFORM-DEPENDENT here, and the record is worth keeping because it is what a
  // per-primitive rename costs. Button's touchable is swapped by platform (Button.js:281-284), only
  // the iOS arm renamed `id` itself, and with no entry in this table the committed payload read:
  //
  //   iOS      nativeID: 'from-id'   id: absent      the touchable-opacity fold
  //   Android  nativeID: undefined   id: 'from-id'   a key no ViewConfig declares -> dropped
  //
  // A rename that runs once, for every node, on the way in cannot produce that shape at all.
  //
  // No `defaults`: every value RN's Button seeds is derived from another prop or from a listener
  // (`accessible`, `focusable`, the greyed label, the uppercased title), which is a fold, not a
  // default.
  Button: {
    intrinsic: 'button',
  },
  // RN wraps the native spinner in a centering `<View>` (ActivityIndicator.js:112), so this tag is
  // that View and the behavior builds `activity-indicator-spinner` under it. Entered in the same
  // commit that deletes the five wrappers: the registry is keyed by TAG, and a wrapper still
  // painting its own spinner while the behavior is registered would give every indicator two.
  //
  // `id` renames on the OWNER, before `slotPropsExcept` routes the survivor down — so the key that
  // reaches the spinner is `nativeID`, which is where RN's `...restProps` puts it too
  // (ActivityIndicator.js:99).
  //
  // No `defaults`: `animating` and `hidesWhenStopped` ARE `notFalse` folds, but they belong to the
  // SPINNER, and this table's ops are applied to the tag's own bag before any slot routing. They
  // live in the behavior's spinner fold instead, which is the only layer that can see that node.
  ActivityIndicator: {
    intrinsic: 'activity-indicator',
  },
};
module.exports = { HOST_PRIMITIVES };
