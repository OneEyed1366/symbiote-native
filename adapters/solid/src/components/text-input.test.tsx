// Solid twin of adapters/react/src/components/text-input/text-input.test.tsx and the Vue/Svelte
// ones. Drives REAL compiled Solid JSX (the vitest `solid` project runs the same babel-preset-solid
// options the app-facing babel-preset.cjs pins) through the universal renderer into the fake Fabric
// slot: the intrinsic choice, the value/defaultValue -> private `text` fold, the W3C alias folds,
// the native change -> onValueChange derivation, the controlled setTextAndSelection handshake, the
// focus/blur pair, and the imperative handle.
//
// Several cases have no counterpart in the React file and exist because Solid's lifecycle is the
// one thing NOT shared with it: a component body runs once and there is no reconciler between what
// we return and the host node, so "a prop updates after mount", "the host node keeps its identity
// across a keystroke", and "autoFocus waits for the commit that assigns the Fabric tag" are real,
// silently-breakable claims here rather than tautologies.
//
// Negative group: a native change payload carrying no text.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Keyboard, type ISymbioteEvent } from '@symbiote-native/engine';
import { mount, unmount } from '../render';
import { TextInput, type ITextInputHandle } from './text-input';

const ROOT_TAG = 913;
const SINGLELINE_VIEW = 'RCTSinglelineTextInputView';
const MULTILINE_VIEW = 'RCTMultilineTextInputView';
// RN's "leave the caret alone" sentinel, echoed by a controlled write with no explicit selection.
const NO_SELECTION = -1;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// The created node's props are frozen at first commit (clone-on-write hands back a new object), so
// anything asserted after an update must be read off the live committed tree.
function committedInput(viewName: string = SINGLELINE_VIEW): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === viewName) found = node;
  });
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

// The creation-time record, whose instanceHandle is what the slot dispatches events at.
function createdInput(viewName: string = SINGLELINE_VIEW): IFakeNode {
  const node = fabric.find(n => n.viewName === viewName);
  if (node === undefined) throw new Error(`no ${viewName} was created`);
  return node;
}

function type(
  text: string,
  eventCount: number,
  viewName: string = SINGLELINE_VIEW,
): void {
  fabric.fireEvent(createdInput(viewName).instanceHandle, 'topChange', {
    text,
    eventCount,
  });
}

