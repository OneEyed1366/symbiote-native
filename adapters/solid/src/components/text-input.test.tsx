// `text-input` / `text-input-multiline` as TAGS, through Solid's own renderer — the suite that was
// `components/text-input.test.tsx` while a component ran the lifecycle. Drives REAL compiled Solid
// JSX through the universal renderer into the fake Fabric slot: the value/defaultValue -> private
// `text` fold, the W3C alias folds, the native change -> onValueChange derivation, the controlled
// setTextAndSelection handshake, the focus/blur pair, and the imperative handle.
//
// THE SUBJECT IS THE BARE TAG — there is no TextInput component any more. The whole machine lives
// on the engine node (`core/components/src/behaviors/text-input.ts`); this file proves the SOLID
// WIRING. The multiline pair is TWO LITERAL TAGS here (`bare-tag-intrinsic-choice.test.tsx` — a
// `multiline` prop that CONTRADICTS the tag throws rather than resolving one for you), unlike
// React's single tag + prop resolution; each adapter's own precedent stands.
//
// Several cases have no counterpart in the React file and exist because Solid's lifecycle is the
// one thing NOT shared with it: these are bare tags with no body to freeze, but "a prop updates
// after mount", "the host node keeps its identity across a keystroke", and "autoFocus waits for
// the commit that assigns the Fabric tag" are real, silently-breakable claims about the SOLID
// renderer rather than tautologies.
//
// Negative group: a native change payload carrying no text.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { Keyboard, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  buildTextInputHandle,
  type ITextInputHandle,
} from '@symbiote-native/components';
import type { IHostInstance } from '../host-instance';
// SIDE-EFFECT IMPORT: the controlled handshake lives in the tag's behavior, and only this module
// installs it.
import '../register';
import { mount, unmount } from '../render';

