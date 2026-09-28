// Button as an ENGINE-NODE behavior: RN's Button is a touchable wrapping a View wrapping a Text
// (Button.js:363-388) with no children, so `buildStructure` owns the whole subtree as a
// PROJECTION of `title`/`color`/`disabled`.

// The touchable differs by platform (Button.js:281-284): iOS's TouchableOpacity WRAPS (an extra
// Animated.View, FOUR nodes total); Android's TouchableNativeFeedback clones onto the child, so
// Button's own view IS the responder (THREE nodes — ripple + a11y cloned onto it, no fade).

// `title` is a rename via `slotProps`; `color`/`disabled` are a per-node fold over the owner via
// `slotDerived`/`addDerivedNode`. Neither needs a follow-up commit: neither prop ever reaches the
// host payload, so an `afterCommit` write on either would be a byte-identical no-op.

// The owner's fold binds in `buildStructure`, not `behavior.foldPayload`: it needs `onPress` from
// the listener stash (`props.onPress` is always undefined) and `focusable`, derived from it —
// same reason `scroll-view/index.android.ts` assigns `owner.payloadFold` from `onWrapChange`.

// Registered by all five adapters — see `./pressable` for why via a bare `import './register'`.

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

// Read once: the platform cannot change under a running app. A branch, not a `button/` folder
// split, since a split would move the behavior but leave its style half still reading Platform.
const IS_ANDROID = Platform.OS === 'android';

// The owner props the derived nodes' styles are derived from. A name missing here is a node
// frozen at its mount value. `title` is NOT one of them — SLOT_PROPS redirects it, so it never
// reaches setProp on the owner.
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

// NO MEMO: a payload fold doesn't go through setProp, so its result reaches reconcile, which
// compares against the mirror with a recursive propsEqual and reuses the committed handle when
// nothing moved. An equal-but-fresh style is not a change, so there's nothing to feed back.

// The view's fold is gone, not ported: it wrote a style that's the constant `buttonViewStyle` on
// every platform but Android, where the view node isn't even built — so it read two props,
// discarded both, and paid a JSI round trip per button per commit for an empty style.

// Proven, not argued: button-derived-payload.itest.ts pins the view's committed keys, including
// with an app-set `color`, which lands on the LABEL and must not reach this node.

// THE LABEL TEXT'S TAG. Its style is a function of the button's `color`/`disabled`, and the button
// is this node's grandparent on iOS but its parent on Android — so foldButtonLabelStyle asks for
// the NEAREST BUTTON ancestor rather than a fixed hop count, true on both trees.
export const BUTTON_LABEL_TEXT_TAG = 'button-label-text';

// The label's own tag, on the raw text that holds the title. Its Android uppercase (`Button.js:352`)
// is `uppercaseTitle` below, in JS: the C++ tag rule it briefly was could only do ASCII.
export const BUTTON_LABEL_TAG = 'button-label';

// ---- the Android touchable -------------------------------------------------------------------

// Not two variants of one component: see the tree diagram at the top for what wrapping instead
// of cloning costs. The Android arm composes the bare press machine, so no opacity value opens
// and no fade runs — the ripple IS the feedback there. The refinement lives with TNF.
const touchable: Pick<
  IHostBehavior,
  'attach' | 'detach' | 'ownedListeners' | 'afterCommit'
> = IS_ANDROID
  ? createPressBehavior(nativeFeedbackRefinement, buttonDisabled)
  : createTouchableOpacityBehavior(buttonDisabled);

// ---- the owner's own payload -------------------------------------------------------------------

// Button binds NO `payloadFold` on either platform: the touchable's half is in the engine
// (`foldPressableProps`/`foldIdAlias`), the Android style/ripple/focusable half is
// `foldButtonProps` in C++. Asserted in `button-payload.itest.ts` / `android-rules.itest.ts`.

// Builds the whole subtree, once, at attachHostBehavior. RETURNS THE RAW TEXT: RN's Button
// renders no children, so the slot is where `title` goes. `childHost` also gates both engine
// seams this behavior uses, so returning undefined would freeze the whole subtree at mount values.
function buildStructure(node: ISymbioteNode): ISymbioteNode {
  const textDescriptor = descriptorFor('text');
  const text = createElement(
    textDescriptor.component,
    textDescriptor.isText,
    BUTTON_LABEL_TEXT_TAG,
  );
  // RN's two Text defaults are NOT written here: they're the platform's, applied to every RCTText,
  // so this node inherits them for being text, not for being handed them.

  // Empty until the redirected `title` arrives: the commit walk drops an empty raw text, so no
  // Fabric node exists for it until it has a label.
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
  // No fold bound here on either platform: an empty-body fold still costs a full JSI round trip
  // per commit, worse than not having one at all.
  return label;
}

// `focusable` is a function of a LISTENER, and a listener flip changes no payload by itself — so
// the commit after it is a no-op and no fold re-runs (`IHostBehavior.onOwnedListenerChange`).
function onOwnedListenerChange(node: ISymbioteNode, name: string): void {
  if (name !== 'press') return;
  markPropsDirty(node);
  requestCommitFor(node);
}

// Button.js:352-353 — Android renders `title.toUpperCase()`. Here in JS rather than in the C++ tag
// rules because only JavaScript's uppercase is full Unicode (Cyrillic, `ß` -> `SS`); the host has
// no ICU, and an ASCII port left every non-Latin title in its authored case.
function uppercaseTitle(slotKey: string, value: unknown): unknown {
  return slotKey === 'text' && typeof value === 'string'
    ? value.toUpperCase()
    : value;
}

// Idempotent: an adapter entry may be imported more than once in a bundle.
export function registerButtonBehavior(): void {
  // `attach`/`detach` come from the touchable unwrapped: the internal nodes are ordinary children
  // that leave with the sweep, so this behavior owns no per-node runtime of its own to release.
  const behavior: IHostBehavior = {
    ...touchable,
    buildStructure,
    onOwnedListenerChange,
    slotProps: SLOT_PROPS,
    slotDerived: SLOT_DERIVED,
    ...(IS_ANDROID ? { slotValueFor: uppercaseTitle } : {}),
  };
  // The two DERIVED nodes' tags, registered with no runtime at all. A tag reaches C++ only through
  // recordSetTag, which attachHostBehavior emits — a tag nobody registered fires no rule at all.
  // A registration is how this codebase declares a tag HAS platform semantics.
  const derived: IHostBehavior = { attach() {}, detach() {} };
  registerHostBehavior(BUTTON_LABEL_TEXT_TAG, derived);
  registerHostBehavior(BUTTON_LABEL_TAG, derived);
  registerHostBehavior(BUTTON_TAG, behavior);
}
