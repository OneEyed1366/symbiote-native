// Co-located unit test for the shared TextInput prop/event folds. Until now these were proven only
// indirectly, and FOUR TIMES OVER: every adapter's own TextInput test re-asserted the same
// resolutions through its own lifecycle. That is expensive and, more importantly, it cannot catch a
// fold that is uniformly wrong — if `resolveTextInputProps` diverges from RN, all four adapters
// agree with each other and every suite stays green. This file checks the folds against RN's
// TextInput.js directly, which is the only place the divergence below could have surfaced.
//
// Expectations here are taken from RN's source, not read back off our implementation:
// TextInput.js:560-579 (submitBehavior), :805 (enterKeyHint map), :815 (inputMode map),
// :828 / :862 (the two autoComplete maps), :930-936 (the render-time fold).
//
// No Negative group. Every exported symbol in state/text-input.ts is a total function over its
// input — there is no guard clause, no `throw`, nothing to reject; `grep -n throw` on the module
// returns nothing. The failure modes are WRONG VALUES, not exceptions, so they are asserted as
// values. Where a fold declines to produce a native prop, that is a Positive outcome named
// "omits …", not an invented "should throw".

import { describe, expect, it } from 'vitest';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  eventCountFromChange,
  foldAutoComplete,
  foldSubmitBehavior,
  foldText,
  keyboardTypeForInputMode,
  mapAutoComplete,
  resolveTextInputProps,
  shouldCommandText,
  textFromChange,
  type ITextInputFoldInput,
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

// The minimum a fold input needs; `multiline` is the only required field.
function foldInput(
  overrides: Partial<ITextInputFoldInput> = {},
): ITextInputFoldInput {
  return { multiline: false, ...overrides };
}

describe('mapAutoComplete (Positive — the safe map lookup every fold shares)', () => {
  it('returns the native token for a key the map defines', () => {
    expect(mapAutoComplete({ tel: 'phone-pad' }, 'tel')).toBe('phone-pad');
  });

  it('omits a token the map does not define', () => {
    expect(mapAutoComplete({ tel: 'phone-pad' }, 'nope')).toBeUndefined();
  });

  // why: this is the entire reason the lookup uses hasOwnProperty rather than `map[token]`. A plain
  // index would resolve inherited Object.prototype members, so `autoComplete="constructor"` would
  // hand a FUNCTION to the native prop bag. On Android that reaches folly::dynamic, which cannot
  // serialize a function and takes the surface down — the same class of crash the engine strips
  // React's __self/__source for. An app can pass any string here, so this is reachable input.
  it.each([
    'constructor',
    'toString',
    'valueOf',
    '__proto__',
    'hasOwnProperty',
  ])(
    'omits the inherited Object.prototype key %s instead of resolving it',
    key => {
      expect(mapAutoComplete({ tel: 'phone-pad' }, key)).toBeUndefined();
    },
  );
});

describe('foldAutoComplete (Positive — one W3C token, both platforms resolved)', () => {
  // why: RN resolves autoComplete per platform from two DIFFERENT maps (TextInput.js:828 Android,
  // :862 iOS). We are Metro-built per platform but fold agnostically and emit both, because each
  // native prop is inert on the other platform. So one token must produce BOTH native values when
  // both maps define it.
  it('resolves both native props when both maps define the token', () => {
    expect(foldAutoComplete('additional-name')).toEqual({
      autoComplete: 'name-middle',
      textContentType: 'middleName',
    });
  });

  // why: the two maps are not the same key set. `sex` is Android-only in RN, so iOS must get
  // nothing rather than a fabricated textContentType — an unknown textContentType is rejected by
  // UIKit, not ignored.
  it('omits textContentType for a token only the Android map defines', () => {
    expect(foldAutoComplete('sex')).toEqual({
      autoComplete: 'gender',
      textContentType: undefined,
    });
  });

  // why: the Android side falls back to the RAW token when the map has no entry (RN's `??`
  // fallback), because Android's autoComplete accepts many tokens verbatim. iOS does not get the
  // same courtesy — an unmapped token yields undefined.
  it('passes an unmapped token through to Android and omits it for iOS', () => {
    expect(foldAutoComplete('totally-unknown')).toEqual({
      autoComplete: 'totally-unknown',
      textContentType: undefined,
    });
  });

  it('omits both when no token was given', () => {
    expect(foldAutoComplete(undefined)).toEqual({
      autoComplete: undefined,
      textContentType: undefined,
    });
  });
});

