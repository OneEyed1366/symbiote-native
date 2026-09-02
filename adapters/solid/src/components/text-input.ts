// TextInput — the Solid lifecycle half. The folds/maps (value→text, the W3C/alias resolution) and
// the controlled-write predicate live in @symbiote-native/components/state; the render (intrinsic +
// native-prop mapping) in @symbiote-native/components/view. Both are shared verbatim with React,
// Vue and Svelte. Solid supplies only the reactivity: a signal for the acknowledged event count,
// setup-scope variables for the host node / the last text native holds / the focus flag, one effect
// for the controlled write, and the imperative handle handed to `ref`.
//
// THE CONTROLLED HANDSHAKE IS NOT A PROP RE-PUSH, and that is the whole subtlety. Native owns its
// own text and has already changed it by the time the change event arrives. When JS REFUSES that
// change the `value` prop never changes — so nothing re-commits, and the only thing that can
// correct native is an imperative setTextAndSelection carrying the ACKNOWLEDGED event count (the
// one native last reported), which native's eventLag check accepts. Same shape as Switch's
// snap-back; the counter arithmetic is documented in @symbiote-native/components/state/text-input.
//
// A FLAT MODULE, NOT A FOLDER: TextInput has no platform variant to select by filename. The
// iOS/Android differences (keyboardType, autoComplete vs textContentType, underlineColorAndroid)
// are resolved platform-AGNOSTICALLY by resolveTextInputProps, which emits both platforms' native
// props and lets the inert one ride — see its header. Only genuine platform/shared groups get a
// folder (symbiote-file-layout), so Switch has one and this does not.
//
// NOTHING here destructures `props`. Solid props are getters and a component body runs ONCE, so a
// destructure would freeze the input at its mount-time config; splitProps is the idiomatic split
// that keeps the rest reactive, and every read below sits inside an accessor, an effect or an event
// handler. The two deliberate exceptions are marked where they happen.

import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  splitProps,
  untrack,
} from 'solid-js';
import type { Ref } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  eventCountFromChange,
  foldText,
  renderTextInput,
  resolveAccessibilityProps,
  resolveTextInputProps,
  shouldCommandText,
  textFromChange,
  INITIAL_EVENT_COUNT,
  SELECTION_NONE,
  type ITextInputHandle,
  type ITextInputProps as ITextInputBaseProps,
} from '@symbiote-native/components';
import {
  blurTextInput,
  dispatchViewCommand,
  dlog,
  setInputBlurred,
  setInputFocused,
  whenCommitted,
  type IClassNameValue,
  type IMeasureInWindowOnSuccess,
  type IMeasureLayoutOnSuccess,
  type IMeasureOnSuccess,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorToSolid } from '../descriptor-to-solid';

export type {
  ITextInputHandle,
  ITextInputSelection,
} from '@symbiote-native/components';

// The agnostic base (the controlled value contract, the input-behavior props, the folded aliases,
// the event callbacks, accessibility) is shared and re-exported rather than redeclared. Only two
// fields are per-adapter (<prop_types_split_agnostic_vs_per_adapter>): `class`, whose spelling is
// Solid's own (React's is `className`), and `ref`, which is typed over solid-js's Ref union — a
// framework value, so it cannot live in the shared base. Like React's forwardRef, the ref receives
// the IMPERATIVE HANDLE, not the host node.
export type ITextInputProps = ITextInputBaseProps & {
  class?: IClassNameValue;
  ref?: Ref<ITextInputHandle>;
};

