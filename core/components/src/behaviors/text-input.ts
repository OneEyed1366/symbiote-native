// TextInput's machine, on the engine node instead of inside a framework component. It holds three
// native-state mirrors (event count, last native text, focus), commands text back down on
// divergence, fires focus once at mount for autoFocus, composes a press machine for tap-to-focus.

// Needed a new engine hook where Pressable did not: the controlled handshake is driven by a PROP
// (`value`), and a tag has no render to re-run the divergence check, so afterCommit is the beat.

// The order of the two commit hooks is load-bearing, pinned by a test: attachAfterCommit seeds
// lastNativeText from mount-time props, afterCommit compares against that seed. Reversed, the
// first beat would see an empty mirror and command a redundant write on every input.
import {
  appListenerFor,
  blurTextInput,
  dispatchViewCommand,
  dlog,
  focusTextInput,
  Platform,
  propOf,
  propsOf,
  registerHostBehavior,
  requestCommitFor,
  setBehaviorListener,
  setInputBlurred,
  setInputFocused,
  setProp,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  attachPressMachine,
  detachPressMachine,
  type IPressConfigRefinement,
} from './pressable';

import {
  eventCountFromChange,
  foldText,
  INITIAL_EVENT_COUNT,
  SELECTION_NONE,
  shouldCommandText,
  textFromChange,
  type ITextInputChangeEvent,
  type ITextInputHandle,
} from '../state/text-input';

// Both spellings, because `multiline` picks between two Fabric views and the TAG is what decides.
// The behavior is registered for both so it does not care which one the app wrote.
export const TEXT_INPUT_TAG = 'text-input';
export const TEXT_INPUT_MULTILINE_TAG = 'text-input-multiline';

interface IBehaviorState {
  // The count native last acknowledged, echoed back on every controlled write so native's own
  // `eventLag` lands on 0 and the write applies rather than being discarded as stale.
  mostRecentEventCount: number;
  // The last text native holds, as far as JS knows. Seeded from the mount-time value because the
  // `text` prop already carried that value down at createNode — so the FIRST value is not a
  // divergence and must NOT re-command.
  lastNativeText: string | undefined;
  // Mirrored from the focus/blur events. Native exposes no synchronous focus getter, and RN's own
  // TextInputState holds the same mirror for the same reason.
  isFocused: boolean;
  // Whether the mirror was seeded on THIS commit, so the beat that follows has nothing to compare:
  // attachAfterCommit and afterCommit both run on the landing commit, and the first seeds
  // lastNativeText from the value the second would read back. TEXT ONLY — see lastNativeSelection.
  isMirrorFreshlySeeded: boolean;

  // What native last acknowledged for the caret, seeded at the SENTINEL rather than left absent —
  // a real selection always differs from it, so an authored `selection` moves the caret on the
  // very first commit, with no preceding value write.
  lastNativeSelection: { start: number; end: number };
}

const states = new WeakMap<ISymbioteNode, IBehaviorState>();

function stateOf(node: ISymbioteNode): IBehaviorState | undefined {
  return states.get(node);
}

/** The same narrowing, for a value already in hand — see `attachAfterCommit`'s single read. */
function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// `{ start, end? }` narrowed at runtime. `end` defaults to `start` — a caret, RN's own reading when
// only one bound is given — and both fall back to SELECTION_NONE when the prop is absent.
function selectionOf(value: unknown): { start: number; end: number } {
  if (typeof value !== 'object' || value === null) {
    return { start: SELECTION_NONE, end: SELECTION_NONE };
  }
  const bag: Record<string, unknown> = { ...value };
  const start = typeof bag.start === 'number' ? bag.start : SELECTION_NONE;
  const end = typeof bag.end === 'number' ? bag.end : start;
  return { start, end };
}

// The app's own callback for an owned event name, read from the STASH rather than from
// the props: every name below is in `ownedListeners`, so `routeProp` parks the app's handler
// beside the machine's instead of overwriting it.
function callAppListener(
  node: ISymbioteNode,
  name: string,
  event: ISymbioteEvent,
): void {
  const listener = appListenerFor(node, name);
  if (typeof listener === 'function') listener(event);
}

// `onValueChange(event)` is NOT a Fabric event — it lives on the node as a plain prop key, and
// fabricProps drops it on the way to native.

// The listener takes ONE argument, `text` carried on the event itself, not `(text, event)` —
// Svelte's compiler forces every `on*` attribute through a wrapper that calls with exactly one
// argument, always a real object, so a bare string as the sole argument crashes.
function callValueChange(
  node: ISymbioteNode,
  text: string,
  event: ISymbioteEvent,
): void {
  const listener = propOf(node, 'onValueChange');
  if (typeof listener !== 'function') return;
  const changeEvent: ITextInputChangeEvent = Object.assign(event, { text });
  listener(changeEvent);
}