describe('foldSubmitBehavior (Positive — RN TextInput.js:560-579, branch for branch)', () => {
  // why: RN coerces an explicit 'newline' on a SINGLE-line input, because a single-line field has
  // no newline to insert — leaving it would make the return key do nothing at all.
  it('coerces an explicit newline to blurAndSubmit on a single-line input', () => {
    expect(foldSubmitBehavior('newline', undefined, false)).toBe(
      'blurAndSubmit',
    );
  });

  it('keeps an explicit newline on a multiline input', () => {
    expect(foldSubmitBehavior('newline', undefined, true)).toBe('newline');
  });

  // why: an explicit submitBehavior is the app's decision and outranks the legacy blurOnSubmit,
  // even when the two disagree.
  it('lets an explicit behavior win over a conflicting blurOnSubmit', () => {
    expect(foldSubmitBehavior('submit', true, false)).toBe('submit');
  });

  it('derives blurAndSubmit on multiline only when blurOnSubmit is explicitly true', () => {
    expect(foldSubmitBehavior(undefined, true, true)).toBe('blurAndSubmit');
  });

  it.each([[undefined], [false]])(
    'derives newline on multiline when blurOnSubmit is %s',
    blurOnSubmit => {
      expect(foldSubmitBehavior(undefined, blurOnSubmit, true)).toBe('newline');
    },
  );

  // why: the single-line default is blurAndSubmit — the return key dismisses the keyboard. Only an
  // explicit `false` opts out, so `undefined` must NOT be treated as false.
  it.each([[undefined], [true]])(
    'defaults a single-line input to blurAndSubmit when blurOnSubmit is %s',
    blurOnSubmit => {
      expect(foldSubmitBehavior(undefined, blurOnSubmit, false)).toBe(
        'blurAndSubmit',
      );
    },
  );

  it('derives submit on a single-line input only when blurOnSubmit is explicitly false', () => {
    expect(foldSubmitBehavior(undefined, false, false)).toBe('submit');
  });
});

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