// Read by the component itself; everything else forwards onto the host node. onValueChange/onFocus/
// onBlur must be split off — they are pure JS, and it is our WRAPPED handlers that go on the host
// (a raw function prop that is not a ViewConfig event crashes Android's folly::dynamic serializer).
// The alias props (inputMode, enterKeyHint, readOnly, submitBehavior, blurOnSubmit) are inert at
// the native layer and must be folded, never forwarded raw. Same list as React's destructure.
const HANDLED_PROPS = [
  'ref',
  'value',
  'defaultValue',
  'multiline',
  'selection',
  'onValueChange',
  'onFocus',
  'onBlur',
  'inputMode',
  'enterKeyHint',
  'readOnly',
  'submitBehavior',
  'blurOnSubmit',
  'cursorColor',
  'selectionColor',
  'selectionHandleColor',
  'keyboardType',
  'returnKeyType',
  'editable',
  'autoComplete',
  'textContentType',
  'autoFocus',
  'showSoftInputOnFocus',
  'underlineColorAndroid',
] as const;

export function TextInput(props: ITextInputProps): JSX.Element {
  const [local, rest] = splitProps(props, HANDLED_PROPS);

  // The count native last acknowledged. A signal because two readers need it live: the render (it
  // rides down as mostRecentEventCount) and the controlled-write effect, which echoes it so
  // native's eventLag lands on 0 and the write applies instead of being dropped as stale.
  const [mostRecentEventCount, setMostRecentEventCount] =
    createSignal(INITIAL_EVENT_COUNT);

  // The host node, held by IDENTITY in a plain variable — never a store or a deep proxy, which
  // would be a different key than the one the engine's commit mirror holds, and every command below
  // would silently no-op (symbiote-engine-core §3). Null only before the first build and after a
  // multiline swap disposes the old one.
  let host: ISymbioteNode | null = null;
  // The last text native holds, as far as JS knows. Deliberately NOT reactive: the controlled-write
  // effect both reads and writes it, and a signal would make that a loop. Seeded by a one-time
  // setup read of the mount-time value — the `text` prop already carries that value down via
  // createNode, so the FIRST controlled value is not a divergence and must NOT re-command.
  let lastNativeText = foldText(local.value, local.defaultValue);
  // Mirrored from the focus/blur pair for isFocused(): native exposes no synchronous focus getter,
  // so RN's own TextInputState keeps the same flag.
  let focused = false;
  // autoFocus fires once, on the first host node that commits; guarded so a later multiline swap
  // does not steal focus back.
  let autoFocused = false;

  // The acknowledged count, read WITHOUT subscribing. The imperative handle can be called from
  // anywhere, including inside a caller's effect or memo — a tracked read there would silently
  // enroll their computation in our keystroke counter. React's handle closes over a render value
  // and has the same non-reactive contract.
  const acknowledgedCount = (): number => untrack(mostRecentEventCount);

  const handleChange = (event: ISymbioteEvent): void => {
    // Event seam: the controlled handshake hinges on the change payload carrying `text`
    // (+ `eventCount`). iOS and Android Fabric can key these differently, so log the actual shape
    // here; a missing `text` means onValueChange never fires.
    dlog(
      `TextInput change keys=[${Object.keys(event.nativeEvent).join(',')}] ` +
        `text=${JSON.stringify(event.nativeEvent.text)} count=${JSON.stringify(event.nativeEvent.eventCount)}`,
    );
    const text = textFromChange(event);
    if (text !== undefined) {
      // Ordering matters: record the text first, then bump the acknowledged count, so the count
      // never runs ahead of the text it stands for.
      lastNativeText = text;
      local.onValueChange?.(text, event);
    }
    const count = eventCountFromChange(event);
    if (count !== undefined) setMostRecentEventCount(count);
  };

  const handleFocus = (event: ISymbioteEvent): void => {
    focused = true;
    // Track focus app-wide so Keyboard.dismiss can blur this input without a ref.
    if (host !== null) setInputFocused(host);
    local.onFocus?.(event);
  };

  const handleBlur = (event: ISymbioteEvent): void => {
    focused = false;
    if (host !== null) setInputBlurred(host);
    local.onBlur?.(event);
  };

  // One host node for one intrinsic. `multiline` arrives as an ARGUMENT, not as a prop read, so the
  // descriptor's type is constant for this node's whole lifetime — descriptorToSolid builds the
  // element once and only diffs prop VALUES afterwards, and a type that changed under it would
  // throw rather than paint.
  const buildHost = (multiline: boolean): ISymbioteNode => {
    const node = descriptorToSolid(() =>
      renderTextInput({
        multiline,
        text: foldText(local.value, local.defaultValue),
        mostRecentEventCount: mostRecentEventCount(),
        selection: local.selection,
        folded: resolveTextInputProps({
          inputMode: local.inputMode,
          keyboardType: local.keyboardType,
          enterKeyHint: local.enterKeyHint,
          returnKeyType: local.returnKeyType,
          readOnly: local.readOnly,
          editable: local.editable,
          submitBehavior: local.submitBehavior,
          blurOnSubmit: local.blurOnSubmit,
          multiline,
          cursorColor: local.cursorColor,
          selectionColor: local.selectionColor,
          selectionHandleColor: local.selectionHandleColor,
          autoComplete: local.autoComplete,
          textContentType: local.textContentType,
          showSoftInputOnFocus: local.showSoftInputOnFocus,
          underlineColorAndroid: local.underlineColorAndroid,
        }),
        // TextInput owns its host element rather than rendering through a symbiote View, so it
        // folds aria/role into the canonical accessibility* props here. The vanished-key widening
        // that fold needs is descriptorToSolid's job (utils/stable-keys), applied to the whole
        // Descriptor prop bag — nothing to repeat here.
        passthrough: {
          ...resolveAccessibilityProps(rest),
          onChange: handleChange,
          onFocus: handleFocus,
          onBlur: handleBlur,
        },
      }),
    );
    host = node;
    // Dropped together with the computations this build owns, so a command can never aim at a node
    // that was swapped out and is no longer mounted.
    onCleanup(() => {
      if (host === node) host = null;
    });

    // autoFocus is driven in JS, not as a native prop (RN does the same via TextInputState.focusInput,
    // TextInput.js:538). The engine commits on a microtask here (renderer.ts's requestCommit), so at
    // this point the node has no Fabric tag and a bare dispatchViewCommand would silently no-op —
    // whenCommitted defers it to the commit that assigns the tag. Cancelled on cleanup so an
    // un-committed pending focus cannot outlive the node.
    if (local.autoFocus === true && !autoFocused) {
      autoFocused = true;
      dlog('TextInput autoFocus -> focus command');
      const cancel = whenCommitted(node, () => {
        dispatchViewCommand(node, 'focus', []);
      });
      onCleanup(cancel);
    }
    return node;
  };

  // Controlled write: when JS-side `value` diverges from what native reported, command the new text
  // down with the acknowledged count. A plain prop re-push would race the user's keystrokes.
  //
  // READING THE COUNT IS LOAD-BEARING, not bookkeeping — it is what makes a REFUSED change snap
  // back. On a refusal `value` never changes, so a value-only dependency (Vue's watch shape) would
  // never re-run and native would keep the text JS rejected. The count bumps on every native
  // change, which is React's `useLayoutEffect` with no deps expressed in Solid's terms.
  createEffect(() => {
    const value = local.value;
    const count = mostRecentEventCount();
    const selection = local.selection;
    if (host === null) return;
    if (!shouldCommandText(lastNativeText, value)) return;

    const selStart = selection?.start ?? SELECTION_NONE;
    const selEnd = selection?.end ?? selection?.start ?? SELECTION_NONE;
    dlog(
      `TextInput setTextAndSelection count=${count} text=${JSON.stringify(value)}`,
    );
    dispatchViewCommand(host, 'setTextAndSelection', [
      count,
      value,
      selStart,
      selEnd,
    ]);
    lastNativeText = value;
  });

  // The imperative API RN exposes on a TextInput ref. focus/blur drive native view commands; clear
  // and setSelection reuse setTextAndSelection (the same stale-safe path as a controlled write),
  // echoing the acknowledged count so native applies them. Every method reads `host` LIVE, so a
  // multiline swap cannot leave the handle pointing at a dead node.
  const handle: ITextInputHandle = {
    // Forwarded to the node so a TextInput ref is not poorer than any other host ref. Measured
    // 2026-08-31: the wrapper's handle used to be five methods and thereby CLOSED OVER the node,
    // costing the component path `measure`/`measureInWindow`/`measureLayout`/`setNativeProps`,
    // while a lowered element handed back the bare node and lost `clear`/`isFocused`/
    // `setSelection`. Two different surfaces, crossed by writing `multiline={isLong}` instead of
    // `multiline`. The union is the fix; refusing to lower would only swap which four go missing.
    measure: (callback: IMeasureOnSuccess): void => {
      if (host !== null) host.measure(callback);
    },
    measureInWindow: (callback: IMeasureInWindowOnSuccess): void => {
      if (host !== null) host.measureInWindow(callback);
    },
    measureLayout: (
      relativeToNativeNode: ISymbioteNode | number,
      onSuccess: IMeasureLayoutOnSuccess,
      onFail?: () => void,
    ): void => {
      if (host !== null)
        host.measureLayout(relativeToNativeNode, onSuccess, onFail);
    },
    setNativeProps: (nativeProps: Record<string, unknown>): void => {
      if (host !== null) host.setNativeProps(nativeProps);
    },
    focus: (): void => {
      if (host !== null) dispatchViewCommand(host, 'focus', []);
    },
    blur: (): void => {
      // Routes through TextInputState so the app-wide focus tracking clears too.
      blurTextInput(host);
    },
    clear: (): void => {
      if (host === null) return;
      dispatchViewCommand(host, 'setTextAndSelection', [
        acknowledgedCount(),
        '',
        0,
        0,
      ]);
      lastNativeText = '';
    },
    isFocused: (): boolean => focused,
    setSelection: (start: number, end: number): void => {
      if (host === null) return;
      const current = lastNativeText ?? '';
      dispatchViewCommand(host, 'setTextAndSelection', [
        acknowledgedCount(),
        current,
        start,
        end,
      ]);
    },
  };
  // Single- and multiline are DIFFERENT native views (RCTSinglelineTextInputView vs
  // RCTMultilineTextInputView), so a runtime flip has to build a new host node rather than re-prop
  // the old one — React remounts, Vue h()s a new type, Svelte swaps an {#if} branch. The memo is
  // that swap: `insert` replaces the previous node with the new one and disposes the old build.
  //
  // The untrack is load-bearing. Building reads descriptorToSolid's own memo, so without it THIS
  // memo would subscribe to every prop the render fn touches and rebuild the entire input — new
  // native view, lost cursor and keyboard — on every keystroke. (Solid's own `createComponent`
  // untracks for exactly this reason; there is no component here to inherit it from.)
  const hostTree = createMemo(() => {
    const multiline = local.multiline === true;
    return untrack(() => buildHost(multiline));
  });

  // Solid's `ref` is a compile-time construct: on a component the compiler has already rewritten
  // `ref={handle}` into a callback prop by the time we read it, so calling what we were handed is
  // the whole job (utils/host-ref.ts explains the rewrite). Not applyHostRef, which is typed for a
  // host node — this ref receives the handle, matching React's forwardRef contract.
  //
  // Called AFTER `hostTree` has built at least once, not right after `handle` is constructed -
  // same reasoning as ScrollView's ref-ordering fix (scroll-view/shared.tsx). `handle`'s methods
  // read `host` LIVE on every call, so calling ref early never caused a visible bug here (unlike
  // ScrollView, whose handle a consumer - createAnimatedComponent's resolveHostNode - unwrapped
  // eagerly, once, at ref-call time). Reordered anyway: a future Animated.TextInput would hit the
  // same permanently-null capture, and matching the safe ordering now costs nothing.
  if (typeof local.ref === 'function') local.ref(handle);

  return hostTree;
}