// `multiline` picks between TWO Fabric views, so the TAG decides it and no later prop write moves
// a node between them. An author writing the tag can still spell a contradicting `multiline`
// prop, which silently commits the wrong view with nothing to read.

// So the tag is the authority: a contradicting prop throws rather than being quietly overridden.
// The throw stays in each adapter's own prop-write path, not here, since a throw from foldPayload
// inside the commit surfaces a tick later with no frame naming the call site.

// The alias/fold rule lives in the engine now (foldTextInputAliases in SymbioteFabricProps.cpp),
// UA behavior mapping the web-facing spelling onto RN's own — a property of the platform, paid
// once, not per app or framework. No TypeScript twin: the itest reads the payload directly.

// What stays here is the MACHINE: the controlled-value handshake, event-count acknowledgement,
// autofocus — running at gesture/lifecycle rate and calling back into app code.

function onChange(node: ISymbioteNode, event: ISymbioteEvent): void {
  const state = stateOf(node);
  if (state === undefined) return;

  // Mirrors vendor's own ordering: `onChange` first, then `onChangeText`, unconditionally on
  // every native change, and only THEN the mirrors update.
  callAppListener(node, 'change', event);

  const text = textFromChange(event);
  if (text !== undefined) {
    // Read directly, not owned/stashed: like onValueChange, onChangeText isn't a Fabric event
    // name, so nothing routes it and nothing native could overwrite it.
    const onChangeText = propOf(node, 'onChangeText');
    if (typeof onChangeText === 'function') {
      onChangeText(Object.assign(event, { text }));
    }
    // `onValueChange` has no vendor counterpart — it is our own repair for the fold the component
    // wrapper used to do — so its position relative to `onChangeText` carries no vendor constraint.
    callValueChange(node, text, event);
    // The mirror, after both callbacks, matching vendor's own ordering.
    state.lastNativeText = text;
  }
  // Ordering: record the text mirror before the count, so the acknowledged count never runs ahead
  // of the text it stands for. A count without its text makes the next controlled write echo an
  // acknowledgement native has not actually given.
  const count = eventCountFromChange(event);
  if (count !== undefined) {
    state.mostRecentEventCount = count;
    // Native READS this prop, so the mirror is not enough — it has to reach the payload. Same shape
    // as the press machine's `setNodePressed` + `requestCommitFor`: a behavior writing a prop owes
    // the commit, because nothing else is going to ask for one.
    setProp(node, 'mostRecentEventCount', count);
    requestCommitFor(node);
  }
}

function onFocus(node: ISymbioteNode, event: ISymbioteEvent): void {
  const state = stateOf(node);
  if (state !== undefined) state.isFocused = true;
  // App-wide, so `Keyboard.dismiss()` can blur this input without holding a ref to it.
  setInputFocused(node);
  callAppListener(node, 'focus', event);
}

function onBlur(node: ISymbioteNode, event: ISymbioteEvent): void {
  const state = stateOf(node);
  if (state !== undefined) state.isFocused = false;
  setInputBlurred(node);
  callAppListener(node, 'blur', event);
}

// The out-of-commit half of the check afterCommit runs on every commit: given the mirror already
// updated from a real native report, send the authored `selection` back down if it still
// disagrees. Kept separate from afterCommit's own dispatch to avoid a double command.
function correctSelectionIfNeeded(
  node: ISymbioteNode,
  state: IBehaviorState,
): void {
  const props = propsOf(node);
  const { start, end } = selectionOf(props.selection);
  const selectionAuthored = start !== SELECTION_NONE || end !== SELECTION_NONE;
  if (
    !selectionAuthored ||
    (state.lastNativeSelection.start === start &&
      state.lastNativeSelection.end === end)
  ) {
    return;
  }
  const text = foldText(
    stringFrom(props.value),
    stringFrom(props.defaultValue),
  );
  dlog(
    `TextInput behavior: setTextAndSelection (selection-change snap-back) count=${state.mostRecentEventCount}`,
  );
  dispatchViewCommand(node, 'setTextAndSelection', [
    state.mostRecentEventCount,
    text,
    start,
    end,
  ]);
  state.lastNativeSelection = { start, end };
}

// Forwards to the app FIRST, then folds the real native position into lastNativeSelection. With
// no render to ride the mirror update, correctSelectionIfNeeded is called directly right after.
function onSelectionChange(node: ISymbioteNode, event: ISymbioteEvent): void {
  callAppListener(node, 'selectionChange', event);
  const state = stateOf(node);
  if (state === undefined) return;
  const native = selectionOf(event.nativeEvent.selection);
  if (native.start === SELECTION_NONE && native.end === SELECTION_NONE) return;
  state.lastNativeSelection = native;
  correctSelectionIfNeeded(node, state);
}