describe('resolveTextInputProps (Positive — the precedence rules, RN TextInput.js:930-946)', () => {
  // why: the W3C alias is the modern spelling and outranks the RN-legacy prop. If the legacy one
  // won, an app migrating to inputMode would silently keep the old keyboard.
  it('lets inputMode outrank keyboardType', () => {
    const props = resolveTextInputProps(
      foldInput({ inputMode: 'email', keyboardType: 'default' }),
    );
    expect(props.keyboardType).toBe('email-address');
  });

  it('falls back to keyboardType when no inputMode is given', () => {
    expect(
      resolveTextInputProps(foldInput({ keyboardType: 'number-pad' }))
        .keyboardType,
    ).toBe('number-pad');
  });

  it('lets enterKeyHint outrank returnKeyType', () => {
    const props = resolveTextInputProps(
      foldInput({ enterKeyHint: 'send', returnKeyType: 'done' }),
    );
    expect(props.returnKeyType).toBe('send');
  });

  // why: RN maps enterKeyHint 'enter' to 'default', NOT to 'enter' — the native return key type
  // named 'enter' does not exist. A pass-through would produce an invalid native value.
  it('maps the enterKeyHint "enter" onto the native default return key', () => {
    expect(
      resolveTextInputProps(foldInput({ enterKeyHint: 'enter' })).returnKeyType,
    ).toBe('default');
  });

  // why: readOnly is the W3C spelling of the INVERSE of editable. Getting the inversion wrong makes
  // a read-only field editable, which is a data-integrity bug rather than a cosmetic one.
  it.each([
    [true, false],
    [false, true],
  ])('inverts readOnly=%s into editable=%s', (readOnly, editable) => {
    expect(
      resolveTextInputProps(foldInput({ readOnly, editable: !editable }))
        .editable,
    ).toBe(editable);
  });

  it('falls back to editable when readOnly is not given', () => {
    expect(resolveTextInputProps(foldInput({ editable: false })).editable).toBe(
      false,
    );
  });

  // why: RN defaults the cursor and the selection-handle colors from selectionColor so a single
  // prop tints the whole selection UI; an explicit value still wins.
  it('defaults the cursor and handle colors from selectionColor', () => {
    const props = resolveTextInputProps(foldInput({ selectionColor: 'red' }));
    expect(props.cursorColor).toBe('red');
    expect(props.selectionHandleColor).toBe('red');
  });

  it('lets explicit cursor and handle colors win over selectionColor', () => {
    const props = resolveTextInputProps(
      foldInput({
        selectionColor: 'red',
        cursorColor: 'blue',
        selectionHandleColor: 'green',
      }),
    );
    expect(props.cursorColor).toBe('blue');
    expect(props.selectionHandleColor).toBe('green');
  });

  // why: without this default Android's Material EditText paints its own underline bar under every
  // input, which no other platform has and no app asked for.
  it('hides the Android underline by default', () => {
    expect(resolveTextInputProps(foldInput()).underlineColorAndroid).toBe(
      'transparent',
    );
  });

  it('lets an explicit underlineColorAndroid win', () => {
    expect(
      resolveTextInputProps(foldInput({ underlineColorAndroid: 'red' }))
        .underlineColorAndroid,
    ).toBe('red');
  });

  // why: an explicitly chosen iOS textContentType is more specific than one derived from the
  // generic autoComplete token, so it must not be overwritten by the fold.
  it('lets an explicit textContentType win over the autoComplete-derived one', () => {
    const props = resolveTextInputProps(
      foldInput({
        autoComplete: 'additional-name',
        textContentType: 'nickname',
      }),
    );
    expect(props.textContentType).toBe('nickname');
    expect(props.autoComplete).toBe('name-middle');
  });

  // why: inputMode="none" is how the W3C spells "this field is focusable but must not raise the
  // soft keyboard" (a date picker behind a text field). RN implements it by deriving
  // showSoftInputOnFocus from inputMode whenever inputMode is present.
  it('suppresses the soft keyboard for inputMode="none"', () => {
    expect(
      resolveTextInputProps(foldInput({ inputMode: 'none' }))
        .showSoftInputOnFocus,
    ).toBe(false);
  });

  it('keeps the soft keyboard for any other inputMode', () => {
    expect(
      resolveTextInputProps(foldInput({ inputMode: 'tel' }))
        .showSoftInputOnFocus,
    ).toBe(true);
  });

  it('falls back to the explicit showSoftInputOnFocus when no inputMode is given', () => {
    expect(
      resolveTextInputProps(foldInput({ showSoftInputOnFocus: false }))
        .showSoftInputOnFocus,
    ).toBe(false);
  });
});

describe('keyboardTypeForInputMode (Positive — RN TextInput.js:815-825)', () => {
  // why: RN resolves this ONE token per platform — iOS gets 'web-search', the keyboard whose
  // return key is a magnifier, and every other host gets the plain default. Collapsing it to a
  // single value silently costs every iOS `inputMode="search"` field its search keyboard, and no
  // adapter test can see it because they all read the same map.
  it('gives ios the search keyboard', () => {
    expect(keyboardTypeForInputMode('search', 'ios')).toBe('web-search');
  });

  it('gives every other host the default keyboard for the same token', () => {
    expect(keyboardTypeForInputMode('search', 'android')).toBe('default');
  });

  // why: `search` is the only token RN branches on. If a second entry ever became
  // platform-dependent by accident, this is what would catch it.
  it.each([
    ['email', 'email-address'],
    ['tel', 'phone-pad'],
    ['decimal', 'decimal-pad'],
    ['numeric', 'number-pad'],
    ['none', 'default'],
    ['text', 'default'],
    ['url', 'url'],
  ])('resolves %s identically on both platforms', (inputMode, expected) => {
    expect(keyboardTypeForInputMode(inputMode, 'ios')).toBe(expected);
    expect(keyboardTypeForInputMode(inputMode, 'android')).toBe(expected);
  });

  it('omits a token the map does not define', () => {
    expect(keyboardTypeForInputMode('nonsense', 'ios')).toBeUndefined();
  });
});

describe('resolveTextInputProps + inputMode="search" (Positive — the fold reads the host)', () => {
  // why: the fold has to carry the platform branch through, not flatten it. Headless resolution
  // lands on the iOS Platform module (platform/index.ts re-exports index.ios), so this asserts the
  // iOS value; the android half is covered by keyboardTypeForInputMode directly.
  it('carries the search keyboard through the fold', () => {
    expect(
      resolveTextInputProps(foldInput({ inputMode: 'search' })).keyboardType,
    ).toBe('web-search');
  });
});
