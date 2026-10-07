// The TextInput machine as an engine-node behavior. Everything here is asserted on the COMMITTED
// Fabric payload or the recorder's `commands` list — every failure this behavior can have is
// invisible on `node.props`.
import { afterEach, describe, expect, it, vi } from 'vitest';
// Relative rather than by package name: `core/components` does not declare test-utils, matching
// the sibling pressable suite.
import {
  createLiveTree,
  installRecordingFabric,
} from '../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  currentlyFocusedInput,
  removeChild,
  listenerFor,
  Platform,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  buildTextInputHandle,
  registerTextInputBehavior,
  TEXT_INPUT_TAG,
  textInputOf,
} from './text-input';
import { INITIAL_EVENT_COUNT } from '../state/text-input';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 7_000;

// PRODUCTION SHAPE: an adapter resolves the intrinsic tag through descriptorFor and calls
// createElement with the FABRIC view name. Building the subject as createElement(TEXT_INPUT_TAG)
// would pass the tag AS the Fabric name and leave every case below green over a fake registration.
const TEXT_INPUT_VIEW_NAME = 'RCTSinglelineTextInputView';
const TEST_ID = 'subject';

// The acknowledged count native reports back on a keystroke. A number nothing else in the file
// produces, so the payload assertion cannot pass on a default.
const NATIVE_EVENT_COUNT = 7;

function makeTextInput(): ISymbioteNode {
  return createElement(TEXT_INPUT_VIEW_NAME, false, TEXT_INPUT_TAG);
}

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

// A commit that changes nothing returns ABOVE the point where behavior hooks are drained, so a
// second beat needs a real prop write — writing the app's `value` is the real beat anyway.
function commitValue(
  surface: ReturnType<typeof mount>,
  node: ISymbioteNode,
  value: string,
): void {
  routeProp(node, 'value', value);
  surface.commit();
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = listenerFor(node, name);
  if (listener === undefined) {
    throw new Error(
      `no "${name}" listener installed — the behavior did not attach`,
    );
  }
  return listener;
}

function changeEvent(text: string, eventCount: number): ISymbioteEvent {
  return { nativeEvent: { text, eventCount } };
}

const EMPTY_EVENT: ISymbioteEvent = { nativeEvent: {} };

// The live tree by testID, never `fabric.find()` (creation log, authored bag). Reads `.payload`:
// `mostRecentEventCount` is a fold, never a prop the app wrote.
function committedPropsOf(testID: string): Record<string, unknown> | undefined {
  return live.findLive(live.appRoot(), node => node.payload.testID === testID)
    ?.payload;
}

function commandsNamed(
  name: string,
): ReadonlyArray<{ commandName: string; args: readonly unknown[] }> {
  return fabric.commands.filter(entry => entry.commandName === name);
}

// A prop write from an event handler is published on the microtask boundary
// (`requestCommitFor` -> `queueMicrotask(flushNativeProps)`), so the payload is stale until this
// resolves.
const flush = (): Promise<void> => Promise.resolve();

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
  // Clears `commands` too, which every case here counts.
  fabric.reset();
});