// The same Pressability class every Touchable uses, wired so a tap inside an authored `hitSlop`
// but outside the native view's own focus zone still focuses the input. onPressIn/onPressOut need
// no wrapping — configFor's defaults already forward them raw.
const focusOnPress: IPressConfigRefinement = (node, config) => ({
  ...config,
  onPress(event) {
    config.onPress?.(event);
    if (propOf(node, 'editable') !== false) {
      dlog('TextInput behavior: press -> focus command');
      dispatchViewCommand(node, 'focus', []);
    }
  },
});

// One node holds exactly one press machine (`./pressable`'s own constraint), so these join
// TextInput's existing 'change'/'focus'/'blur' owned names rather than replacing them — none of
// the six collide with those three.
const PRESS_LISTENERS: readonly string[] = [
  'press',
  'pressIn',
  'pressOut',
  'pressMove',
  'longPress',
  'startShouldSetResponder',
  'responderMove',
  'responderTerminationRequest',
];

function attach(node: ISymbioteNode): void {
  states.set(node, {
    mostRecentEventCount: INITIAL_EVENT_COUNT,
    lastNativeText: undefined,
    isFocused: false,
    isMirrorFreshlySeeded: false,
    lastNativeSelection: { start: SELECTION_NONE, end: SELECTION_NONE },
  });
  // The mirror's seed must reach the PAYLOAD too, not just this state object — otherwise the tag
  // carries no `mostRecentEventCount` key until the user types.

  // No `requestCommitFor` here: at create the renderer commits anyway, and on a re-attach the key
  // is already at this value, so `setProp`'s identity guard makes the write a no-op.
  setProp(node, 'mostRecentEventCount', INITIAL_EVENT_COUNT);
  setBehaviorListener(node, 'change', event => onChange(node, event));
  setBehaviorListener(node, 'focus', event => onFocus(node, event));
  setBehaviorListener(node, 'blur', event => onBlur(node, event));
  setBehaviorListener(node, 'selectionChange', event =>
    onSelectionChange(node, event),
  );
  attachPressMachine(node, {
    refine: focusOnPress,
    cancelableOf: textInputCancelable,
  });
}

// TextInput.js:597 with its `rejectResponderTermination = true` default (:905): iOS keeps the
// gesture unless the app opts in; Android hands Pressability `null`, i.e. its own default (yield).
function textInputCancelable(source: ISymbioteNode): boolean | undefined {
  if (Platform.OS !== 'ios') return undefined;
  const reject = propOf(source, 'rejectResponderTermination');
  return !(reject === undefined || Boolean(reject));
}

// The first commit is the earliest point where the node has BOTH its props and a Fabric tag. The
// mirror needs the first, `autoFocus` needs the second.
function attachAfterCommit(node: ISymbioteNode): void {
  const state = stateOf(node);
  if (state === undefined) return;
  // ONE question, not three: propOf crosses the host boundary per call, so propsOf fetches the
  // whole bag instead, handing back the host's own object when nothing is stashed.
  const props = propsOf(node);
  state.lastNativeText = foldText(
    stringFrom(props.value),
    stringFrom(props.defaultValue),
  );
  state.isMirrorFreshlySeeded = true;

  if (props.autoFocus !== true) return;
  // Driven in JS, not a native `autoFocus` prop (RN declares one but we don't forward it). Routed
  // through focusTextInput, not a raw command, so it also updates the app-wide focus tracker.
  dlog('TextInput behavior: autoFocus -> focus command');
  focusTextInput(node);
}

