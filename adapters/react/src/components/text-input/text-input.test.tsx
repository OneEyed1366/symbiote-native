// Proves the TextInput primitive, the controlled-value / event-count handshake, over a
// fake Fabric slot. This file keeps a PURPOSE-BUILT slot rather than the shared
// `installFabric()` harness because TextInput drives a `dispatchCommand`
// (setTextAndSelection / blur) view command, which the shared recorder does not capture.
// It checks the fold (value/defaultValue -> private `text` + mostRecentEventCount), the
// the native change -> onValueChange derivation, the multiline intrinsic, a forced controlled write
// that goes down as a setTextAndSelection command carrying the acknowledged event count,
// Keyboard.dismiss blurring the focused input, the W3C alias folds, and the
// underlineColorAndroid default.
//
// SCOPE: `resolveTextInputProps`/`shouldCommandText`/`foldSubmitBehavior`/`foldText` etc.
// (core/components/src/state/text-input.ts) have NO co-located core-level unit test anywhere in
// the repo (only the Vue/Svelte adapter tests exercise them, same as switch.test.tsx's finding).
// This file is therefore the primary proof of the shared prop-fold/controlled-write logic too,
// not merely React-wiring. No Negative group: nothing here has a throwing path — a malformed
// native change payload is narrowed away (see the ignored-payload test below), never rejected.

import { useRef, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Keyboard,
  TextInput,
  mount,
  unmount,
  type ITextInputHandle,
} from '@symbiote-native/react';

interface IFakeNode {
  tag: number;
  viewName: string;
  props: Record<string, unknown>;
  children: IFakeNode[];
  instanceHandle: unknown;
}

type IEventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void;

interface ICommandCall {
  handle: unknown;
  name: string;
  args: readonly unknown[];
}

let committed: IFakeNode[] = [];
let eventHandler: IEventHandler | undefined;
const allCreated: IFakeNode[] = [];
const commands: ICommandCall[] = [];

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): IFakeNode {
    const node: IFakeNode = {
      tag,
      viewName,
      props,
      children: [],
      instanceHandle,
    };
    allCreated.push(node);
    return node;
  },
  cloneNodeWithNewProps: (
    node: IFakeNode,
    newProps: Record<string, unknown>,
  ): IFakeNode => ({
    ...node,
    props: newProps,
  }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({
    ...node,
    children: [],
  }),
  cloneNodeWithNewChildrenAndProps: (
    node: IFakeNode,
    newProps: Record<string, unknown>,
  ): IFakeNode => ({ ...node, props: newProps, children: [] }),
  createChildSet: (): IFakeNode[] => [],
  appendChild(parent: IFakeNode, child: IFakeNode): IFakeNode {
    parent.children.push(child);
    return parent;
  },
  appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
    childSet.push(child);
  },
  completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
    committed = childSet;
  },
  registerEventHandler(handler: IEventHandler): void {
    eventHandler = handler;
  },
  dispatchCommand(
    handle: unknown,
    name: string,
    args: readonly unknown[],
  ): void {
    commands.push({ handle, name, args });
  },
};

Object.assign(globalThis, { nativeFabricUIManager: slot });

const SINGLELINE = 'RCTSinglelineTextInputView';
const MULTILINE = 'RCTMultilineTextInputView';
const ACK_COUNT = 7;
const ROOT_TAG = 300;

function inputNode(viewName: string): IFakeNode {
  const node = allCreated.find(n => n.viewName === viewName);
  expect(node, `a ${viewName} was created`).toBeDefined();
  return node!;
}

function fireChange(
  node: IFakeNode,
  nativeEvent: Record<string, unknown>,
): void {
  expect(eventHandler, 'an event handler was registered').toBeDefined();
  eventHandler!(node.instanceHandle, 'topChange', nativeEvent);
}

