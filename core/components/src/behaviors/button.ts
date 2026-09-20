// Button as an ENGINE-NODE behavior, so RN's one batteries-included control can be an intrinsic
// tag instead of five framework components (`.claude/rules/host-primitive-tier.md`, tier 2).
//
// THE WHOLE PRIMITIVE IS COMPOSITION. RN's Button is a touchable wrapping a View wrapping a Text
// (Button.js:363-388) and takes NO children — `title` is a string prop. So `buildStructure` owns
// the entire subtree, and the nodes below it are a PROJECTION of three owner props.
//
// AND THE TOUCHABLE IS NOT THE SAME ONE ON BOTH PLATFORMS (Button.js:281-284), which is why the
// two trees have different HEIGHTS. TouchableOpacity WRAPS — it renders its own `<Animated.View>`
// and puts the child inside it (TouchableOpacity.js:302,344). TouchableNativeFeedback RENDERS
// NOTHING and clones its props onto the child instead (TouchableNativeFeedback.js:339), so on
// Android Button's own `<View style={buttonStyles}>` IS the responder:
//
//   iOS      button   RCTView      TouchableOpacity's Animated.View — the responder + the fade
//            └ view   RCTView      no style at all, and no fold
//              └ text RCTText      `button-label-text` — foldButtonLabelStyle + RN's Text defaults
//                └ raw RCTRawText  `button-label`    — foldButtonLabel            FOUR nodes
//
//   Android  button   RCTView      the styled button view, CLONED onto: the responder, the ripple
//            │                     background, the whole a11y fold. No fade, no wrapper.
//            └ text   RCTText
//              └ raw  RCTRawText   UPPERCASED (Button.js:352-353)                 THREE nodes
//
// EVERY RULE IS IN THE ENGINE AS OF 2026-09-18, and off Android this primitive binds no
// `payloadFold` on any of its four nodes — it costs ZERO trips into JS, down from five. The one that
// survives is the OWNER's on Android, for the view style and the ripple background.
//
// The last to move was the label text's, and it needed a seam none of the others did: its style is a
// function of the BUTTON's `color` and `disabled`, and the button is its GRANDPARENT here and its
// parent on Android. `IAncestorLookup` asks for the nearest ancestor carrying a tag — a CSS ancestor
// selector — so one rule is correct on both trees.
//
// ---------------------------------------------------------------------------------------------
// HOW THE PROJECTION REACHES ITS NODES, given that each `payloadFold` MUST be pure:
//
//   title    a REDIRECT. The raw text is the slot, and `slotProps` renames `title` -> `text` on it,
//            so the app's write lands on the label through the label's own `routeProp` and marks
//            it. `resolveButtonTitle`'s uppercase is then the label's own fold over its OWN props —
//            no owner to read, and `isEmptyRawText` still sees the real title, so an empty one is
//            dropped by the commit walk exactly as it was before.
//   color    a per-node FOLD over the owner, on the text and — on iOS — on the view (the shape
//   disabled `behaviors/scroll-view/shared.ts` uses). `slotDerived` marks the slot, and
//            `addDerivedNode` extends that mark to the nodes past it. On Android the second
//            consumer is the OWNER itself, which `setProp` already dirties.
//
// So no node writes to another and no follow-up commit is needed. Two seams that do NOT work here,
// measured against the real commit path, so neither is tried again:
//
//   slotDerived alone     marks `node.childHost` and nothing else — ONE node, where a colour change
//                         moves two. `addDerivedNode` is the hop past it.
//   afterCommit           UNREACHABLE for exactly the props that matter. `title` and `color` never
//                         reach the host payload, so a write to either produces a byte-identical
//                         payload and `commitContainer` returns on a no-op ABOVE
//                         `runDeferredAttaches`. Recorded at `IHostBehavior.afterCommit`.
//
// WHY THE OWNER'S FOLD IS BOUND IN `buildStructure` rather than declared as `behavior.foldPayload`.
// It needs two things that are not in the bag it is handed: `onPress` lives in the listener STASH
// (`ownedListeners` diverts it, so `props.onPress` is always undefined), and `focusable` is a
// function of it. `scroll-view/index.android.ts` assigns `owner.payloadFold` from `onWrapChange`
// for the same reason; `attachHostBehavior` sets the field one line BEFORE it calls
// `buildStructure`, so the binding here is what stands.
// ---------------------------------------------------------------------------------------------
// KNOWN DIVERGENCES, stated rather than left to be discovered on a device:
//
// 1. CLOSED 2026-09-09, and it closed by DELETION rather than by a fix. The gap was that all five
//    wrappers rendered TouchableOpacity unconditionally where RN swaps in TouchableNativeFeedback
//    (Button.js:280-283), so a Button faded on Android and committed four nodes where RN ripples
//    and commits three. There is no wrapper left to diverge: `button` is a tag, registered by all
//    five adapters, and the swap above is the only implementation.
//
//    THE ORDER MATTERED AND IS THE REUSABLE HALF. The registry is keyed by TAG, so registering
//    while a wrapper still built its own view and text would have given every Button a SECOND copy
//    of the subtree — the hazard `behaviors/scroll-view/shared.ts` records. Entry, registration and
//    the five deletions are one change, which is also what `touchable-native-feedback` did hours
//    earlier and for the same reason.
//
//    WHAT AN APP SEES, stated because it is a behaviour change and not a refactor: on Android a
//    Button now ripples instead of fading and commits three nodes instead of four. That is the RN
//    parity this whole line of work was for.
//
// 2. CLOSED 2026-09-09, kept for the seam rather than the gap. `aria-disabled` — and an authored
//    `accessibilityState.disabled` — now suppress the press, not just grey the label.
//
//    THE RESOLUTION IS BUTTON'S, NOT THE MACHINE'S, and that asymmetry is the finding. RN hands
//    Pressability the RAW prop (Pressable.js:266), so on a bare `pressable` `aria-disabled` changes
//    only what is ANNOUNCED and the press still fires; resolving it down there would be a new
//    divergence pointing the other way. Button is the outlier (Button.js:337), so it hands the
//    touchable an `IDisabledResolver` (`./pressable`) and `rebuild` calls it at every gesture start.
//
//    A RESOLVER RATHER THAN A WRITE, because writing the answer into `node.props.disabled` LATCHES:
//    `resolveButtonDisabled` short-circuits on `disabled !== undefined`, so the injected value would
//    answer the next resolution as the app's own and the button could never re-enable. Reading per
//    gesture also means a flip needs no commit to reach the machine.
//
//    AND THE PRESS WAS ONLY HALF OF IT. `./touchable-opacity`'s `afterCommit` re-settles the fade
//    when `disabled` moves, and it read the RAW prop — so for an hour after the press half closed, a
//    Button disabled by `aria-disabled` mid-press stayed at its ACTIVE opacity while already
//    refusing the press. It reads through the same resolver now. The general shape: one prop
//    resolved in two places, and closing the first makes the second look done.
//
// 3. CLOSED 2026-09-09, repo-wide, and kept here for the finding rather than the gap. `focusable`
//    was emitted by NOTHING in `core/components` — not a wrapper, not the press behavior — so a
//    keyboard or TV host could focus a disabled button, on every adapter and both paths. RN carries
//    two formulas (`Pressable.js:258` vs the four `Touchable*`, which also require a press handler
//    and a non-disabled state); both now live in `../view/render-pressable` and every behavior and
//    surviving wrapper calls them.
// ---------------------------------------------------------------------------------------------
//
// REGISTRATION IS THE HAZARD, not the machine — see `./pressable` for why each adapter entry does
// a bare `import './register';` that the barrel does not re-export. Registered by ALL FIVE adapters
// since 2026-09-09, in the same commit that deleted the five wrappers, which is what makes it safe:
// while a wrapper still built its own view and text under this tag, registering would have given
// every Button a second copy of the subtree.

