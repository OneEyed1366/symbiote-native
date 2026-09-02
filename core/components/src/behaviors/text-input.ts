// TextInput's machine, on the engine node instead of inside a framework component — the tier-2
// half of `.claude/rules/host-primitive-tier.md` for the second primitive to get one.
//
// WHAT A `TextInput` COMPONENT ACTUALLY DOES, and why none of it needs a framework. It holds three
// mirrors of native state (the acknowledged event count, the last text native reported, whether the
// input is focused), it commands text back down when the app's `value` diverges from that mirror,
// it fires `focus` once at mount when `autoFocus` is set, and it exposes five imperative methods.
// The TEMPLATE reads none of it — which is the whole tier-2 test. Every framework was paying an
// instance for a machine that only ever needed a per-node home.
//
// WHY IT NEEDED A NEW ENGINE HOOK AND `Pressable` DID NOT. A press machine is driven entirely by
// events, which arrive long after commit. The controlled handshake is driven by a PROP: `value`
// changing is what must re-run the divergence check, and in a component the render is what does
// that. A lowered element has no render, so `IHostBehavior.afterCommit` is the equivalent beat —
// see that interface for why it is not a hook on `setProp`.
//
// THE ORDER OF THE TWO COMMIT HOOKS IS LOAD-BEARING HERE, which is why the engine pins it with a
// test: `attachAfterCommit` seeds `lastNativeText` from the mount-time props, and `afterCommit`
// compares against that seed. Reversed, the very first beat would see an empty mirror, decide the
// app's value had diverged, and command a redundant `setTextAndSelection` down to native on every
// input in the tree.
import {
  appListenerFor,
  blurTextInput,
  dispatchViewCommand,
  dlog,
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
  eventCountFromChange,
  foldText,
  INITIAL_EVENT_COUNT,
  SELECTION_NONE,
  resolveTextInputProps,
  shouldCommandText,
  textFromChange,
  type ITextInputHandle,
} from '../state/text-input';

// Both spellings, because `multiline` picks between two Fabric views and a lowering transform
// resolves that statically. The behavior is registered for both so it does not care which one the
// transform emitted.
export const TEXT_INPUT_TAG = 'symbiote-text-input';
export const TEXT_INPUT_MULTILINE_TAG = 'symbiote-text-input-multiline';

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
}

const states = new WeakMap<ISymbioteNode, IBehaviorState>();

function stateOf(node: ISymbioteNode): IBehaviorState | undefined {
  return states.get(node);
}