// The event handler is registered once for the whole slot, so reset keeps it.
// Only the per-mount node/command bookkeeping is cleared.
beforeEach(() => {
  committed = [];
  allCreated.length = 0;
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('TextInput', () => {
  // why: `value` is the controlled React prop but native reads a private `text` prop plus an
  // event-count handshake (mostRecentEventCount) — get the fold or the derived onValueChange
  // wrong and the input either doesn't render the caller's text or never reports keystrokes back.
  it('folds the controlled value to text + mostRecentEventCount and derives onValueChange', () => {
    let changedText: string | undefined;
    mount(
      ROOT_TAG,
      <TextInput
        value="hi"
        onValueChange={text => {
          changedText = text;
        }}
      />,
    );

    const node = inputNode(SINGLELINE);
    expect(node.props.text).toBe('hi');
    expect(typeof node.props.mostRecentEventCount).toBe('number');

    fireChange(node, {
      text: 'hix',
      eventCount: 1,
      selection: { start: 3, end: 3 },
    });
    expect(changedText).toBe('hix');
  });

  // why: textFromChange/eventCountFromChange narrow the untyped nativeEvent payload — a
  // malformed change (missing/wrong-typed `text`) must be silently ignored, never forward
  // `undefined`/garbage to the caller's onValueChange as if it were real typed text.
  it('ignores a change event whose nativeEvent.text is not a string', () => {
    let calls = 0;
    mount(
      ROOT_TAG,
      <TextInput
        value="hi"
        onValueChange={() => {
          calls++;
        }}
      />,
    );
    fireChange(inputNode(SINGLELINE), {
      eventCount: 1,
      selection: { start: 0, end: 0 },
    });
    expect(calls).toBe(0);
  });

  // why: RN swaps the whole native intrinsic view for multiline (RCTMultilineTextInputView vs
  // RCTSinglelineTextInputView) — they are genuinely different native components, not the same
  // one with a multiline flag, so picking the wrong one means the wrong editor renders on device.
  it('selects the multiline intrinsic for multiline', () => {
    mount(ROOT_TAG, <TextInput multiline value="x" />);
    inputNode(MULTILINE);
  });

  // why: submitBehavior is RN's replacement for the legacy blurOnSubmit boolean — an unset
  // submitBehavior on a single-line field must still resolve to a real native value
  // ('blurAndSubmit', RN's single-line default) rather than leaving the native prop undefined.
  it('folds an unset submitBehavior to blurAndSubmit on a single-line field', () => {
    mount(ROOT_TAG, <TextInput value="x" />);
    expect(inputNode(SINGLELINE).props.submitBehavior).toBe('blurAndSubmit');
  });

  // why: an explicit submitBehavior is the caller's own choice and must win outright over any
  // derived default — proves the fold doesn't override an explicit value with the legacy path.
  it('lets an explicit submitBehavior win over the derived default', () => {
    mount(ROOT_TAG, <TextInput value="x" submitBehavior="submit" />);
    expect(inputNode(SINGLELINE).props.submitBehavior).toBe('submit');
  });

  it('commands setTextAndSelection with the acked count on a divergent controlled write', () => {
    // why: a plain re-push of the new `value` prop would race the user's next keystroke (native
    // already moved past ACK_COUNT); shouldCommandText's contract is that a divergent controlled
    // write MUST ride the stale-safe setTextAndSelection command, carrying the ACKED event count
    // so native can tell this correction apart from a newer, unrelated keystroke.
    // A real controlled component whose onValueChange UPPERCASES the text: native reports
    // "ab" at ACK_COUNT, the parent stores "AB", so the component must command "AB" down.
    function Forced(): ReactElement {
      const [value, setValue] = useState('');
      return (
        <TextInput
          value={value}
          onValueChange={text => setValue(text.toUpperCase())}
        />
      );
    }
    mount(ROOT_TAG, <Forced />);

    const node = inputNode(SINGLELINE);
    fireChange(node, {
      text: 'ab',
      eventCount: ACK_COUNT,
      selection: { start: 2, end: 2 },
    });

    const setText = commands.find(c => c.name === 'setTextAndSelection');
    expect(
      setText,
      'a setTextAndSelection command was dispatched',
    ).toBeDefined();
    expect(setText!.args[0]).toBe(ACK_COUNT);
    expect(setText!.args[1]).toBe('AB');
  });

  // why: Keyboard.dismiss() is a global, view-agnostic API — it must blur whichever TextInput
  // currently holds focus (tracked from real topFocus events, not a prop), and must be a safe
  // no-op when nothing is focused rather than dispatching a blur to a stale/absent node.
  it('Keyboard.dismiss blurs the focused input and no-ops when nothing holds focus', () => {
    mount(ROOT_TAG, <TextInput value="focus me" />);

    const node = inputNode(SINGLELINE);
    expect(eventHandler, 'an event handler was registered').toBeDefined();
    // Native reports focus -> TextInput records this node as the focused one.
    eventHandler!(node.instanceHandle, 'topFocus', {});
    Keyboard.dismiss();
    expect(commands.some(c => c.name === 'blur')).toBe(true);

    // A second dismiss has nothing focused -> must be a no-op (no new blur command).
    commands.length = 0;
    Keyboard.dismiss();
    expect(commands.some(c => c.name === 'blur')).toBe(false);
  });

  // why: inputMode/enterKeyHint/readOnly are the W3C-standard HTML attribute names — native
  // Fabric only understands the legacy RN prop names (keyboardType/returnKeyType/editable), so
  // every alias must both fold to its native equivalent AND be stripped, or an unknown prop key
  // reaches native untranslated.
  it('folds W3C aliases to their legacy native props and strips the raw aliases', () => {
    mount(
      ROOT_TAG,
      <TextInput
        inputMode="numeric"
        enterKeyHint="done"
        readOnly
        selectionColor="#ff0000"
      />,
    );

    const node = inputNode(SINGLELINE);
    expect(node.props.keyboardType).toBe('number-pad');
    expect(node.props.returnKeyType).toBe('done');
    expect(node.props.editable).toBe(false);
    expect(node.props.cursorColor).toBe('#ff0000');
    for (const raw of ['inputMode', 'enterKeyHint', 'readOnly']) {
      expect(
        raw in node.props,
        `raw alias "${raw}" must not reach Fabric`,
      ).toBe(false);
    }
  });

  // why: a mapped autoComplete token (e.g. "email") must resolve to iOS's textContentType so
  // the system keyboard/autofill can recognize the field, and a normal inputMode must default
  // the soft keyboard to visible (the opposite case, inputMode="none", is tested separately).
  it('folds autoComplete + derives showSoftInputOnFocus:true from inputMode', () => {
    mount(ROOT_TAG, <TextInput autoComplete="email" inputMode="text" />);

    const node = inputNode(SINGLELINE);
    expect(node.props.autoComplete).toBe('email');
    expect(node.props.textContentType).toBe('emailAddress');
    expect(node.props.showSoftInputOnFocus).toBe(true);
  });

  // why: inputMode="none" is the W3C signal for "I render my own custom keyboard/picker" — the
  // system soft keyboard must NOT pop up over it, the opposite of every other inputMode value.
  it('derives showSoftInputOnFocus:false from inputMode="none"', () => {
    mount(ROOT_TAG, <TextInput inputMode="none" />);
    expect(inputNode(SINGLELINE).props.showSoftInputOnFocus).toBe(false);
  });

  // why: not every autoComplete token has a bespoke mapping table entry — an unrecognized-but-
  // valid token must still pass through as the raw autoComplete value while still resolving a
  // real iOS textContentType, rather than silently dropping to undefined for anything unmapped.
  it('passes an unmapped autoComplete token through with its iOS textContentType', () => {
    mount(ROOT_TAG, <TextInput autoComplete="cc-name" />);
    const node = inputNode(SINGLELINE);
    expect(node.props.autoComplete).toBe('cc-name');
    expect(node.props.textContentType).toBe('creditCardName');
  });

  // why: RN's Material EditText paints a visible underline by default; every host silently
  // getting one uninvited would be a visual regression, so the default must actively suppress it.
  it('defaults underlineColorAndroid to transparent', () => {
    mount(ROOT_TAG, <TextInput value="x" />);
    expect(inputNode(SINGLELINE).props.underlineColorAndroid).toBe(
      'transparent',
    );
  });

  // why: the transparent default above must not be hardcoded past an explicit caller choice —
  // a designer who deliberately wants the underline back must be able to set it.
  it('lets an explicit underlineColorAndroid win', () => {
    mount(ROOT_TAG, <TextInput value="x" underlineColorAndroid="#00ff00" />);
    expect(inputNode(SINGLELINE).props.underlineColorAndroid).toBe('#00ff00');
  });

  // why: RN drives autoFocus in JS with an imperative `focus` command on mount (TextInput.js),
  // not a native prop — proves the effect actually fires exactly once for a genuinely
  // autoFocus-ed field, and does NOT fire at all when the prop is unset (a spurious focus steal
  // would be a real UX bug: it would pop the keyboard over a field the user never touched).
  it('commands focus once on mount when autoFocus is set, and not when unset', () => {
    mount(ROOT_TAG, <TextInput value="x" autoFocus />);
    expect(commands.filter(c => c.name === 'focus')).toHaveLength(1);

    commands.length = 0;
    unmount(ROOT_TAG);
    mount(ROOT_TAG, <TextInput value="x" />);
    expect(commands.some(c => c.name === 'focus')).toBe(false);
  });

  // why: RN exposes an imperative ref (focus/blur/clear/isFocused/setSelection) for the common
  // case of driving a TextInput without going through the controlled-value prop — each method
  // must dispatch the real native command a caller (e.g. a "next field" button) depends on.
  describe('imperative ref handle', () => {
    // The ref object itself is captured at render time (synchronous, before commit); mount()'s
    // updateContainerSync + flushSyncWork commits and attaches refs synchronously, so `.current`
    // is populated by the time mount() returns — no effect/timer needed to observe it.
    let capturedRef: { current: ITextInputHandle | null } | undefined;
    function Handle(): ReactElement {
      const ref = useRef<ITextInputHandle>(null);
      capturedRef = ref;
      return <TextInput ref={ref} value="hello" />;
    }
    function mountHandle(): ITextInputHandle {
      mount(ROOT_TAG, <Handle />);
      const handle = capturedRef?.current;
      expect(handle, 'the imperative handle was attached').not.toBeNull();
      return handle!;
    }

    it('focus() dispatches a focus command', () => {
      mountHandle().focus();
      expect(commands.some(c => c.name === 'focus')).toBe(true);
    });

    it('blur() dispatches a blur command', () => {
      mountHandle().blur();
      expect(commands.some(c => c.name === 'blur')).toBe(true);
    });

    // why: clear() must reset native to an EMPTY string via the same acked-count command path
    // as any other controlled write, not just visually — a caller reading the handle's own
    // bookkeeping right after clear() must see the field as genuinely empty.
    it('clear() commands setTextAndSelection with an empty string', () => {
      mountHandle().clear();
      const setText = commands.find(c => c.name === 'setTextAndSelection');
      expect(
        setText,
        'a setTextAndSelection command was dispatched',
      ).toBeDefined();
      expect(setText!.args[1]).toBe('');
    });

    // why: isFocused() must reflect REAL native focus/blur events (topFocus/topBlur), not a
    // caller's own assumption — it starts false, flips true on native focus, flips back on blur.
    it('isFocused() tracks real native topFocus/topBlur events', () => {
      const handle = mountHandle();
      expect(handle.isFocused()).toBe(false);

      const node = inputNode(SINGLELINE);
      eventHandler!(node.instanceHandle, 'topFocus', {});
      expect(handle.isFocused()).toBe(true);

      eventHandler!(node.instanceHandle, 'topBlur', {});
      expect(handle.isFocused()).toBe(false);
    });

    // why: setSelection reuses the same stale-safe setTextAndSelection command as a controlled
    // write (echoing the current text, not clobbering it) — a caller moving the cursor
    // programmatically must not accidentally erase what the user typed.
    it('setSelection(start, end) commands setTextAndSelection carrying the current text', () => {
      mountHandle().setSelection(1, 3);
      const setText = commands.find(c => c.name === 'setTextAndSelection');
      expect(
        setText,
        'a setTextAndSelection command was dispatched',
      ).toBeDefined();
      expect(setText!.args[1]).toBe('hello');
      expect(setText!.args[2]).toBe(1);
      expect(setText!.args[3]).toBe(3);
    });
  });
});