const ROOT_TAG = 913;
const SINGLELINE_VIEW = 'RCTSinglelineTextInputView';
const MULTILINE_VIEW = 'RCTMultilineTextInputView';
// RN's "leave the caret alone" sentinel, echoed by a controlled write with no explicit selection.
const NO_SELECTION = -1;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The live tree re-derives on every read, so anything asserted after an update is safe off it.
function committedInput(viewName: string = SINGLELINE_VIEW): ILiveNode {
  const found = live.findLive(live.appRoot(), n => n.viewName === viewName);
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

// The creation-time record, whose instanceHandle is what the slot dispatches events at.
function createdInput(viewName: string = SINGLELINE_VIEW): {
  instanceHandle: unknown;
} {
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
    // why: the `value -> text` FOLD left this file on 2026-09-18, the same way `inputMode` did (see
    // the note further down) — there is no `value` Fabric prop, RN rides the controlled value as the
    // private `text`, and that rule is `foldTextInputValue` in `SymbioteFabricProps.cpp` now. This
    // harness builds payloads through the TypeScript `fabricProps`, which holds no copy of it, so
    // `text` is asserted in `core/engine/cpp/tests/js/text-input-payload.itest.ts`.
    //
    // What is this adapter's is the pair below: the authored value reaches the engine, and the
    // MACHINE — the controlled-value handshake, which stays in JS by design — starts its event
    // counter at zero. That counter is the half no engine rule can supply.
    it('hands the authored value to the engine with the count at zero', async () => {
      mount(ROOT_TAG, () => <text-input value="hello" />);
      await tick();

      const payload = committedInput().payload;
      expect(payload.value).toBe('hello');
      expect(payload.mostRecentEventCount).toBe(0);
    });

    // why: `multiline` picks a DIFFERENT native view class, not a prop on the same one — getting it
    // wrong gives a single-line field that silently refuses newlines. The view NAME is the whole
    // claim, and it is also what the engine keys its own fold on.
    it('renders the multiline intrinsic when multiline is set', async () => {
      mount(ROOT_TAG, () => <text-input-multiline value="two lines" />);
      await tick();
      expect(committedInput(MULTILINE_VIEW).payload.value).toBe('two lines');
    });

    // why: defaultValue is the uncontrolled seed, and this adapter must FORWARD it rather than
    // resolve it — which of the two wins is RN's rule and the engine's, asserted where that runs.
    it('forwards an uncontrolled defaultValue', async () => {
      mount(ROOT_TAG, () => <text-input defaultValue="seed" />);
      await tick();
      expect(committedInput().payload.defaultValue).toBe('seed');
    });

    // why: RN's own aliases are folded in JS and are INERT at the native layer — forwarding
    // THE ALIAS CASE MOVED: `core/engine/cpp/tests/js/text-input-payload.itest.ts`.
    //
    // It asserted the resolution of `inputMode` / `enterKeyHint` / `readOnly` / `autoComplete`, and
    // that rule is the engine's now (`foldTextInputAliases`, `SymbioteFabricProps.cpp`). This
    // harness's `.payload` is built by the TypeScript `fabricProps`, which no longer carries a copy
    // of it — deliberately, so there is one implementation rather than two that must agree.
    //
    // Nothing about it was Solid-specific: every adapter had its own transcription of the same
    // assertions, and all of them collapse into the one file above.

    // why: placeholder/secureTextEntry/maxLength/autoCapitalize and friends are real Fabric props
    // this adapter never names — they ride through `passthrough` untouched. A split list that
    // swallowed them would drop half the public surface with no error anywhere.
    it('forwards the un-handled native props onto the host node', async () => {
      mount(ROOT_TAG, () => (
        <text-input
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

      const payload = committedInput().payload;
      expect(payload.placeholder).toBe('email');
      expect(payload.placeholderTextColor).toBe('#999');
      expect(payload.secureTextEntry).toBe(true);
      expect(payload.maxLength).toBe(12);
      expect(payload.autoCapitalize).toBe('none');
      expect(payload.autoCorrect).toBe(false);
      expect(payload.selectTextOnFocus).toBe(true);
      expect(payload.inputAccessoryViewID).toBe('bar');
      expect(payload.testID).toBe('field');
    });

    // why: native reads only `accessibility*`, and the engine folds the web aliases into them off
    // the authored, HYPHENATED names. TextInput owns its host element rather than rendering through
    // a View, so nothing else carries the aliases down for it — losing one leaves the field
    // unlabelled for a screen reader. The fold's own cases: `aria-payload.itest.ts`.
    it('forwards the aria aliases under their authored names', async () => {
      mount(ROOT_TAG, () => <text-input aria-label="email" aria-disabled />);
      await tick();

      const payload = committedInput().payload;
      expect(payload['aria-label']).toBe('email');
      expect(payload['aria-disabled']).toBe(true);
    });

    // why: RN's change payload carries the text and the native event counter; the callback hands
    // the caller the plain string (the common case) plus the raw event for anyone reading
    // nativeEvent.eventCount. The counter must ride back down or native rejects every later write.
    it('derives onValueChange from the change payload and echoes the acknowledged count', async () => {
      let seen: string | undefined;
      let rawCount: unknown;
      const [value, setValue] = createSignal('a');
      mount(ROOT_TAG, () => (
        <text-input
          value={value()}
          onValueChange={event => {
            seen = event.text;
            rawCount = event.nativeEvent.eventCount;
            setValue(event.text);
          }}
        />
      ));
      await tick();

      type('ab', 1);
      await tick();

      expect(seen).toBe('ab');
      expect(rawCount).toBe(1);
      // `value`, not `text`: the settled controlled value is what the MACHINE produces, and turning
      // it into the private `text` prop is the engine's rule (see the first case in this file).
      expect(committedInput().payload.value).toBe('ab');
      expect(committedInput().payload.mostRecentEventCount).toBe(1);
    });

    // why: a bare tag's props are reactive per-key writes, not a bag rebuilt from a component body
    // — a later change must still reach the SAME native view, never a fresh one that would drop
    // the cursor and the keyboard mid-typing.
    it('re-commits the same native node when a prop changes after mount', async () => {
      const [placeholder, setPlaceholder] = createSignal('before');
      mount(ROOT_TAG, () => <text-input placeholder={placeholder()} />);
      await tick();
      const hostAtMount = committedInput().handle;
      expect(committedInput().payload.placeholder).toBe('before');

      setPlaceholder('after');
      await tick();

      expect(committedInput().payload.placeholder).toBe('after');
      expect(committedInput().handle, 'the host node kept its identity').toBe(
        hostAtMount,
      );
    });

    // why: the controlled round trip's forcing case. Native has ALREADY changed its own text when
    // the event arrives; a handler that rewrites it (here, uppercasing) leaves native holding the
    // wrong text, so only setTextAndSelection carrying the ACKNOWLEDGED count (native's eventLag
    // check drops any other) can correct it. Same shape as
    // `adapters/react/src/components/text-input/text-input.test.tsx`'s forcing case.
    it('commands a transformed value back when onValueChange rewrites the text', async () => {
      const [value, setValue] = createSignal('');
      mount(ROOT_TAG, () => (
        <text-input
          value={value()}
          onValueChange={event => setValue(event.text.toUpperCase())}
        />
      ));
      await tick();

      type('ab', 1);
      await tick();

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('setTextAndSelection');
      expect(fabric.commands[0]?.args).toEqual([
        1,
        'AB',
        NO_SELECTION,
        NO_SELECTION,
      ]);
    });

    // why: the counterpart — an always-fire controlled write would fight the user on every accepted
    // keystroke, re-setting the text native already holds and jumping the cursor.
    it('issues no command when the handler accepts the change', async () => {
      const [value, setValue] = createSignal('a');
      mount(ROOT_TAG, () => (
        <text-input
          value={value()}
          onValueChange={event => setValue(event.text)}
        />
      ));
      await tick();

      type('ab', 1);
      await tick();

      expect(committedInput().payload.value).toBe('ab');
      expect(fabric.commands).toHaveLength(0);
    });

    // why: the mount-time `text` prop already carries the first value down via createNode, so it is
    // not a divergence — commanding there would fight the very first render, and (worse) would do
    // it before the node has a Fabric tag, i.e. silently.
    it('issues no command on initial mount', async () => {
      mount(ROOT_TAG, () => <text-input value="a" />);
      await tick();
      expect(fabric.commands).toHaveLength(0);
    });

    // why: a purely programmatic value change (no native event in between) is still a divergence
    // from what native holds and must be commanded down, not just re-propped.
    it('commands a programmatic value change down with the acknowledged count', async () => {
      const [value, setValue] = createSignal('a');
      mount(ROOT_TAG, () => <text-input value={value()} />);
      await tick();

      setValue('b');
      await tick();

      expect(committedInput().payload.value).toBe('b');
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
      mount(ROOT_TAG, () => <text-input autoFocus />);
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
      mount(ROOT_TAG, () => <text-input value="a" />);
      await tick();
      expect(fabric.commands).toHaveLength(0);
    });

    // why: focus/blur are the only source of truth for isFocused() (native has no synchronous
    // getter), and they must ALSO reach the caller's own handlers — the behavior replaces them on
    // the host node, so a fold that forgot to call through would swallow them silently.
    it('tracks focus state and forwards the focus/blur pair to the caller', async () => {
      const seen: string[] = [];
      let handle: ITextInputHandle | undefined;
      mount(ROOT_TAG, () => (
        <text-input
          ref={(node: IHostInstance) => (handle = buildTextInputHandle(node))}
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
      mount(ROOT_TAG, () => <text-input />);
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
        <text-input
          value="hello"
          selection={{ start: 1, end: 3 }}
          onSelectionChange={(event: ISymbioteEvent) => {
            reported = event.nativeEvent.selection;
          }}
        />
      ));
      await tick();

      expect(committedInput().payload.selection).toEqual({ start: 1, end: 3 });

      fabric.fireEvent(createdInput().instanceHandle, 'topSelectionChange', {
        selection: { start: 2, end: 2 },
      });
      expect(reported).toEqual({ start: 2, end: 2 });
    });

    // why: a controlled write must carry the caller's selection rather than the -1 sentinel, or the
    // caret jumps to wherever native left it on every programmatic edit.
    //
    // TWO commands, not one: `selection` authored alongside `value` at MOUNT already diverges from
    // the engine's own sentinel-seeded `lastNativeSelection` (matching `TextInput.js`'s own
    // `lastNativeSelection` starting at `{start:-1,end:-1}`), so mounting fires its own
    // `[0, 'a', 2, 4]` before `setValue` ever runs.
    it('carries an explicit selection into the controlled write', async () => {
      const [value, setValue] = createSignal('a');
      mount(ROOT_TAG, () => (
        <text-input value={value()} selection={{ start: 2, end: 4 }} />
      ));
      await tick();

      expect(fabric.commands[0]?.args).toEqual([0, 'a', 2, 4]);

      setValue('abcd');
      await tick();

      expect(fabric.commands).toHaveLength(2);
      expect(fabric.commands[1]?.args).toEqual([0, 'abcd', 2, 4]);
    });

    // why: the imperative half of RN's public API. clear/setSelection go down the SAME stale-safe
    // path as a controlled write and must echo the acknowledged count — with a stale count native's
    // eventLag check drops them and the ref appears to do nothing.
    it('drives focus / blur / clear / setSelection through the ref', async () => {
      let handle: ITextInputHandle | undefined;
      mount(ROOT_TAG, () => (
        <text-input
          ref={(node: IHostInstance) => (handle = buildTextInputHandle(node))}
          defaultValue="hello"
        />
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

    // why: a FUNCTION must never reach the native prop bag. `onValueChange` is plain JS, not a
    // ViewConfig event, and a function on the bag crashes Android's `folly::dynamic` serializer the
    // moment it tries to stringify it. Dropped at the commit boundary by the payload builder, which
    // is a contract both builders hold rather than this adapter alone.
    it('never forwards a function onto the native prop bag', async () => {
      mount(ROOT_TAG, () => (
        <text-input value="a" defaultValue="seed" onValueChange={() => {}} />
      ));
      await tick();

      expect('onValueChange' in committedInput().payload).toBe(false);
      // `inputMode` used to be asserted here, then `defaultValue` joined it (2026-09-18). Both are
      // stripped by the ENGINE now — `foldTextInputAliases` and `foldTextInputValue` in
      // `SymbioteFabricProps.cpp` — which this harness's payload cannot see, so both assertions
      // moved with their rules to `core/engine/cpp/tests/js/text-input-payload.itest.ts`. The
      // function is the one that is still this layer's, because dropping it is not a platform rule
      // about text inputs but a property of building a payload at all.
    });

    // A runtime multiline flip is NOT covered: single- and multiline are different native views,
    // a bare tag's view is fixed at creation (`resolve-intrinsic.ts`'s own header — no prop write
    // moves a node between view types), and neither this file's reference (React's) nor any other
    // adapter tests swapping the two tags on one mount. `bare-tag-intrinsic-choice.test.tsx` covers
    // every FRESH-mount case; a runtime swap would need its own investigation, not a guess here.
  });

  describe('Negative', () => {
    // why: textFromChange narrows nativeEvent.text to a string — a malformed payload must be
    // silently ignored (no callback, no bookkeeping, no command), never handed to the caller as if
    // it were a real edit.
    it('ignores a change event whose nativeEvent.text is missing', async () => {
      let calls = 0;
      mount(ROOT_TAG, () => (
        <text-input
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