// The controlled handshake. A plain prop re-push would race the user's keystrokes — native may have
// text JS has not seen yet — so the command carrying the acknowledged count is the only stale-safe
// path, and `shouldCommandText` is what keeps it a no-op unless the value genuinely diverged.
function afterCommit(node: ISymbioteNode): void {
  const state = stateOf(node);
  if (state === undefined) return;
  // The seed ran on this same commit, so the TEXT comparison below is already decided. SELECTION
  // is not seeded by anything, so it's checked regardless — an authored `selection` must move the
  // caret on this very commit.
  const freshlySeeded = state.isMirrorFreshlySeeded;
  if (freshlySeeded) state.isMirrorFreshlySeeded = false;

  // ONE crossing for the whole bag, not three — `attachAfterCommit`'s own reasoning: `propOf` per
  // key is a JSI read per key, and this runs on every commit a text input is dirty in.
  const props = propsOf(node);
  const value = stringFrom(props.value);
  const textDiverged =
    !freshlySeeded && shouldCommandText(state.lastNativeText, value);

  // SELECTION_NONE (-1) is RN's "leave the cursor where native put it" sentinel, so an absent
  // selection must not read as position 0, or every controlled write would jump the caret to front.
  const { start, end } = selectionOf(props.selection);
  const selectionAuthored = start !== SELECTION_NONE || end !== SELECTION_NONE;
  const selectionDiverged =
    selectionAuthored &&
    (state.lastNativeSelection.start !== start ||
      state.lastNativeSelection.end !== end);

  if (!textDiverged && !selectionDiverged) return;

  // `TextInput.js`'s own `text` — `value ?? defaultValue`, sent verbatim whichever half diverged,
  // never the raw `value` alone: an uncontrolled input moving only its caret has no `value` to send.
  const text = foldText(value, stringFrom(props.defaultValue));

  dlog(
    `TextInput behavior: setTextAndSelection count=${state.mostRecentEventCount} ` +
      `text=${JSON.stringify(text)}`,
  );
  dispatchViewCommand(node, 'setTextAndSelection', [
    state.mostRecentEventCount,
    text,
    start,
    end,
  ]);
  if (textDiverged) state.lastNativeText = value;
  if (selectionDiverged) state.lastNativeSelection = { start, end };
}

function detach(node: ISymbioteNode): void {
  // RN blurs a focused input on unmount (TextInput.js's useLayoutEffect cleanup) so native
  // and the app-wide focus tracker don't outlive a node that's gone. `blurTextInput` already
  // no-ops when this node isn't the currently-focused one.
  blurTextInput(node);
  states.delete(node);
  detachPressMachine(node);
}

// The imperative API RN exposes on a TextInput ref, built over the engine node. `clear` and
// `setSelection` reuse setTextAndSelection, the same stale-safe path a controlled write takes.
export function buildTextInputHandle(node: ISymbioteNode): ITextInputHandle {
  return {
    // Forwarded, not re-implemented: these are the engine node's own prototype methods, and a
    // TextInput ref that lacks them is poorer than every other host ref for no reason. See
    // `ITextInputHandle` for why the handle is a UNION rather than the five below.
    measure: callback => node.measure(callback),
    measureInWindow: callback => node.measureInWindow(callback),
    measureLayout: (relativeTo, onSuccess, onFail) =>
      node.measureLayout(relativeTo, onSuccess, onFail),
    setNativeProps: nativeProps => node.setNativeProps(nativeProps),
    // Through TextInputState, NOT a raw command: app-wide tracking, plus the
    // already-focused/editable:false no-op RN's own guard carries.
    focus: () => focusTextInput(node),
    // Through TextInputState, NOT a raw command: a raw command looks equivalent and isn't, since
    // Keyboard.dismiss() reads currentlyFocusedInput() and a stale entry blurs the wrong node.
    blur: () => blurTextInput(node),
    isFocused: () => stateOf(node)?.isFocused === true,
    clear: () => {
      const state = stateOf(node);
      if (state === undefined) return;
      dispatchViewCommand(node, 'setTextAndSelection', [
        state.mostRecentEventCount,
        '',
        0,
        0,
      ]);
      state.lastNativeText = '';
    },
    setSelection: (start: number, end: number) => {
      const state = stateOf(node);
      if (state === undefined) return;
      // The CURRENT text, not the app's `value`: a selection move must not also rewrite the text,
      // and native discards a command whose text disagrees with what it holds.
      dispatchViewCommand(node, 'setTextAndSelection', [
        state.mostRecentEventCount,
        state.lastNativeText,
        start,
        end,
      ]);
    },
  };
}

// Idempotent: an adapter entry may be imported more than once in a bundle, and re-registering the
// same tag with an equivalent behavior must not double-install anything.
export function registerTextInputBehavior(): void {
  // The two tags share one behavior object: with the fold gone the machine is identical for both,
  // and the engine answers `multiline` from the component name it already holds.
  const behavior = {
    attach,
    attachAfterCommit,
    afterCommit,
    detach,
    // The three the change/focus/blur machine needs as INPUTS, plus the press family the
    // tap-to-focus machine composes. Without the stash the app's own `onChange` would evict the
    // machine from the very event the controlled handshake runs on.
    ownedListeners: [
      'change',
      'focus',
      'blur',
      'selectionChange',
      ...PRESS_LISTENERS,
    ],
  };
  registerHostBehavior(TEXT_INPUT_TAG, behavior);
  registerHostBehavior(TEXT_INPUT_MULTILINE_TAG, behavior);
}
