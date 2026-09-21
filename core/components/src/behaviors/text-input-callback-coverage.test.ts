// Every app-facing callback on `TextInput` must reach the app from the TAG — there is no framework
// component in front of it to fold anything.
//
// WHY THIS FILE EXISTS RATHER THAN ONE MORE CASE IN THE SUITE NEXT DOOR. `onValueChange` did not
// reach the app, and the defect survived every suite in the repo: it is not a Fabric event name, so
// nothing about the engine, the view config or the event routing was wrong, and the four callbacks
// beside it worked. What made it findable only on a device is that the input still ECHOES
// KEYSTROKES — native owns its own text — so the field looks alive while every value the app
// derives from it stays frozen. A canary that reads as working.
//
// The repair that generalises is not another hand-written case; a hand list is what was already
// wrong. The case table is checked against `TEXT_INPUT_CALLBACK_NAMES`, which is DERIVED FROM THE
// PROP TYPE in `state/text-input.ts` — so a callback added there fails this file until somebody
// states which native event must reach it and with what arguments.
//
// Adapters are deliberately absent. The wrapper path has its own coverage per adapter, and the
// question this file asks — does the callback survive with NO wrapper — is answered once, below
// the fork, for all five.
import { describe, expect, it, vi } from 'vitest';
// Relative rather than by package name: `core/components` does not declare test-utils, matching
// the sibling text-input and pressable suites.
import { installRecordingFabric } from '../../../test-utils/src/index';
import {
  appListenerFor,
  createElement,
  createSurface,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { TEXT_INPUT_CALLBACK_NAMES } from '../state/text-input';
import { registerTextInputBehavior, TEXT_INPUT_TAG } from './text-input';

// A RECORDING host: nothing here reads a committed tree.
installRecordingFabric();
registerTextInputBehavior();

let nextRootTag = 7600;

// PRODUCTION SHAPE — the Fabric view name as the component, the intrinsic tag as the third
// argument. Passing the tag AS the component makes the behavior registry match by accident and
// leaves every row green over a registration that can never fire in an app
// (`.claude/rules/test-harness-false-greens.md` §11).
const TEXT_INPUT_VIEW_NAME = 'RCTSinglelineTextInputView';

interface ICallbackCase {
  // The native event whose arrival must reach this callback.
  nativeEvent: string;
  payload: ISymbioteEvent;
  // What the app's handler must receive. A FOLD gets more than the raw event; a pass-through gets
  // it alone — and that distinction is exactly the one `onValueChange` fell through, so the table
  // states it per row rather than assuming every callback is a pass-through.
  expected: (payload: ISymbioteEvent) => readonly unknown[];
  // Fired before `nativeEvent`, for a row whose machine REFUSES to fire in isolation — `pressOut`
  // with no matching `pressIn` is deliberately a no-op (`state/pressable.ts`'s `deactivate` returns
  // early when nothing activated it), which is the real invariant the machine enforces, not a gap
  // in this table.
  arm?: (node: ISymbioteNode) => void;
}

const passthrough = (
  nativeEvent: string,
  nativeEventPayload: Record<string, unknown>,
): ICallbackCase => ({
  nativeEvent,
  payload: { nativeEvent: nativeEventPayload },
  expected: payload => [payload],
});

const CALLBACK_CASES: Record<string, ICallbackCase> = {
  // The one fold: not a Fabric event name at all, so nothing routes it. ONE argument — the event,
  // with `text` carried on it as a field, mutated in place by `Object.assign` — never a second
  // `(text, event)` argument (Svelte's `target_handler` crashes on a bare-string sole argument).
  onValueChange: {
    nativeEvent: 'change',
    payload: { nativeEvent: { text: 'typed', eventCount: 4 } },
    expected: payload => [payload],
  },
  // TextInput.js:506 — `props.onChangeText(currentText)`, off the SAME change event as
  // `onValueChange`. RN's real signature takes the bare string; ours carries it as a FIELD on the
  // event instead, for the identical Svelte-safety reason `onValueChange` does
  // (`host-tag-invariants.test.ts`).
  onChangeText: {
    nativeEvent: 'change',
    payload: { nativeEvent: { text: 'typed', eventCount: 4 } },
    expected: payload => [payload],
  },
  // Owned by the machine (`ownedListeners`), so the app's handler is parked in the stash and the
  // behavior is what calls it. A row that passes here proves the stash forwards, not merely that
  // some listener exists.
  onFocus: passthrough('focus', {}),
  onBlur: passthrough('blur', {}),
  // Pass-throughs: declared in the view config's TEXT_INPUT_EVENTS, routed as ordinary events,
  // untouched by the machine. Cheap to assert, and worth asserting because "untouched" is a claim
  // about code nobody is watching — these same keys were missing under the Android names once,
  // which killed the events on that platform alone.
  onEndEditing: passthrough('endEditing', { text: 'final' }),
  onSubmitEditing: passthrough('submitEditing', { text: 'final' }),
  onKeyPress: passthrough('keyPress', { key: 'a' }),
  onSelectionChange: passthrough('selectionChange', {
    selection: { start: 1, end: 2 },
  }),
  onContentSizeChange: passthrough('contentSizeChange', {
    contentSize: { width: 120, height: 40 },
  }),
  // TextInput.js's own `usePressability` — forwarded to the app exactly as the machine hands them
  // to `config.onPress`/`onPressIn`/`onPressOut`, no fold. `onPress` ALSO triggers the machine's
  // Android touch-sound path (`Pressability.js:754`, `onPress != null` — always true here, since
  // the refine's wrapper is unconditional, matching vendor's own always-present config.onPress) —
  // not this row's concern, covered by `pressable-sound.test.ts`.
  onPress: passthrough('press', {}),
  onPressIn: passthrough('pressIn', {}),
  onPressOut: {
    ...passthrough('pressOut', {}),
    // `minPressDuration: 0` collapses the deactivation floor to synchronous, so `finish()` runs
    // inline instead of on a real timer this test does not advance. A prior `pressIn` is what
    // arms `deactivate` at all — see the `arm` field's own doc.
    arm: node => {
      routeProp(node, 'minPressDuration', 0);
      listenerOf(node, 'pressIn')({ nativeEvent: {} });
    },
  },
};

function makeTextInput(): ISymbioteNode {
  return createElement(TEXT_INPUT_VIEW_NAME, false, TEXT_INPUT_TAG);
}

function mount(node: ISymbioteNode): void {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined) {
    throw new Error(`no "${name}" listener installed`);
  }
  return listener;
}