function stringProp(node: ISymbioteNode, key: string): string | undefined {
  const value = node.props[key];
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
// `node.props`: every name below is in `ownedListeners`, so `routeProp` parks the app's handler
// beside the machine's instead of overwriting it.
function callAppListener(
  node: ISymbioteNode,
  name: string,
  event: ISymbioteEvent,
): void {
  const listener = appListenerFor(node, name);
  if (typeof listener === 'function') listener(event);
}

// `onValueChange(text, event)` is NOT a Fabric event — it is a fold the component wrapper used to do
// over the raw `change` payload, so it lives in `node.props` as a plain function key and
// `fabricProps` drops it on the way to native. A lowered element has no wrapper to run that fold, so
// before this the callback was simply never called: the field echoed keystrokes natively (native
// owns its own text) while every value the app derived from it stayed frozen. Device-found
// 2026-08-31 in examples/solid's canary — the greeting never left "Hello, stranger".
//
// Same class as `value -> text` (`core/engine/src/fabric-props.ts`) and the same repair: below the
// fork, where all five adapters inherit it. Refusing to lower an element carrying the prop was the
// other candidate and is strictly worse — it makes the optimisation opt out of the idiom the
// ecosystem actually writes, to avoid a fold the runtime can do in three lines.
function callValueChange(
  node: ISymbioteNode,
  text: string,
  event: ISymbioteEvent,
): void {
  const listener = node.props.onValueChange;
  if (typeof listener === 'function') listener(text, event);
}

// The W3C/legacy alias fold the WRAPPER runs in its component body — `inputMode` -> `keyboardType`,
// `enterKeyHint` -> `returnKeyType`, `readOnly` -> inverted `editable`, `blurOnSubmit` ->
// `submitBehavior`, plus the `underlineColorAndroid: 'transparent'` default that hides the Material
// bar. A lowered element has no body, so before this every one of them was dropped: the raw alias
// reached Fabric as a key no ViewConfig declares, which throws nothing and renders nothing, so
// `inputMode="numeric"` simply produced the default keyboard on a device while the whole headless
// suite stayed green.
//
// Found by the wrapper-vs-behavior import audit rather than by hand
// (`.claude/rules/adapter-parity-audit.md`) — the same audit that found Pressable's two.
const ALIAS_ONLY_KEYS = [
  'inputMode',
  'enterKeyHint',
  'readOnly',
  'blurOnSubmit',
] as const;

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function booleanOf(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function foldPayload(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const folded = resolveTextInputProps({
    inputMode: stringOf(props.inputMode),
    keyboardType: stringOf(props.keyboardType),
    enterKeyHint: stringOf(props.enterKeyHint),
    returnKeyType: stringOf(props.returnKeyType),
    readOnly: booleanOf(props.readOnly),
    editable: booleanOf(props.editable),
    submitBehavior: stringOf(props.submitBehavior),
    blurOnSubmit: booleanOf(props.blurOnSubmit),
    // The tag already decided this at compile time, but the behavior is registered for BOTH tags
    // with one object, so the prop is the only thing it can read. Absent reads as single-line,
    // which is the tag the transform emits when `multiline` is absent — the two agree.
    multiline: props.multiline === true,
    cursorColor: stringOf(props.cursorColor),
    selectionColor: stringOf(props.selectionColor),
    selectionHandleColor: stringOf(props.selectionHandleColor),
    autoComplete: stringOf(props.autoComplete),
    textContentType: stringOf(props.textContentType),
    showSoftInputOnFocus: booleanOf(props.showSoftInputOnFocus),
    underlineColorAndroid: stringOf(props.underlineColorAndroid),
  });

  const out: Record<string, unknown> = { ...props, ...folded };
  // The aliases themselves must NOT ride along: they are inert at native, and leaving them in the
  // payload is how a reader concludes the fold ran when it did not.
  for (const key of ALIAS_ONLY_KEYS) delete out[key];
  return out;
}

function onChange(node: ISymbioteNode, event: ISymbioteEvent): void {
  const state = stateOf(node);
  if (state === undefined) return;

  const text = textFromChange(event);
  if (text !== undefined) {
    // Ordering matches the component path exactly: record the mirror, then hand the app its text.
    state.lastNativeText = text;
    callValueChange(node, text, event);
  }
  // Ordering: record the text first, then the count, so the acknowledged count never runs ahead of
  // the text it stands for. A count without its text makes the next controlled write echo an
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

  callAppListener(node, 'change', event);
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

function attach(node: ISymbioteNode): void {
  states.set(node, {
    mostRecentEventCount: INITIAL_EVENT_COUNT,
    lastNativeText: undefined,
    isFocused: false,
  });
  // The mirror's seed has to reach the PAYLOAD too, not just this state object. Every wrapper hands
  // the count to `renderTextInput` on every render, so a component-path input commits the key at
  // create; the behavior used to write it only inside the change handshake, so a lowered input
  // carried no such key until the user typed. Found independently by three adapters' equivalence
  // arms, 2026-09-01 — a divergence between the two paths of ONE adapter, not between adapters.
  //
  // No `requestCommitFor` here: at create the renderer commits anyway, and on a re-attach the key is
  // already standing at this same value, so `setProp`'s identity guard makes the write a no-op.
  setProp(node, 'mostRecentEventCount', INITIAL_EVENT_COUNT);
  setBehaviorListener(node, 'change', event => onChange(node, event));
  setBehaviorListener(node, 'focus', event => onFocus(node, event));
  setBehaviorListener(node, 'blur', event => onBlur(node, event));
}

// The first commit is the earliest point where the node has BOTH its props and a Fabric tag. The
// mirror needs the first, `autoFocus` needs the second.
function attachAfterCommit(node: ISymbioteNode): void {
  const state = stateOf(node);
  if (state === undefined) return;
  state.lastNativeText = foldText(
    stringProp(node, 'value'),
    stringProp(node, 'defaultValue'),
  );

  if (node.props.autoFocus !== true) return;
  // Driven in JS rather than as a native prop, exactly as RN does it
  // (TextInput.js:538 -> TextInputState.focusInput). The native command is idempotent if the input
  // is already focused.
  dlog('TextInput behavior: autoFocus -> focus command');
  dispatchViewCommand(node, 'focus', []);
}

// The controlled handshake. A plain prop re-push would race the user's keystrokes — native may have
// text JS has not seen yet — so the command carrying the acknowledged count is the only stale-safe
// path, and `shouldCommandText` is what keeps it a no-op unless the value genuinely diverged.
function afterCommit(node: ISymbioteNode): void {
  const state = stateOf(node);
  if (state === undefined) return;

  const value = stringProp(node, 'value');
  if (!shouldCommandText(state.lastNativeText, value)) return;

  // `selection` is `{ start, end? }` when present. SELECTION_NONE (-1) is RN's "leave the cursor
  // where native put it" sentinel, so an absent selection must not be read as position 0 — that
  // would jump the caret to the front of the field on every controlled write.
  const { start, end } = selectionOf(node.props.selection);

  dlog(
    `TextInput behavior: setTextAndSelection count=${state.mostRecentEventCount} ` +
      `text=${JSON.stringify(value)}`,
  );
  dispatchViewCommand(node, 'setTextAndSelection', [
    state.mostRecentEventCount,
    value,
    start,
    end,
  ]);
  state.lastNativeText = value;
}

function detach(node: ISymbioteNode): void {
  states.delete(node);
}

/**
 * The imperative API RN exposes on a TextInput ref, built over the engine node. Reached through
 * each adapter's own `host-instance` accessor — the capability, not a shape
 * (`.claude/rules/adapter-parity-audit.md`).
 *
 * `focus`/`blur` are native view commands; `clear` and `setSelection` reuse `setTextAndSelection`,
 * the same stale-safe path a controlled write takes, so they cannot race a keystroke either.
 */
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
    focus: () => dispatchViewCommand(node, 'focus', []),
    // Through TextInputState, NOT a raw command — the same route the component path takes
    // (`react/.../text-input/index.ts`, "so the app-wide focus tracking clears too"). The native
    // `blur` event also clears the tracking via this behavior's own listener, so a raw command
    // looks equivalent and is not: the event is the NATIVE side's, and it does not arrive when the
    // input was already blurred. `Keyboard.dismiss()` reads `currentlyFocusedInput()`, so a stale
    // entry there aims a blur at a node that no longer holds focus.
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
  const behavior = {
    attach,
    attachAfterCommit,
    afterCommit,
    detach,
    foldPayload,
    // The three the machine needs as INPUTS. Without the stash the app's own `onChange` would
    // evict the machine from the very event the controlled handshake runs on.
    ownedListeners: ['change', 'focus', 'blur'],
  };
  registerHostBehavior(TEXT_INPUT_TAG, behavior);
  registerHostBehavior(TEXT_INPUT_MULTILINE_TAG, behavior);
}