import {
  addDerivedNode,
  appendChild,
  createElement,
  createRawText,
  markPropsDirty,
  Platform,
  registerHostBehavior,
  requestCommitFor,
  type IHostBehavior,
  type ISymbioteNode,
  setProp,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import { resolveButtonDisabled } from '../view/render-button';
import {
  booleanOr,
  createPressBehavior,
  type IDisabledResolver,
} from './pressable';
import { nativeFeedbackRefinement } from './touchable-native-feedback';
import { createTouchableOpacityBehavior } from './touchable-opacity';

export const BUTTON_TAG = 'button';

// Read once, like `render-button`'s own module-level `buttonViewStyle`: the platform cannot change
// under a running app, and every test that needs the other branch already has to mock `Platform`
// for `render-button` regardless — which is why this is a branch rather than a `button/` folder
// split. A file split would move the behavior and leave its style half still reading `Platform`.
const IS_ANDROID = Platform.OS === 'android';

// The owner props the derived nodes' styles are derived from. A name missing here is a node frozen
// at its mount value, which is the whole failure mode this list has. `title` is NOT one of them: it
// is redirected by `SLOT_PROPS` and never reaches `setProp` on the owner, so listing it would be
// dead.
const SLOT_DERIVED = [
  'color',
  'disabled',
  'aria-disabled',
  'accessibilityState',
];

// Button.js:386 renders `<Text>{title}</Text>`; the raw text is where that string lives.
const SLOT_PROPS = { title: 'text' };

// What the derived folds read off the owner.
interface IProjection {
  readonly color: string | undefined;
  readonly disabled: boolean | undefined;
}

function stringOr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// `accessibilityState` arrives as `unknown` off `node.props`, and only `disabled` decides anything
// here. Narrowed field by field rather than cast, the idiom `./pressable` uses for the same bag.
function accessibilityDisabled(value: unknown): { disabled?: boolean } {
  if (typeof value !== 'object' || value === null) return {};
  const disabled = Reflect.get(value, 'disabled');
  return typeof disabled === 'boolean' ? { disabled } : {};
}

// Takes the PROP BAG rather than the node, so the owner's own fold — which is handed a bag and not
// a node — resolves the same projection its derived children do.
function projectionOf(props: Readonly<Record<string, unknown>>): IProjection {
  return {
    color: stringOr(props.color),
    // Button.js:337 — `disabled` may be decided by `aria-disabled` or by an authored
    // `accessibilityState.disabled`. The engine folds both into the COMMITTED accessibilityState
    // already; this is the half a payload fold cannot do, which is greying the label.
    disabled: resolveButtonDisabled(
      booleanOr(props.disabled),
      booleanOr(props['aria-disabled']),
      accessibilityDisabled(props.accessibilityState),
    ),
  };
}

// What the press machine reads instead of the raw prop — see KNOWN DIVERGENCES 2. Pure: the
// projection is derived per call and nothing is written back.
const buttonDisabled: IDisabledResolver = props => projectionOf(props).disabled;

/**
 * NO MEMO, and the earlier version's memo is deliberately gone. It guarded `setProp`'s `Object.is`,
 * which a FRESH style object per call can never satisfy — so pushing unconditionally would have
 * dirtied a node on every commit and re-committed forever
 * (`.claude/rules/list-geometry-feedback-loop.md`). A payload fold does not go through `setProp`:
 * its result reaches `reconcile`, which compares against the mirror with a recursive `propsEqual`
 * (commit.ts) and reuses the committed handle when nothing moved. An equal-but-fresh style is
 * therefore not a change, and there is nothing to feed back.
 */
// THE VIEW'S FOLD IS GONE AND WAS NOT PORTED — it was doing nothing, on the only platform where it
// ran. It wrote `style: resolveButtonViewStyle(color, disabled)`, and that function returns the
// constant `buttonViewStyle` on every platform but Android while the view node is built ONLY in the
// non-Android branch of `buildStructure`. `buttonViewStyle` off Android is `{}`. So it read two
// props off its owner, discarded both, and spent a JSI round trip per button per commit to write an
// empty style.
//
// This is the `input-accessory-view` shape again, and the second time this migration has found one:
// a fold's price is the TRIP, not the body, so a fold that does nothing is the worst value in the
// file and deleting it is worth as much as porting one that does a lot.
//
// Proven not to move the payload rather than argued: `button-derived-payload.itest.ts` pins the
// view's committed keys, including with an app-set `color` — which lands on the LABEL here and must
// not reach this node.

// THE LABEL TEXT'S TAG. Its style is a function of the BUTTON's `color` and `disabled`, and the
// button is this node's grandparent on iOS (`button -> view -> text`) and its parent on Android —
// so the rule asks for the NEAREST BUTTON ancestor rather than for a fixed number of hops, which is
// the same question a CSS ancestor selector asks and is true on both trees.
//
// `foldButtonLabelStyle` in `SymbioteFabricProps.cpp`, reached through `IAncestorLookup`. That seam
// was the thing this fold was waiting for: `ownerProps` answers "my parent" and this node's parent
// is the wrapping view, which knows none of it.
export const BUTTON_LABEL_TEXT_TAG = 'button-label-text';

// The label's own tag. A raw text carrying one looks odd and is not: it has no props an app can
// write, but its CONTENT is the platform's decision here — RN renders a button's title uppercased on
// Android and verbatim elsewhere (`Button.js:352-353`), which is a user-agent choice about a control
// rather than anything the app asked for.
//
// That is what the fold here used to do, and it is `foldButtonLabel` in `SymbioteFabricProps.cpp`
// now, reached off this tag. `button-payload.itest.ts` recorded "a raw text carries no tag at all,
// so there is nothing for a tag-keyed rule to key on" — true of `createRawText`'s old signature, not
// of raw texts, and it takes a tag now for exactly this.
export const BUTTON_LABEL_TAG = 'button-label';

// ---- the Android touchable -------------------------------------------------------------------

// Button.js:281-284. Not two variants of one component: see the tree diagram at the top for what
// wrapping instead of cloning costs. The Android arm composes the bare press machine, so no
// opacity value is opened and no fade runs — the ripple IS the feedback there.
//
// The refinement is TNF's own and now lives with TNF (`./touchable-native-feedback`). This file
// held a private copy while the `touchable-native-feedback` TAG did not exist and its wrappers
// still wrapped where RN clones; the tag landed, the responder node was already a parameter, and
// one caller became two.
const touchable: Pick<
  IHostBehavior,
  'attach' | 'detach' | 'ownedListeners' | 'afterCommit'
> = IS_ANDROID
  ? createPressBehavior(nativeFeedbackRefinement, buttonDisabled)
  : createTouchableOpacityBehavior(buttonDisabled);

// ---- the owner's own payload -------------------------------------------------------------------

/**
 * The wrapper-body folds, over the touchable's own. What is deliberately NOT here:
 *
 *   accessible          the touchable's fold already applies `accessible !== false`, which is
 *                       exactly RN's split — Button forwards the caller's value RAW (Button.js:365)
 *                       and the touchable one level down defaults it (TouchableOpacity.js:303).
 *   accessibilityState  the engine's aria fold gives `ariaDisabled ?? state.disabled` and the press
 *                       fold then merges `props.disabled` over it, which composes to RN's
 *                       `props.disabled ?? aria ?? state.disabled` — the same value, with
 *                       busy/checked/expanded/selected preserved, without a Button-specific fold.
 *
 * THE TOUCHABLE'S HALF IS NO LONGER A FUNCTION ON EITHER PLATFORM, and the absence is the design
 * rather than a gap: neither `createPressBehavior` nor `createTouchableOpacityBehavior` has a
 * `foldPayload` any more, because both rules moved into the engine (`foldPressableProps` and
 * `foldIdAlias`, `SymbioteFabricProps.cpp`), which names `button` among the tags it serves. So the
 * same work happens, one layer down and before this fold runs — the order is unchanged, the trip
 * into JS is gone.
 *
 * The composition used to be spelled `touchable.foldPayload === undefined ? props : ...`, and that
 * shape is deleted rather than left standing at its `undefined` branch: a conditional call through
 * a field nothing assigns any more is a whole rule that vanishes silently the day the field is
 * removed, which is exactly how it would have gone unnoticed here.
 */
// `focusable` LEFT THIS FOLD ON 2026-09-18, and with it the whole fold off Android.
//
// It was the last thing here that ran on both platforms, and it stayed because its middle leg is
// `onPress !== undefined` — an owned listener, stashed in JS. That bit crosses now
// (`OP_SET_OWNED_LISTENER`), and Button's three-way `disabled` was only ever three PROPS, so
// `foldButtonProps` resolves the expression itself. It reads the AUTHORED bag rather than the folded
// one, which is the same Trap A correction this fold carried as `projectionOf(propsOf(node))`.
//
// The ANDROID half went the same day, once the test host grew an arm that compiles `#ifdef ANDROID`
// (`tests/CMakeLists.txt`, `SYMBIOTE_PLATFORM_ANDROID`). It is inside `foldButtonProps` now: the
// Material view style and the theme's selectable background, which TNF clones onto this very node
// (`TouchableNativeFeedback.js:339`) because it renders no view of its own.
//
// SO BUTTON BINDS NO FOLD ON EITHER PLATFORM, and it is the first primitive to reach that with a
// subtree — four nodes, four crossings per commit when this migration started.
//
// Contract: `core/engine/cpp/tests/js/button-payload.itest.ts` for the platform-invariant half and
// `android-rules.itest.ts` for the style, the colour override and the disabled greying.

/**
 * Builds the whole subtree, once, at `attachHostBehavior`.
 *
 * RETURNS THE RAW TEXT. RN's Button declares no `children` prop and renders none, so the slot is
 * not where the app's children go — it is where its `title` goes, which is what `SLOT_PROPS`
 * redirects onto it. `childHost` is also the GATE on both engine seams this behavior uses:
 * `slotDerived`'s mark and the prop redirect are both skipped unless it is set (node.ts), so
 * returning `undefined` would leave the whole subtree frozen at its mount values.
 */
function buildStructure(node: ISymbioteNode): ISymbioteNode {
  const textDescriptor = descriptorFor('text');
  const text = createElement(
    textDescriptor.component,
    textDescriptor.isText,
    BUTTON_LABEL_TEXT_TAG,
  );
  // RN's two Text defaults are NOT written here, and that is deliberate as of 2026-09-18: they are
  // the platform's, applied by the payload builder to every `RCTText` (`foldTextDefaults`), so this
  // node inherits them for being a text rather than for being handed them. Seeding them was two
  // writes per button per commit producing the payload the builder already produces — the shape
  // `seedTextDefaults` had in three adapters. `button-derived-payload.itest.ts` reads them off the
  // committed payload and is what proves the node still gets them.
  //
  // Empty until the redirected `title` arrives. The commit walk drops an empty raw text
  // (`isEmptyRawText`, node.ts), so no Fabric node exists for it until it has a label — and that
  // check reads `props.text`, which the redirect writes, not the fold's uppercased output.
  const label = createRawText('', BUTTON_LABEL_TAG);
  // The hop `slotDerived` alone does not make: it marks the slot (the label), and this is past it.
  addDerivedNode(node, text);
  appendChild(text, label);
  if (IS_ANDROID) {
    // No fourth node: TNF clones onto the styled view, so the host IS it and the label's parent
    // hangs straight off it.
    appendChild(node, text);
  } else {
    const viewDescriptor = descriptorFor('view');
    const view = createElement(
      viewDescriptor.component,
      viewDescriptor.isText,
      'view',
    );
    // No fold: see the note where `viewFold` was. Off Android this node's style was `{}` and this
    // branch is the only one that builds it, so the fold was a crossing bought for an empty object.
    addDerivedNode(node, view);
    appendChild(view, text);
    // Lands on the owner, because `node.childHost` is still undefined here — the engine assigns it
    // from what this returns. That ordering is why `buildStructure` RETURNS the slot instead of
    // setting the field itself.
    appendChild(node, view);
  }
  // ANDROID ONLY since 2026-09-18. See the header: the owner's fold needs its own node, and this
  // NOTHING IS BOUND HERE ON EITHER PLATFORM as of 2026-09-18, which is the point — a fold with an
  // empty body still costs a full JSI round trip per commit, so leaving one that returns its input
  // is the worst value available (`input-accessory-view`, and Button's own `viewFold`).
  return label;
}

// `focusable` is a function of a LISTENER, and a listener flip changes no payload by itself — so
// the commit after it is a no-op and no fold re-runs (`IHostBehavior.onOwnedListenerChange`).
function onOwnedListenerChange(node: ISymbioteNode, name: string): void {
  if (name !== 'press') return;
  markPropsDirty(node);
  requestCommitFor(node);
}

// Idempotent: an adapter entry may be imported more than once in a bundle.
export function registerButtonBehavior(): void {
  // `attach`/`detach` come from the touchable unwrapped: the internal nodes are ordinary children
  // that leave with the sweep, and each carries only a pure fold, so this behavior owns no per-node
  // runtime of its own to release.
  //
  const behavior: IHostBehavior = {
    ...touchable,
    buildStructure,
    onOwnedListenerChange,
    slotProps: SLOT_PROPS,
    slotDerived: SLOT_DERIVED,
  };
  // The two DERIVED nodes' tags, registered with no runtime at all. A tag reaches C++ only through
  // `recordSetTag`, which `attachHostBehavior` emits, so a tag nobody registered carries an empty
  // `tagName` in the host and no rule fires for it — however the rule is written. Same shape as the
  // ActivityIndicator spinner's and ImageBackground's inner image.
  //
  // A registration is how this codebase declares a tag HAS platform semantics, which is exactly the
  // claim: the label's style is RN's, not the app's.
  const derived: IHostBehavior = { attach() {}, detach() {} };
  registerHostBehavior(BUTTON_LABEL_TEXT_TAG, derived);
  registerHostBehavior(BUTTON_LABEL_TAG, derived);
  registerHostBehavior(BUTTON_TAG, behavior);
}
