// Co-located unit test for TextInput's MACHINE — the controlled-value handshake and the two
// readers that narrow a native change payload. Everything here runs at keystroke rate and calls
// back into app code, which is why it is still JavaScript at all.
//
// WHAT LEFT, and it was most of this file: the W3C->native prop resolution — `resolveTextInputProps`,
// `keyboardTypeForInputMode`, `mapAutoComplete`, `foldAutoComplete`, `foldSubmitBehavior` and their
// four lookup tables. That rule is the engine's now (`foldTextInputAliases`,
// `SymbioteFabricProps.cpp`) and its contract is
// `core/engine/cpp/tests/js/text-input-payload.itest.ts`, which reads the payload the commit
// actually sent instead of the return value of a function.
//
// The cases did not come here and then get deleted — they moved with the rule, in the commit that
// moved it. What was deleted is the JS, once nothing called it: an exported twin kept alive by its
// own test is the mirror the port exists to remove.
//
// Expectations here are taken from RN's source, not read back off our implementation.
//
// No Negative group. Every symbol left in state/text-input.ts is a total function over its input —
// no guard clause, no `throw`, nothing to reject. The failure modes are WRONG VALUES, not
// exceptions, so they are asserted as values.

import { describe, expect, it } from 'vitest';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  eventCountFromChange,
  foldText,
  shouldCommandText,
  textFromChange,
} from './text-input';

// A change event carrying an arbitrary native payload. The node is real (not a mock) because the
// event type demands one; nothing under test reads it.
function changeEvent(nativeEvent: Record<string, unknown>): ISymbioteEvent {
  const node = createElement('RCTSinglelineTextInputView');
  return {
    type: 'topChange',
    target: node,
    currentTarget: node,
    nativeEvent,
    stopPropagation: () => {},
  };
}

describe('foldText (Positive — controlled wins, then uncontrolled seed)', () => {
  it('prefers value over defaultValue', () => {
    expect(foldText('typed', 'seed')).toBe('typed');
  });

  it('falls back to defaultValue when there is no value', () => {
    expect(foldText(undefined, 'seed')).toBe('seed');
  });

  // why: an empty controlled value is a real state — the user cleared the field — and must beat the
  // defaultValue. A falsy check instead of a typeof check would resurrect the seed text the moment
  // the field is emptied, which the user then cannot delete.
  it('treats an empty controlled value as a value, not as absent', () => {
    expect(foldText('', 'seed')).toBe('');
  });

  it('stays undefined when neither is given, leaving the input uncontrolled', () => {
    expect(foldText(undefined, undefined)).toBeUndefined();
  });
});

describe('textFromChange / eventCountFromChange (Positive — narrowing an untyped payload)', () => {
  it('reads the text and the native counter off a well-formed change', () => {
    const event = changeEvent({ text: 'ab', eventCount: 3 });
    expect(textFromChange(event)).toBe('ab');
    expect(eventCountFromChange(event)).toBe(3);
  });

  // why: nativeEvent is Record<string, unknown> — the payload shape is the native side's, and iOS
  // and Android have keyed it differently before. A wrong-typed field must read as absent so the
  // caller skips the change, rather than propagating a number as if it were the user's text.
  it.each([
    ['a missing key', {}],
    ['a non-string text', { text: 42 }],
    ['a null text', { text: null }],
  ])('omits the text for %s', (_label, nativeEvent) => {
    expect(textFromChange(changeEvent(nativeEvent))).toBeUndefined();
  });

  it.each([
    ['a missing key', {}],
    ['a string count', { eventCount: '3' }],
  ])('omits the event count for %s', (_label, nativeEvent) => {
    expect(eventCountFromChange(changeEvent(nativeEvent))).toBeUndefined();
  });
});

describe('shouldCommandText (Positive — the controlled-write decision)', () => {
  // why: this is what makes a REFUSED keystroke snap back. Native has already painted the new text
  // by the time JS sees the change; if the app's value still differs, the only stale-safe correction
  // is an imperative command. A prop re-push cannot do it — the prop never changed.
  it('commands when the app value diverges from what native last reported', () => {
    expect(shouldCommandText('ab', 'a')).toBe(true);
  });

  it('stays quiet when the app value matches what native reported', () => {
    expect(shouldCommandText('ab', 'ab')).toBe(false);
  });

  // why: an uncontrolled input has no `value`, so there is nothing to reconcile — commanding here
  // would fight the user on every keystroke.
  it('stays quiet for an uncontrolled input', () => {
    expect(shouldCommandText('ab', undefined)).toBe(false);
  });

  // why: before the first native report there is nothing to compare against, and a controlled value
  // still has to reach the native view. This is also the seed path an adapter mounts with.
  it('commands when native has not reported yet', () => {
    expect(shouldCommandText(undefined, 'seed')).toBe(true);
  });

  it('commands when a controlled value is cleared to empty', () => {
    expect(shouldCommandText('ab', '')).toBe(true);
  });
});