describe('text input host behavior', () => {
  // THE CREATE PAYLOAD, and the only assertion in this file that reads the tree before an event.
  // An input commits `mostRecentEventCount: 0` at create — asserted on the committed payload
  // rather than `node.props`, which is a mirror the behavior keeps for itself either way.
  it('seeds the acknowledged count into the create payload', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'testID', TEST_ID);
    mount(node);

    expect(committedPropsOf(TEST_ID)).toMatchObject({
      mostRecentEventCount: INITIAL_EVENT_COUNT,
    });
  });

  // RN forces `caretHidden` to true under `Platform.isTesting` (TextInput.js:623), whatever the app
  // wrote, so a test run never sees a blinking caret
  it('hides the caret under Platform.isTesting even when the app shows it', () => {
    const isTesting = vi.spyOn(Platform, 'isTesting', 'get');
    isTesting.mockReturnValue(true);
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'caretHidden', false);
    mount(node);

    expect(committedPropsOf(TEST_ID)).toMatchObject({ caretHidden: true });
    isTesting.mockRestore();
  });

  it('leaves the authored caretHidden alone outside a test run', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'caretHidden', false);
    mount(node);

    expect(committedPropsOf(TEST_ID)).toMatchObject({ caretHidden: false });
  });

  // Two independent consequences of one cause: the app's handler still fires (parked in the stash,
  // not evicted by the machine's dispatcher) AND the acknowledged count reaches the payload. Either
  // one alone would mask a wrong wiring the other catches.
  it('runs the machine AND the app callback on one change event', async () => {
    registerTextInputBehavior();
    const onChange = vi.fn();
    const node = makeTextInput();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onChange', onChange);
    mount(node);

    listenerOf(node, 'change')(changeEvent('ab', NATIVE_EVENT_COUNT));
    await flush();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(committedPropsOf(TEST_ID)).toMatchObject({
      mostRecentEventCount: NATIVE_EVENT_COUNT,
    });
  });

  // `onValueChange(event)` is not a Fabric event — a plain prop key `fabricProps` drops on the
  // way to native. Asserted here, below the adapter fork, so all five adapters inherit it.
  it('calls the app onValueChange with the folded text on a change', () => {
    registerTextInputBehavior();
    const onValueChange = vi.fn();
    const node = makeTextInput();
    routeProp(node, 'onValueChange', onValueChange);
    mount(node);

    listenerOf(node, 'change')(changeEvent('ab', NATIVE_EVENT_COUNT));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    // ONE argument, the event, with `text` carried on it — not `(text, event)`.
    expect(onValueChange.mock.calls[0][0]).toMatchObject({ text: 'ab' });
  });

  // why: `TextInput.js:504-506`'s `_onChange` calls `onChange(event)` before `onChangeText(text)`,
  // always — an app with side effects observable across both sees that exact order on a device.
  it('calls onChange before onChangeText, matching vendor order', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    mount(node);
    const order: string[] = [];
    routeProp(node, 'onChange', () => order.push('onChange'));
    routeProp(node, 'onChangeText', () => order.push('onChangeText'));

    listenerOf(node, 'change')(changeEvent('ab', NATIVE_EVENT_COUNT));

    expect(order).toEqual(['onChange', 'onChangeText']);
  });

  // The negative half, and it is not decoration: `textFromChange` returns undefined for a payload
  // with no `text`, and a callback fired with `undefined` would let an app write undefined into its
  // own state on every stray event. The component path has the same guard.
  it('leaves onValueChange alone when the change payload carries no text', () => {
    registerTextInputBehavior();
    const onValueChange = vi.fn();
    const node = makeTextInput();
    routeProp(node, 'onValueChange', onValueChange);
    mount(node);

    listenerOf(node, 'change')(EMPTY_EVENT);

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('dispatches a focus command at mount when autoFocus is set', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'autoFocus', true);
    mount(node);

    expect(commandsNamed('focus')).toHaveLength(1);
  });

  it('leaves an input without autoFocus alone', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    mount(node);

    expect(commandsNamed('focus')).toHaveLength(0);
  });

  // `value` was already carried down at createNode, so the first beat must read it as already
  // native — otherwise every controlled input commands a redundant write on mount.
  it('does not command text down on the first commit of a mount-time value', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'value', 'seeded');
    mount(node);

    expect(commandsNamed('setTextAndSelection')).toHaveLength(0);
  });

  // Once the app's value diverges from the mirror, the command goes out with the caret sentinel,
  // since no `selection` prop was given — 0/0 would jump the caret to the front on every write.
  it('commands the diverged value down with the -1/-1 caret sentinel', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'value', 'seeded');
    const surface = mount(node);

    commitValue(surface, node, 'typed by the app');

    expect(commandsNamed('setTextAndSelection')).toHaveLength(1);
    expect(commandsNamed('setTextAndSelection')[0].args).toEqual([
      0,
      'typed by the app',
      -1,
      -1,
    ]);
  });

  // Two commands: the authored `selection` fires its own caret-only command at mount, and
  // `commitValue` fires a second for the text — the caret already settled, so it stays at {2,2}.
  it('sends an explicit selection, defaulting end to start', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'selection', { start: 2 });
    const surface = mount(node);

    expect(commandsNamed('setTextAndSelection')[0].args).toEqual([
      0,
      undefined,
      2,
      2,
    ]);

    commitValue(surface, node, 'abcdef');

    expect(commandsNamed('setTextAndSelection')).toHaveLength(2);
    expect(commandsNamed('setTextAndSelection')[1].args).toEqual([
      0,
      'abcdef',
      2,
      2,
    ]);
  });

  // `lastNativeSelection` starts at the sentinel `{start:-1,end:-1}`, distinct from any real
  // selection — so an authored `selection` fires the command on the very first commit, with no
  // preceding value write.
  it('moves the caret on mount from selection alone, with no value ever written', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'selection', { start: 0, end: 4 });
    mount(node);

    expect(commandsNamed('setTextAndSelection')).toHaveLength(1);
    expect(commandsNamed('setTextAndSelection')[0].args).toEqual([
      0,
      undefined,
      0,
      4,
    ]);
  });

  // `_onSelectionChange` (TextInput.js:522-533) updates `lastNativeSelection` from the real native
  // event too, not only from our own commanded write — so a user-dragged caret away from an
  // unchanged controlled `selection` snaps straight back on the next render.
  it('snaps a controlled selection back after the user drags the caret away', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'selection', { start: 5, end: 5 });
    mount(node);
    expect(commandsNamed('setTextAndSelection')).toHaveLength(1);

    listenerOf(
      node,
      'selectionChange',
    )({
      nativeEvent: { selection: { start: 10, end: 10 } },
    });

    expect(commandsNamed('setTextAndSelection')).toHaveLength(2);
    expect(commandsNamed('setTextAndSelection')[1].args).toEqual([
      0,
      undefined,
      5,
      5,
    ]);
  });

  // The handshake, end to end. The change both moves the mirror (so re-publishing the SAME text
  // commands nothing) and moves the acknowledged count (so the next real write echoes native's own
  // number rather than 0, which is what makes native apply it instead of discarding it as stale).
  it('acknowledges a change: same text is silent, the next write echoes the count', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    const surface = mount(node);

    listenerOf(node, 'change')(changeEvent('typed', NATIVE_EVENT_COUNT));
    commitValue(surface, node, 'typed');
    expect(commandsNamed('setTextAndSelection')).toHaveLength(0);

    commitValue(surface, node, 'replaced by the app');

    expect(commandsNamed('setTextAndSelection')[0].args).toEqual([
      NATIVE_EVENT_COUNT,
      'replaced by the app',
      -1,
      -1,
    ]);
  });

  // Same two-consequences shape as the change case: the app's own focus/blur handlers keep firing
  // from the stash, and the machine's own mirror moves underneath them.
  it('tracks focus through the handle while the app handlers still fire', () => {
    registerTextInputBehavior();
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const node = makeTextInput();
    routeProp(node, 'onFocus', onFocus);
    routeProp(node, 'onBlur', onBlur);
    mount(node);
    const handle = buildTextInputHandle(node);

    expect(handle.isFocused()).toBe(false);

    listenerOf(node, 'focus')(EMPTY_EVENT);
    expect(handle.isFocused()).toBe(true);
    expect(onFocus).toHaveBeenCalledTimes(1);

    listenerOf(node, 'blur')(EMPTY_EVENT);
    expect(handle.isFocused()).toBe(false);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  // In RN `isFocused` reads the app-wide tracker, so a command moves it with no native event
  it('reports focused right after focus() and unfocused right after blur()', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    mount(node);
    const handle = buildTextInputHandle(node);

    handle.focus();
    expect(handle.isFocused()).toBe(true);

    handle.blur();
    expect(handle.isFocused()).toBe(false);
  });

  // `TextInput-itest` "provides additional methods": a ref IS the node, so RN's API sits on it
  it('puts the RN imperative API on the node itself', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    mount(node);
    const input = textInputOf(node);

    expect(input?.getNativeRef()).toBe(node);
    input?.focus();
    expect(input?.isFocused()).toBe(true);
    expect(currentlyFocusedInput()).toBe(node);
    input?.blur();
    expect(input?.isFocused()).toBe(false);
  });

  it('sends clear and setSelection through the node as RN does', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    mount(node);
    const input = textInputOf(node);

    input?.clear();
    input?.setSelection(2, 5);

    expect(
      commandsNamed('setTextAndSelection').map(entry => entry.args),
    ).toEqual([
      [INITIAL_EVENT_COUNT, '', 0, 0],
      [INITIAL_EVENT_COUNT, null, 2, 5],
    ]);
  });

  it('leaves a node with no text input behavior without the API', () => {
    expect(textInputOf(makeTextInput())).toBeUndefined();
  });

  // RN's `getNativeRef` hands back the native instance the input renders to
  it('answers the native node from getNativeRef', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    mount(node);

    expect(buildTextInputHandle(node).getNativeRef()).toBe(node);
  });

  // `TextInput-test.js`: the first input loses focus when a second one takes it
  it('unfocuses the first input when a second one takes focus', () => {
    registerTextInputBehavior();
    const first = makeTextInput();
    const second = makeTextInput();
    mount(first);
    mount(second);
    const firstHandle = buildTextInputHandle(first);
    const secondHandle = buildTextInputHandle(second);

    firstHandle.focus();
    secondHandle.focus();

    expect(firstHandle.isFocused()).toBe(false);
    expect(secondHandle.isFocused()).toBe(true);
    expect(currentlyFocusedInput()).toBe(second);
  });

  it('reports unfocused once the input is unmounted', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    const surface = mount(node);
    const handle = buildTextInputHandle(node);
    handle.focus();

    surface.removeChild(node);
    surface.commit();

    expect(handle.isFocused()).toBe(false);
  });

  it('drives focus and blur as native view commands', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    mount(node);
    const handle = buildTextInputHandle(node);

    handle.focus();
    handle.blur();

    expect(commandsNamed('focus')).toHaveLength(1);
    expect(commandsNamed('blur')).toHaveLength(1);
  });

  // An imperative blur must clear app-wide focus tracking synchronously: the `blur` LISTENER also
  // does it, but only fires on a real native event, which never arrives if native was already
  // blurred. No native event fires below — that's the point of the case.
  it('clears app-wide focus tracking without waiting for a native blur', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    mount(node);
    const handle = buildTextInputHandle(node);

    listenerOf(node, 'focus')(EMPTY_EVENT);
    expect(currentlyFocusedInput()).toBe(node);

    handle.blur();

    expect(commandsNamed('blur')).toHaveLength(1);
    expect(currentlyFocusedInput()).toBeNull();
  });

  // why: RN's TextInputState.focusTextInput ignores `.focus()` on a field with `editable: false`
  // (TextInput-test.js, "focus() should not do anything if the TextInput is not editable").
  it('ignores an imperative focus while editable is false', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'editable', false);
    mount(node);
    const handle = buildTextInputHandle(node);

    handle.focus();

    expect(commandsNamed('focus')).toHaveLength(0);
    expect(handle.isFocused()).toBe(false);
  });

  // why: RN unmounts a focused input through the same guarded blur (TextInput.js's
  // useLayoutEffect cleanup: `if (currentlyFocusedInput() === inputRefValue) blur()`), so native
  // and the app-wide tracker don't outlive a node that's gone.
  it('blurs the input on unmount if it was the tracked focus', () => {
    registerTextInputBehavior();
    const parent = createElement('RCTView');
    const node = makeTextInput();
    const surface = createSurface((nextRootTag += 1));
    surface.appendChild(parent);
    appendChild(parent, node);
    surface.commit();

    listenerOf(node, 'focus')(EMPTY_EVENT);
    expect(currentlyFocusedInput()).toBe(node);

    removeChild(parent, node);
    surface.commit();

    expect(commandsNamed('blur')).toHaveLength(1);
    expect(currentlyFocusedInput()).toBeNull();
  });

  it('does not blur on unmount if it was never focused', () => {
    registerTextInputBehavior();
    const parent = createElement('RCTView');
    const node = makeTextInput();
    const surface = createSurface((nextRootTag += 1));
    surface.appendChild(parent);
    appendChild(parent, node);
    surface.commit();

    removeChild(parent, node);
    surface.commit();

    expect(commandsNamed('blur')).toHaveLength(0);
  });

  // RN's `clear` only sends the command and never moves its mirror of the native text, so a commit
  // with the same value commands nothing and a later empty value still reads as a divergence
  it('clears through setTextAndSelection and leaves the mirror alone', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'value', 'abc');
    const surface = mount(node);
    const handle = buildTextInputHandle(node);

    handle.clear();
    expect(commandsNamed('setTextAndSelection')[0].args).toEqual([0, '', 0, 0]);

    commitValue(surface, node, 'abc');
    expect(commandsNamed('setTextAndSelection')).toHaveLength(1);

    commitValue(surface, node, '');
    expect(commandsNamed('setTextAndSelection')).toHaveLength(2);
  });

  // RN passes a null text, so a selection move never rewrites it (`TextInput-itest.js`)
  it('moves the selection with a null text', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'value', 'app value');
    mount(node);
    const handle = buildTextInputHandle(node);

    listenerOf(node, 'change')(changeEvent('native text', NATIVE_EVENT_COUNT));
    handle.setSelection(1, 4);

    expect(commandsNamed('setTextAndSelection')).toHaveLength(1);
    expect(commandsNamed('setTextAndSelection')[0].args).toEqual([
      NATIVE_EVENT_COUNT,
      null,
      1,
      4,
    ]);
  });

  // The other half of keying by intrinsic tag: a node built from the same Fabric view name without
  // the tag must get nothing, or the machine would attach to every native input an app renders
  // through some other path.
  it('leaves a node of the same Fabric name but no tag alone', () => {
    registerTextInputBehavior();
    const plain = createElement(TEXT_INPUT_VIEW_NAME);

    expect(listenerFor(plain, 'change')).toBeUndefined();
  });

  // why: TextInput.js wraps the input in `usePressability` so `onPress` focuses it when editable
  // — a tap inside the hitSlop but outside the native focus zone still works. `onPressIn`/
  // `onPressOut` forward raw, with no wrapping.
  describe('tap-to-focus (TextInput.js usePressability)', () => {
    function press(node: ISymbioteNode): void {
      listenerOf(node, 'pressIn')(EMPTY_EVENT);
      listenerOf(node, 'startShouldSetResponder')(EMPTY_EVENT);
      listenerOf(node, 'press')(EMPTY_EVENT);
      listenerOf(node, 'pressOut')(EMPTY_EVENT);
    }

    it('focuses the input on press when editable', () => {
      registerTextInputBehavior();
      const onPress = vi.fn();
      const node = makeTextInput();
      routeProp(node, 'onPress', onPress);
      mount(node);

      press(node);

      expect(onPress).toHaveBeenCalledTimes(1);
      expect(commandsNamed('focus')).toHaveLength(1);
    });

    // TextInput.js: `if (editable !== false) { inputRef.current.focus(); }` — the app's own
    // onPress still fires either way, only the auto-focus is gated.
    it('does not auto-focus when editable is false, but still calls onPress', () => {
      registerTextInputBehavior();
      const onPress = vi.fn();
      const node = makeTextInput();
      routeProp(node, 'onPress', onPress);
      routeProp(node, 'editable', false);
      mount(node);

      press(node);

      expect(onPress).toHaveBeenCalledTimes(1);
      expect(commandsNamed('focus')).toHaveLength(0);
    });

    // Unlike the Touchables (which pass 0), TextInput leaves `minPressDuration` unset, so
    // `onPressOut` waits for `DEFAULT_MIN_PRESS_DURATION_MS`.
    it('forwards onPressIn and onPressOut raw, with no wrapping', async () => {
      vi.useFakeTimers();
      registerTextInputBehavior();
      const onPressIn = vi.fn();
      const onPressOut = vi.fn();
      const node = makeTextInput();
      routeProp(node, 'onPressIn', onPressIn);
      routeProp(node, 'onPressOut', onPressOut);
      mount(node);

      listenerOf(node, 'pressIn')(EMPTY_EVENT);
      listenerOf(node, 'startShouldSetResponder')(EMPTY_EVENT);
      listenerOf(node, 'pressOut')(EMPTY_EVENT);
      await vi.advanceTimersByTimeAsync(130);

      expect(onPressIn).toHaveBeenCalledTimes(1);
      expect(onPressOut).toHaveBeenCalledTimes(1);
    });
  });
});
