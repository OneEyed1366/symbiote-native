// The TextInput machine as an engine-node behavior. Everything here is asserted on the COMMITTED
// Fabric payload or on the recorder's `commands` list — the two things a device would actually
// see — because every failure this behavior can have (a mirror seeded too late, a count that never
// reaches the payload, a caret sent to 0 instead of the sentinel) is invisible on `node.props`.
import { afterEach, describe, expect, it, vi } from 'vitest';
// Relative rather than by package name: `core/components` does not declare test-utils, matching
// the sibling pressable suite.
import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  currentlyFocusedInput,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  buildTextInputHandle,
  registerTextInputBehavior,
  TEXT_INPUT_TAG,
} from './text-input';
import { INITIAL_EVENT_COUNT } from '../state/text-input';

const fabric = installFabric();
let nextRootTag = 7000;

// PRODUCTION SHAPE. An adapter resolves the intrinsic tag through `descriptorFor` and calls
// `createElement` with the FABRIC view name — the single-line input arrives as
// `RCTSinglelineTextInputView` (component-names/index.ios.ts, the headless default). Building the
// subject as `createElement(TEXT_INPUT_TAG)` would pass the tag AS the Fabric name, make the
// registry key match by accident, and leave every case below green over a registration that can
// never fire in an app (`.claude/rules/test-harness-false-greens.md` §11).
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

// A commit that changes nothing returns ABOVE the point where the behavior hooks are drained
// (`commit.ts`, the `!result.changed` early return), so a second beat needs a real prop write to
// exist at all. Writing the app's `value` is the real beat anyway — it is what the controlled
// handshake compares against.
function commitValue(
  surface: ReturnType<typeof mount>,
  node: ISymbioteNode,
  value: string,
): void {
  routeProp(node, 'value', value);
  surface.commit();
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
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

// The LIVE tree, by testID — never `fabric.find()`, which searches `created` and hands back the
// pre-clone node with its mount-time props.
function committedPropsOf(testID: string): Record<string, unknown> | undefined {
  const walk = (
    nodes: readonly IFakeNode[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node.props;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
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
  // Clears `commands` too, which every case here counts.
  fabric.reset();
});

describe('text input host behavior', () => {
  // THE CREATE PAYLOAD, and the only assertion in this file that reads the tree before an event.
  // Every wrapper hands the count to `renderTextInput` on every render, so a COMPONENT-path input
  // commits `mostRecentEventCount: 0` at create; the behavior used to write the key only inside the
  // change handshake, so a LOWERED input committed without it until the user typed. Two spellings of
  // one primitive disagreeing on the create payload — found by three adapters' equivalence arms
  // independently, 2026-09-01.
  //
  // Asserted on the committed payload rather than on `node.props`: a mirror the behavior keeps for
  // itself is exactly what was already correct here, and would pass with the fix reverted.
  it('seeds the acknowledged count into the create payload', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'testID', TEST_ID);
    mount(node);

    expect(committedPropsOf(TEST_ID)).toMatchObject({
      mostRecentEventCount: INITIAL_EVENT_COUNT,
    });
  });

  // Two independent consequences of ONE cause: the app's own handler still fires (it was parked in
  // the stash, not evicted by the machine's dispatcher) AND the acknowledged count reaches the
  // committed payload. A callback sitting directly in the listener slot gives the first and cannot
  // give the second; a machine that swallowed the app's callback gives the second and not the
  // first. No single mistake satisfies both.
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

  // THE WRAPPER-DERIVED CALLBACK, and the reason it is asserted here rather than in an adapter.
  // `onValueChange(text, event)` is not a Fabric event — it is a fold the component wrapper did over
  // the raw `change` payload. A LOWERED element has no wrapper, so before this the app's callback
  // reached `node.props` as a function key, `fabricProps` dropped it, and nothing ever called it:
  // the field echoed keystrokes natively while every derived value in the app stayed frozen. Found
  // on device 2026-08-31 in examples/solid's canary ("Hello, stranger" never updated).
  //
  // Same class as `value -> text`, and the same repair: below the fork, so all five adapters inherit
  // it. The alternative — refusing to lower an element carrying the prop — is the transform learning
  // a fold the runtime can perfectly well do.
  it('calls the app onValueChange with the folded text on a change', () => {
    registerTextInputBehavior();
    const onValueChange = vi.fn();
    const node = makeTextInput();
    routeProp(node, 'onValueChange', onValueChange);
    mount(node);

    listenerOf(node, 'change')(changeEvent('ab', NATIVE_EVENT_COUNT));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0][0]).toBe('ab');
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

  // The seed's whole reason to exist. `value` was already carried down at createNode, so the first
  // beat must read it as ALREADY NATIVE, not as a divergence — otherwise every controlled input in
  // the tree commands a redundant write to native on mount.
  it('does not command text down on the first commit of a mount-time value', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'value', 'seeded');
    mount(node);

    expect(commandsNamed('setTextAndSelection')).toHaveLength(0);
  });

  // The other half: once the app's value genuinely diverges from the mirror, the command goes out —
  // and with the caret sentinel, since no `selection` prop was given. 0/0 here would jump the caret
  // to the front of the field on every controlled write.
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

  it('sends an explicit selection, defaulting end to start', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'selection', { start: 2 });
    const surface = mount(node);

    commitValue(surface, node, 'abcdef');

    expect(commandsNamed('setTextAndSelection')[0].args).toEqual([
      0,
      'abcdef',
      2,
      2,
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

  // THE IMPERATIVE BLUR MUST CLEAR APP-WIDE FOCUS TRACKING SYNCHRONOUSLY, and the raw view command
  // this used to send does not. It looks equivalent because this behavior's own `blur` LISTENER
  // also calls `setInputBlurred` — but that listener fires on the NATIVE event, which is the one
  // thing an imperative blur cannot count on: native sends nothing when the input was already
  // blurred, or when the command is dropped. `Keyboard.dismiss()` reads `currentlyFocusedInput()`,
  // so a stale entry aims a blur at a node that no longer holds focus.
  //
  // The component path routes through `blurTextInput` for exactly this reason and says so
  // (`react/src/components/text-input/index.ts`). The two paths must not differ here: an app
  // calling `.blur()` cannot tell which one it is on.
  //
  // No native blur event is fired below — that is the whole point of the case. Firing one would
  // make it pass against the raw command too.
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

  // `clear` goes down the same stale-safe path a controlled write takes, and it must also move the
  // mirror to '' — the app's own `value` follows the clear a moment later, and against a stale
  // mirror that empty value reads as a divergence and commands a second, redundant write.
  it('clears through setTextAndSelection and moves the mirror with it', () => {
    registerTextInputBehavior();
    const node = makeTextInput();
    routeProp(node, 'value', 'abc');
    const surface = mount(node);
    const handle = buildTextInputHandle(node);

    handle.clear();
    expect(commandsNamed('setTextAndSelection')[0].args).toEqual([0, '', 0, 0]);

    commitValue(surface, node, '');

    expect(commandsNamed('setTextAndSelection')).toHaveLength(1);
  });

  // A selection move must not rewrite the text: it echoes what native currently holds, which after
  // a change is the text native reported — never the app's `value`.
  it('moves the selection over the CURRENT text, not the app value', () => {
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
      'native text',
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

    expect(plain.listeners?.get('change')).toBeUndefined();
  });
});