describe('TextInput callbacks on the tag', () => {
  // The half that keeps the table honest as the prop type grows. Both directions, because the two
  // failures are different bugs: a name in the type with no row is an UNTESTED callback, and a row
  // for a name the type does not declare is a row testing nothing.
  it('covers exactly the callbacks the prop type declares', () => {
    expect([...Object.keys(CALLBACK_CASES)].sort()).toEqual(
      [...TEXT_INPUT_CALLBACK_NAMES].sort(),
    );
  });

  // CONTROL. Seven of the eight rows below would also pass on a node carrying NO behavior at all —
  // a pass-through reaches the app through plain event routing, machine or not. So a green table is
  // not by itself evidence that the tag is wired, and this asserts the one thing that distinguishes
  // the two: an OWNED event lands in the stash instead of overwriting the machine.
  it('attaches the machine to the tag, so the rows below mean something', () => {
    const node = makeTextInput();
    const appHandler = vi.fn();
    routeProp(node, 'onChange', appHandler);

    expect(appListenerFor(node, 'change')).toBe(appHandler);
    expect(node.listeners?.get('change')).not.toBe(appHandler);
  });

  it.each(Object.entries(CALLBACK_CASES))(
    '%s reaches the app',
    (name, testCase) => {
      const node = makeTextInput();
      const handler = vi.fn();
      routeProp(node, name, handler);
      mount(node);
      testCase.arm?.(node);

      listenerOf(node, testCase.nativeEvent)(testCase.payload);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]).toEqual(
        testCase.expected(testCase.payload),
      );
    },
  );
});
