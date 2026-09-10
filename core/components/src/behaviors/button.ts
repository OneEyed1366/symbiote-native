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
//            └ view   RCTView      resolveButtonViewStyle(color, disabled) — `{}` here
//              └ text RCTText      resolveButtonTextStyle(color, disabled) + RN's Text defaults
//                └ raw RCTRawText  resolveButtonTitle(title)                       FOUR nodes
//
//   Android  button   RCTView      the styled button view, CLONED onto: the responder, the ripple
//            │                     background, the whole a11y fold. No fade, no wrapper.
//            └ text   RCTText
//              └ raw  RCTRawText   UPPERCASED (Button.js:352-353)                 THREE nodes
//
// EVERY FOLD IS ALREADY WRITTEN AND TESTED in `../view/render-button`; nothing here re-derives one.
// What is new is only WHERE they run: on engine nodes, instead of in a component body.
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
  appListenerFor,
  createElement,
  createRawText,
  markPropsDirty,
  Platform,
  registerHostBehavior,
  requestCommitFor,
  type IHostBehavior,
  type IPayloadFold,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import { resolveTextProps } from '../text-props';
import {
  BUTTON_ACCESSIBILITY_ROLE,
  resolveButtonDisabled,
  resolveButtonImportantForAccessibility,
  resolveButtonTextStyle,
  resolveButtonTitle,
  resolveButtonViewStyle,
} from '../view/render-button';
import {
  backgroundProps,
  selectableBackground,
} from '../view/render-touchable-native-feedback';
import { resolveTouchableFocusable } from '../view/render-pressable';
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
function viewFold(owner: ISymbioteNode): IPayloadFold {
  return props => {
    const { color, disabled } = projectionOf(owner.props);
    return { ...props, style: resolveButtonViewStyle(color, disabled) };
  };
}

function textFold(owner: ISymbioteNode): IPayloadFold {
  return props => {
    const { color, disabled } = projectionOf(owner.props);
    return {
      ...props,
      style: resolveButtonTextStyle(color, disabled),
      // RN puts `disabled` on the Text as well (Button.js:386) — a real RCTText prop read by
      // Android's accessibility layer, and not the same thing as the greyed colour above.
      disabled,
    };
  };
}

// Reads its OWN `text`, which `SLOT_PROPS` redirected the app's `title` into — no owner closure, so
// the fold is shared by every button. `fabricProps` reads only `.text` off a raw-text fold.
const labelFold: IPayloadFold = props => ({
  text: resolveButtonTitle(stringOr(props.text) ?? ''),
});

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
  'attach' | 'detach' | 'foldPayload' | 'ownedListeners' | 'afterCommit'
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
 */
function ownerFold(node: ISymbioteNode): IPayloadFold {
  return props => {
    const next: Record<string, unknown> = {
      ...(touchable.foldPayload === undefined
        ? props
        : touchable.foldPayload(props)),
    };
    next.accessibilityRole = BUTTON_ACCESSIBILITY_ROLE;
    // 'no' is the only value the resolver moves (Button.js:356), so checking for it IS the
    // narrowing this bag needs — the shared resolver still owns what 'no' becomes.
    if (next.importantForAccessibility === 'no')
      next.importantForAccessibility =
        resolveButtonImportantForAccessibility('no');
    // Re-mapped, so the raw name must not also reach Fabric. Where the wrappers put it too — the
    // pressable owns sound suppression (Button.js:377 hands `touchSoundDisabled` to the touchable).
    if (Object.hasOwn(next, 'touchSoundDisabled')) {
      next.android_disableSound = next.touchSoundDisabled;
      delete next.touchSoundDisabled;
    }
    const { color, disabled } = projectionOf(props);
    // TouchableOpacity.js:336 and TouchableNativeFeedback.js:369 — the SAME expression, so the tag
    // owes it on both platforms. `onPress` is an owned name, so it is in the stash and never in
    // `props`; a flip of it dirties nothing by itself, which `onOwnedListenerChange` answers.
    next.focusable = resolveTouchableFocusable(
      booleanOr(props.focusable),
      appListenerFor(node, 'press') !== undefined,
      disabled,
    );
    if (IS_ANDROID) {
      // TNF renders no view, it CLONES onto Button's `<View style={buttonStyles}>`
      // (TouchableNativeFeedback.js:339), so this host IS that view. Overwritten rather than merged
      // because RN's Button declares no `style` prop at all — there is nothing to compose with.
      next.style = resolveButtonViewStyle(color, disabled);
      // Button passes no `background` and no `useForeground`, so TNF resolves the theme's
      // selectable background onto the background slot (TouchableNativeFeedback.js:343-348,
      // :402). The dicts are the shared factories', never restated here.
      Object.assign(next, backgroundProps(selectableBackground(), false));
    }
    // Read by the folds above and declared by no ViewConfig. A key Fabric does not know throws
    // nothing, logs nothing and paints nothing, so the strip has to be here or it is never noticed.
    // `title` needs none — `SLOT_PROPS` redirects it before it can land on this node.
    delete next.color;
    return next;
  };
}

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
    'text',
  );
  // RN's Text.js applies these to every non-virtual Text on its way to native, and a hand-written
  // host tag inherits nothing a `<Text>` component did — Svelte's Button clipped long labels
  // mid-word for exactly this reason (`.claude/rules/host-primitive-tier.md`, "The THIRD path").
  // Constants, because the app cannot reach this node to override them.
  text.props = resolveTextProps({});
  // Empty until the redirected `title` arrives. The commit walk drops an empty raw text
  // (`isEmptyRawText`, node.ts), so no Fabric node exists for it until it has a label — and that
  // check reads `props.text`, which the redirect writes, not the fold's uppercased output.
  const label = createRawText('');
  text.payloadFold = textFold(node);
  label.payloadFold = labelFold;
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
    view.payloadFold = viewFold(node);
    addDerivedNode(node, view);
    appendChild(view, text);
    // Lands on the owner, because `node.childHost` is still undefined here — the engine assigns it
    // from what this returns. That ordering is why `buildStructure` RETURNS the slot instead of
    // setting the field itself.
    appendChild(node, view);
  }
  // See the header: the owner's fold needs its own node, and this runs after
  // `attachHostBehavior` has already written `behavior.foldPayload` into the field.
  node.payloadFold = ownerFold(node);
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
  // No `foldPayload` here on purpose — `buildStructure` binds the owner's fold to its node.
  const behavior: IHostBehavior = {
    ...touchable,
    foldPayload: undefined,
    buildStructure,
    onOwnedListenerChange,
    slotProps: SLOT_PROPS,
    slotDerived: SLOT_DERIVED,
  };
  registerHostBehavior(BUTTON_TAG, behavior);
}