describe('Solid TextInput on the engine', () => {
  describe('Positive', () => {
    // why: there is NO `value` Fabric prop — RN folds value/defaultValue into the private `text`
    // prop plus a `mostRecentEventCount` counter. Sending `value` instead would reach a native view
    // that ignores it, and the field would simply never paint.
    it('folds value into the private text prop on the singleline intrinsic', async () => {
      mount(ROOT_TAG, () => <TextInput value="hello" />);
      await tick();

      const props = committedInput().props;
      expect(props.text).toBe('hello');
      expect(props.mostRecentEventCount).toBe(0);
      expect('value' in props).toBe(false);
    });

    // why: `multiline` picks a DIFFERENT native view class, not a prop on the same one — getting it
    // wrong gives a single-line field that silently refuses newlines.
    it('renders the multiline intrinsic when multiline is set', async () => {
      mount(ROOT_TAG, () => <TextInput multiline value="two lines" />);
      await tick();
      expect(committedInput(MULTILINE_VIEW).props.text).toBe('two lines');
    });

    // why: defaultValue is the uncontrolled seed — value wins when both are set (RN's foldText), so
    // an input with only a defaultValue must still paint it.
    it('falls back to defaultValue when value is absent', async () => {
      mount(ROOT_TAG, () => <TextInput defaultValue="seed" />);
      await tick();
      expect(committedInput().props.text).toBe('seed');
    });

    // why: RN's own aliases are folded in JS and are INERT at the native layer — forwarding
    // `inputMode`/`enterKeyHint`/`readOnly` raw would leave the keyboard and the return key at
    // their defaults while every JS-level check still passed.
    it('folds the W3C aliases onto their native props', async () => {
      mount(ROOT_TAG, () => (
        <TextInput
          inputMode="email"
          enterKeyHint="send"
          readOnly
          autoComplete="username"
        />
      ));
      await tick();

      const props = committedInput().props;
      expect(props.keyboardType).toBe('email-address');
      expect(props.returnKeyType).toBe('send');
      expect(props.editable).toBe(false);
      // One W3C token resolves BOTH platforms' native props; the inert one rides along.
      expect(props.autoComplete).toBe('username');
      expect(props.textContentType).toBe('username');
      // RN hides Android's Material EditText bar by default (TextInput.js:908).
      expect(props.underlineColorAndroid).toBe('transparent');
      // Single-line with no explicit submitBehavior blurs on submit.
      expect(props.submitBehavior).toBe('blurAndSubmit');
    });

    // why: placeholder/secureTextEntry/maxLength/autoCapitalize and friends are real Fabric props
    // this adapter never names — they ride through `passthrough` untouched. A split list that
    // swallowed them would drop half the public surface with no error anywhere.
    it('forwards the un-handled native props onto the host node', async () => {
      mount(ROOT_TAG, () => (
        <TextInput
          placeholder="email"
          placeholderTextColor="#999"
          secureTextEntry
          maxLength={12}
          autoCapitalize="none"
          autoCorrect={false}
          selectTextOnFocus
          inputAccessoryViewID="bar"
          testID="field"
        />
      ));
      await tick();

      const props = committedInput().props;
      expect(props.placeholder).toBe('email');
      expect(props.placeholderTextColor).toBe('#999');
      expect(props.secureTextEntry).toBe(true);
      expect(props.maxLength).toBe(12);
      expect(props.autoCapitalize).toBe('none');
      expect(props.autoCorrect).toBe(false);
      expect(props.selectTextOnFocus).toBe(true);
      expect(props.inputAccessoryViewID).toBe('bar');
      expect(props.testID).toBe('field');
    });

    // why: native reads only `accessibility*`; the web aliases must be folded in JS before commit.
    // TextInput owns its host element rather than rendering through a View, so the fold is this
    // component's own job — skipping it leaves the field unlabelled for a screen reader.
    it('folds aria aliases into the canonical accessibility props', async () => {
      mount(ROOT_TAG, () => <TextInput aria-label="email" aria-disabled />);
      await tick();

      const props = committedInput().props;
      expect(props.accessibilityLabel).toBe('email');
      expect(props.accessibilityState).toEqual({ disabled: true });
    });

    // why: RN's change payload carries the text and the native event counter; the callback hands
    // the caller the plain string (the common case) plus the raw event for anyone reading
    // nativeEvent.eventCount. The counter must ride back down or native rejects every later write.
    it('derives onValueChange from the change payload and echoes the acknowledged count', async () => {
      let seen: string | undefined;
      let rawCount: unknown;
      const [value, setValue] = createSignal('a');
      mount(ROOT_TAG, () => (
        <TextInput
          value={value()}
          onValueChange={(text, event: ISymbioteEvent) => {
            seen = text;
            rawCount = event.nativeEvent.eventCount;
            setValue(text);
          }}
        />
      ));
      await tick();

      type('ab', 1);
      await tick();

      expect(seen).toBe('ab');
      expect(rawCount).toBe(1);
      expect(committedInput().props.text).toBe('ab');
      expect(committedInput().props.mostRecentEventCount).toBe(1);
    });

    // why: Solid runs a component body ONCE, and there is no reconciler between what this component
    // returns and the host node. Every prop read sits inside an accessor precisely so a later change
    // still reaches the SAME native view — a destructure would freeze the input at its mount-time
    // props, and a rebuilt subtree would drop the cursor and the keyboard mid-typing.
    it('re-commits the same native node when a prop changes after mount', async () => {
      const [placeholder, setPlaceholder] = createSignal('before');
      mount(ROOT_TAG, () => <TextInput placeholder={placeholder()} />);
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(committedInput().props.placeholder).toBe('before');

      setPlaceholder('after');
      await tick();

      expect(committedInput().props.placeholder).toBe('after');
      expect(fabric.counts.createNode, 'the host node kept its identity').toBe(
        createdAtMount,
      );
    });

    // why: the controlled round trip's failure case. Native has ALREADY changed its own text when
    // the event arrives; a handler that refuses the change leaves `value` untouched, so nothing
    // re-commits and a prop re-push cannot correct anything. Only setTextAndSelection carrying the
    // ACKNOWLEDGED count (native's eventLag check drops any other) puts the old text back.
    it('commands the old text back when a no-op handler refuses the change', async () => {
      const [value] = createSignal('a');
      mount(ROOT_TAG, () => (
        <TextInput value={value()} onValueChange={() => {}} />
      ));
      await tick();

      type('ab', 1);
      await tick();

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('setTextAndSelection');
      expect(fabric.commands[0]?.args).toEqual([
        1,
        'a',
        NO_SELECTION,
        NO_SELECTION,
      ]);
    });

    // why: the counterpart — an always-fire controlled write would fight the user on every accepted
    // keystroke, re-setting the text native already holds and jumping the cursor.
    it('issues no command when the handler accepts the change', async () => {
      const [value, setValue] = createSignal('a');
      mount(ROOT_TAG, () => (
        <TextInput value={value()} onValueChange={setValue} />
      ));
      await tick();

      type('ab', 1);
      await tick();

      expect(committedInput().props.text).toBe('ab');
      expect(fabric.commands).toHaveLength(0);
    });

    // why: the mount-time `text` prop already carries the first value down via createNode, so it is
    // not a divergence — commanding there would fight the very first render, and (worse) would do
    // it before the node has a Fabric tag, i.e. silently.
    it('issues no command on initial mount', async () => {
      mount(ROOT_TAG, () => <TextInput value="a" />);
      await tick();
      expect(fabric.commands).toHaveLength(0);
    });

    // why: a purely programmatic value change (no native event in between) is still a divergence
    // from what native holds and must be commanded down, not just re-propped.
    it('commands a programmatic value change down with the acknowledged count', async () => {
      const [value, setValue] = createSignal('a');
      mount(ROOT_TAG, () => <TextInput value={value()} />);
      await tick();

      setValue('b');
      await tick();

      expect(committedInput().props.text).toBe('b');
      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.args).toEqual([
        0,
        'b',
        NO_SELECTION,
        NO_SELECTION,
      ]);
    });

    // why: THE mount-time-native-call trap of this adapter. The engine commits on a microtask, so
    // the node has no Fabric tag while the component body runs and a bare dispatchViewCommand there
    // is silently dropped — no error, no focus, and every headless prop assertion still green.
    // whenCommitted defers it to the commit that assigns the tag.
    it('fires autoFocus only after the commit that assigns the Fabric tag', async () => {
      mount(ROOT_TAG, () => <TextInput autoFocus />);
      // Synchronously after mount the node exists in the retained tree but has never been
      // committed: nothing may have been dispatched yet.
      expect(fabric.commands).toHaveLength(0);

      await tick();

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('focus');
      expect(fabric.commands[0]?.args).toEqual([]);
    });

    // why: the counterpart — a focus command on every mount would steal the keyboard from whatever
    // the user was actually typing in.
    it('issues no focus command without autoFocus', async () => {
      mount(ROOT_TAG, () => <TextInput value="a" />);
      await tick();
      expect(fabric.commands).toHaveLength(0);
    });

    // why: focus/blur are the only source of truth for isFocused() (native has no synchronous
    // getter), and they must ALSO reach the caller's own handlers — our wrappers replace them on
    // the host node, so a wrapper that forgot to call through would swallow them silently.
    it('tracks focus state and forwards the focus/blur pair to the caller', async () => {
      const seen: string[] = [];
      let handle: ITextInputHandle | undefined;
      mount(ROOT_TAG, () => (
        <TextInput
          ref={instance => (handle = instance)}
          onFocus={() => seen.push('focus')}
          onBlur={() => seen.push('blur')}
        />
      ));
      await tick();
      expect(handle?.isFocused()).toBe(false);

      fabric.fireEvent(createdInput().instanceHandle, 'topFocus', {});
      expect(handle?.isFocused()).toBe(true);

      fabric.fireEvent(createdInput().instanceHandle, 'topBlur', {});
      expect(handle?.isFocused()).toBe(false);
      expect(seen).toEqual(['focus', 'blur']);
    });

    // why: the focus event also registers the input app-wide so Keyboard.dismiss can blur whatever
    // holds focus WITHOUT a ref (RN's dismissKeyboard). Dropping that registration leaves the
    // keyboard up with no error anywhere.
    it('registers the focused input so Keyboard.dismiss can blur it', async () => {
      mount(ROOT_TAG, () => <TextInput />);
      await tick();

      fabric.fireEvent(createdInput().instanceHandle, 'topFocus', {});
      Keyboard.dismiss();

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('blur');
    });

    // why: `selection` is a controlled caret, and onSelectionChange is a real ViewConfig event on
    // this view — an adapter that swallowed either would leave a caret the app cannot place or
    // observe.
    it('passes the controlled selection down and reports selection changes', async () => {
      let reported: unknown;
      mount(ROOT_TAG, () => (
        <TextInput
          value="hello"
          selection={{ start: 1, end: 3 }}
          onSelectionChange={(event: ISymbioteEvent) => {
            reported = event.nativeEvent.selection;
          }}
        />
      ));
      await tick();

      expect(committedInput().props.selection).toEqual({ start: 1, end: 3 });

      fabric.fireEvent(createdInput().instanceHandle, 'topSelectionChange', {
        selection: { start: 2, end: 2 },
      });
      expect(reported).toEqual({ start: 2, end: 2 });
    });

    // why: a controlled write must carry the caller's selection rather than the -1 sentinel, or the
    // caret jumps to wherever native left it on every programmatic edit.
    it('carries an explicit selection into the controlled write', async () => {
      const [value, setValue] = createSignal('a');
      mount(ROOT_TAG, () => (
        <TextInput value={value()} selection={{ start: 2, end: 4 }} />
      ));
      await tick();

      setValue('abcd');
      await tick();

      expect(fabric.commands[0]?.args).toEqual([0, 'abcd', 2, 4]);
    });

    // why: the imperative half of RN's public API. clear/setSelection go down the SAME stale-safe
    // path as a controlled write and must echo the acknowledged count — with a stale count native's
    // eventLag check drops them and the ref appears to do nothing.
    it('drives focus / blur / clear / setSelection through the ref', async () => {
      let handle: ITextInputHandle | undefined;
      mount(ROOT_TAG, () => (
        <TextInput ref={instance => (handle = instance)} defaultValue="hello" />
      ));
      await tick();

      type('hey', 3);
      await tick();
      fabric.commands.length = 0;

      handle?.focus();
      handle?.setSelection(1, 2);
      handle?.clear();
      handle?.blur();

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'focus',
        'setTextAndSelection',
        'setTextAndSelection',
        'blur',
      ]);
      expect(fabric.commands[1]?.args).toEqual([3, 'hey', 1, 2]);
      expect(fabric.commands[2]?.args).toEqual([3, '', 0, 0]);
    });

    // why: the JS-only props must not reach Fabric. defaultValue and inputMode are folded away in
    // JS (into `text` and `keyboardType`) and are dead weight — or worse, an unknown prop — at the
    // native layer; onValueChange is plain JS, not a ViewConfig event, and a function on the prop
    // bag crashes Android's folly::dynamic serializer the moment it tries to stringify it. (The
    // engine also drops function props at the commit boundary — fabric-props.ts — so this last
    // assertion pins a contract two layers hold, not this adapter alone.)
    it('never forwards the JS-only props onto the native prop bag', async () => {
      mount(ROOT_TAG, () => (
        <TextInput
          value="a"
          defaultValue="seed"
          inputMode="email"
          onValueChange={() => {}}
        />
      ));
      await tick();

      const props = committedInput().props;
      expect('onValueChange' in props).toBe(false);
      expect('defaultValue' in props).toBe(false);
      expect('inputMode' in props).toBe(false);
    });

    // why: single- and multiline are different NATIVE views, so a runtime flip cannot be a prop
    // update — the host node has to be rebuilt (React remounts, Vue h()s a new type, Svelte swaps
    // an {#if} branch). Solid's bridge builds a node's shape ONCE, so without the swap this throws
    // instead of painting.
    it('rebuilds the host node when multiline flips after mount', async () => {
      const [multiline, setMultiline] = createSignal(false);
      mount(ROOT_TAG, () => <TextInput multiline={multiline()} value="a" />);
      await tick();
      expect(committedInput(SINGLELINE_VIEW).props.text).toBe('a');

      setMultiline(true);
      await tick();

      expect(committedInput(MULTILINE_VIEW).props.text).toBe('a');
      expect(fabric.committed.length).toBeGreaterThan(0);
    });
  });

  describe('Negative', () => {
    // why: textFromChange narrows nativeEvent.text to a string — a malformed payload must be
    // silently ignored (no callback, no bookkeeping, no command), never handed to the caller as if
    // it were a real edit.
    it('ignores a change event whose nativeEvent.text is missing', async () => {
      let calls = 0;
      mount(ROOT_TAG, () => (
        <TextInput
          value="a"
          onValueChange={() => {
            calls++;
          }}
        />
      ));
      await tick();

      fabric.fireEvent(createdInput().instanceHandle, 'topChange', {
        eventCount: 1,
      });
      await tick();

      expect(calls).toBe(0);
      expect(fabric.commands).toHaveLength(0);
    });
  });
});
