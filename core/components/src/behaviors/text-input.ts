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
// that. A tag has no render, so `IHostBehavior.afterCommit` is the equivalent beat —
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
  /**
   * Whether the mirror was seeded on THIS commit, so the beat that follows has nothing to compare.
   *
   * `attachAfterCommit` and `afterCommit` both run on the commit that lands the node, in that
   * order, and the first seeds `lastNativeText` from the very `value` the second would read back.
   * The comparison is therefore decided before it is made: a string `value` equals the mirror it
   * just set, and a non-string one fails `shouldCommandText`'s own narrowing. So the first beat
   * cannot command, and the read it makes to prove that is a host crossing per input per create.
   */
  isMirrorFreshlySeeded: boolean;
}

const states = new WeakMap<ISymbioteNode, IBehaviorState>();

function stateOf(node: ISymbioteNode): IBehaviorState | undefined {
  return states.get(node);
}

function stringProp(node: ISymbioteNode, key: string): string | undefined {
  return stringFrom(propOf(node, key));
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

// `onValueChange(event)` is NOT a Fabric event — it is a fold the component wrapper used to do
// over the raw `change` payload, so it lives on the node as a plain prop key and
// `fabricProps` drops it on the way to native. A tag has no wrapper to run that fold, so before
// this the callback was simply never called: the field echoed keystrokes natively (native owns its
// own text) while every value the app derived from it stayed frozen. Device-found 2026-08-31 in
// examples/solid's canary — the greeting never left "Hello, stranger".
//
// Same class as `value -> text` (`core/engine/src/fabric-props.ts`) and the same repair: below the
// fork, where all five adapters inherit it.
//
// The listener takes ONE argument, `text` carried on the event itself (`ITextInputChangeEvent`),
// not `(text, event)` — Svelte's compiler forces every individual `on*` attribute through a native
// listener wrapper that calls with exactly one argument, always a real object, so a second
// argument is silently dropped and a bare string as the sole argument crashes.
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

// The alias list and its two narrowing helpers went with the fold. They existed only to feed
// `resolveTextInputProps`, and that resolution is `foldTextInputAliases` in
// `SymbioteFabricProps.cpp` now — keeping a copy of the names here would be a second statement of
// the same rule, which is the thing the move was for.

// `multiline` picks between TWO Fabric views, so the TAG decides it and no later prop write moves a
// node between them. The wrapper that used to stand here CONSUMED the prop to pick its intrinsic;
// an author writing the tag can spell the two apart, which leaves two silent, device-only
// divergences, measured on the committed payload:
//
//   <text-input-multiline value="a" />   RCTMultilineTextInputView, folded as SINGLE-line:
//                                        submitBehavior 'blurAndSubmit', so Return blurs instead
//                                        of inserting a newline
//   <text-input multiline value="b" />   RCTSinglelineTextInputView carrying the multiline fold
//
// So the tag is the authority here, and a prop that contradicts it throws rather than being
// quietly overridden — an ignored `multiline` is a wrong native view with nothing to read.
// Found on Solid, fixed here because all five adapters produce the same two divergences: a
// decision the wrapper used to make by CONSUMING a prop has no owner once the author writes the
// tag directly.
// The COMPLAINT cannot live here, only the correction. `foldPayload` runs inside the commit, so a
// throw from it surfaces as an uncaught exception a tick after the author's write with no frame
// naming the call site — measured: a test awaiting the mount sees `nothing committed` instead of
// the error. Refusing a contradicting prop therefore stays in each adapter's own prop-write path,
// where the author's stack still exists (Solid's `renderer.ts` is the reference); this file only
// guarantees that whatever the props say, the payload matches the TAG.
// THE FOLD IS GONE — the rule lives in the engine now, `foldTextInputAliases` in
// `core/engine/cpp/SymbioteFabricProps.cpp`, beside the tree it writes into.
//
// It is UA behavior in the browser sense: mapping the web-facing spelling (`inputMode`,
// `enterKeyHint`, `readOnly`, the W3C `autoComplete` token) onto React Native's own is a property of
// the PLATFORM, not of any app, framework or component instance. Blink resolves `<input>`'s
// attributes in the engine and every framework on top pays nothing for it; this is the same move.
//
// And it had a price. A `payloadFold` is a JS closure the C++ walk calls per node per commit, which
// means converting the whole props bag to a `jsi::Value` and the result back again — ~17 us apiece,
// and the entire gap between React's walk (24-27 ms, no folds) and every other adapter's (41-44 ms,
// `foldsFound=1000`) on a byte-identical benchmark tree.
//
// There is deliberately NO TypeScript twin. `core/engine/cpp/tests/js/text-input-payload.itest.ts`
// is the contract, and it reads the payload the commit actually sent rather than a second copy of
// the rule.
//
// What stays here is the MACHINE: the controlled-value handshake, the event-count acknowledgement,
// autofocus. Those run at gesture and lifecycle rate and call back into app code — which is exactly
// what a browser keeps above the engine too.

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
    isMirrorFreshlySeeded: false,
  });
  // The mirror's seed has to reach the PAYLOAD too, not just this state object. The wrappers handed
  // the count over on every render, so an input committed the key at create; the behavior used to
  // write it only inside the change handshake, so the tag carried no such key until the user typed.
  // Found independently by three adapters, 2026-09-01.
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
  // ONE question, not three. `propOf` crosses the host boundary per call — `flushOps()` plus a JSI
  // read — and this runs once per input on the commit that lands it, so three reads of the same
  // bag were three crossings per `<text-input>` on every create. `propsOf` fetches it whole and
  // hands back the host's own object when nothing is stashed, which is every node here.
  const props = propsOf(node);
  state.lastNativeText = foldText(
    stringFrom(props.value),
    stringFrom(props.defaultValue),
  );
  state.isMirrorFreshlySeeded = true;

  if (props.autoFocus !== true) return;
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
  // The seed ran on this same commit, so the comparison below is already decided — see
  // `isMirrorFreshlySeeded`. Cleared here rather than in the seed, because this is the beat it
  // covers and the next one must read for real.
  if (state.isMirrorFreshlySeeded) {
    state.isMirrorFreshlySeeded = false;
    return;
  }

  const value = stringProp(node, 'value');
  if (!shouldCommandText(state.lastNativeText, value)) return;

  // `selection` is `{ start, end? }` when present. SELECTION_NONE (-1) is RN's "leave the cursor
  // where native put it" sentinel, so an absent selection must not be read as position 0 — that
  // would jump the caret to the front of the field on every controlled write.
  const { start, end } = selectionOf(propOf(node, 'selection'));

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
  // THE TWO TAGS NOW SHARE ONE BEHAVIOR OBJECT, and that is the port showing up in the shape of the
  // code. `multiline` was the only thing the two registrations did not share: each closed over its
  // own answer to feed `foldPayload`. With the fold gone the machine is identical for both, and the
  // engine answers `multiline` from the component name it already holds
  // (`foldTextInputAliases`'s `isMultiline` argument, `SymbioteFabricProps.cpp`) — which is the
  // better place for it anyway, since the component name is what Fabric actually keys the view on.
  const behavior = {
    attach,
    attachAfterCommit,
    afterCommit,
    detach,
    // The three the machine needs as INPUTS. Without the stash the app's own `onChange` would
    // evict the machine from the very event the controlled handshake runs on.
    ownedListeners: ['change', 'focus', 'blur'],
  };
  registerHostBehavior(TEXT_INPUT_TAG, behavior);
  registerHostBehavior(TEXT_INPUT_MULTILINE_TAG, behavior);
}
