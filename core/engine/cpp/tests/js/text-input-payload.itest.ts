// TextInput's prop semantics, in the engine — the first behavior fold to move to C++.
//
// WHY THIS ONE FIRST. It is the only fold with a measured price: `walk` reads 41-44 ms on every
// adapter that mounts a `<text-input>` against React's 24-27 ms on a byte-identical tree, and the
// difference is `foldsFound=1000`. A fold costs the TRIP, not the function — `fabricProps` converts
// the whole props bag to a `jsi::Value`, calls into JS, and converts the result back, ~17 us per
// folding node per commit.
//
// WHY IT CAN MOVE AT ALL — the browser criterion, not "is it expressible as data". What
// `resolveTextInputProps` does is what Blink does for `<input>`: map the web-facing spelling onto the
// platform's own. `inputMode` -> `keyboardType`, `enterKeyHint` -> `returnKeyType`,
// `readOnly` -> `editable`, the W3C `autoComplete` token -> Android's `autoComplete` and iOS's
// `textContentType`. That is UA behavior. It is a property of React Native, not of any app, any
// framework, or any component instance — so it belongs beside the tree, and every adapter should get
// it for the price of emitting the tag.
//
// WHAT STAYS IN JS: the machine. The controlled-value handshake, the event-count acknowledgement,
// autofocus — those run at gesture and lifecycle rate and call back into app code, which is exactly
// where a browser keeps them too.
//
// NO TWIN. The rule lives in `SymbioteFabricProps.cpp` and nowhere else; `fabric-props.ts` does NOT
// get a copy. This file is what makes that safe — it reads the payload the commit actually sent
// (`committedPayloadOf`, which needs the real builder), so there is one implementation and one test
// of it, rather than two of each.
//
// THE COST ASSERTION IS PART OF THE CONTRACT: `foldsFound` must be 0. A port that left the fold
// declared would produce an identical payload and buy nothing, and nothing else here would notice.

import { registerTextInputBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const SINGLELINE = 'RCTSinglelineTextInputView';
const MULTILINE = 'RCTMultilineTextInputView';

registerTextInputBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

function commit(
  component: string,
  tag: string,
  props: Record<string, unknown>,
): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(component, false, tag);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('the input committed no payload');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

const single = (props: Record<string, unknown>): ICommitted =>
  commit(SINGLELINE, 'text-input', props);
const multi = (props: Record<string, unknown>): ICommitted =>
  commit(MULTILINE, 'text-input-multiline', props);

describe('what a text input sends native, resolved by the engine', () => {
  // why: THE PRICE. Everything below would pass equally well with the rule still in a JS closure;
  // this is the assertion that says it moved.
  it('costs no trip into JS at all', () => {
    const plain = single({ text: 'input 0' });
    print(`DEBUG text-input folds=${plain.folds}`);
    expect(plain.folds).toBe(0);

    // And still zero when every alias the rule reads is present, which is the case a gate could not
    // have covered — the work is real here, it simply happens on this side of the wire.
    const aliased = single({ inputMode: 'numeric', autoComplete: 'email' });
    expect(aliased.folds).toBe(0);
  });

  // why: `inputMode` is the W3C spelling and native knows only `keyboardType`. RN's map,
  // TextInput.js:815.
  it('maps inputMode onto keyboardType', () => {
    expect(single({ inputMode: 'numeric' }).payload.keyboardType).toBe(
      'number-pad',
    );
    expect(single({ inputMode: 'decimal' }).payload.keyboardType).toBe(
      'decimal-pad',
    );
    expect(single({ inputMode: 'email' }).payload.keyboardType).toBe(
      'email-address',
    );
    expect(single({ inputMode: 'tel' }).payload.keyboardType).toBe('phone-pad');
    expect(single({ inputMode: 'url' }).payload.keyboardType).toBe('url');
    expect(single({ inputMode: 'none' }).payload.keyboardType).toBe('default');
    expect(single({ inputMode: 'text' }).payload.keyboardType).toBe('default');
  });

  // why: `search` is the ONE token RN resolves per platform (TextInput.js:815-825) — iOS has a
  // dedicated search keyboard whose return key is a magnifier. The host build resolves as iOS, the
  // same answer the headless `Platform` module gives.
  it('resolves the one platform-split inputMode token', () => {
    expect(single({ inputMode: 'search' }).payload.keyboardType).toBe(
      'web-search',
    );
  });

  // why: an authored native name must survive untouched — the alias is a fallback for apps that
  // write the web spelling, never an override of the platform one.
  it('leaves an authored keyboardType alone', () => {
    expect(single({ keyboardType: 'number-pad' }).payload.keyboardType).toBe(
      'number-pad',
    );
  });

  // why: RN's enterKeyHint map, TextInput.js:805. Note `enter` -> 'default', which is the one entry
  // nobody guesses right.
  it('maps enterKeyHint onto returnKeyType', () => {
    expect(single({ enterKeyHint: 'enter' }).payload.returnKeyType).toBe(
      'default',
    );
    expect(single({ enterKeyHint: 'search' }).payload.returnKeyType).toBe(
      'search',
    );
    expect(single({ enterKeyHint: 'previous' }).payload.returnKeyType).toBe(
      'previous',
    );
  });

  // why: the web spelling is the NEGATION of the native one, so getting this backwards silently
  // makes every read-only field editable.
  it('negates readOnly into editable', () => {
    expect(single({ readOnly: true }).payload.editable).toBe(false);
    expect(single({ readOnly: false }).payload.editable).toBe(true);
    expect(single({ editable: false }).payload.editable).toBe(false);
  });

  // why: RN's reconciliation, TextInput.js:559 — and it produces a value for an EMPTY bag, which is
  // what makes it a rule rather than a mapping. A singleline input with nothing authored still
  // submits on return.
  it('reconciles submitBehavior against the tag and the legacy prop', () => {
    expect(single({}).payload.submitBehavior).toBe('blurAndSubmit');
    expect(multi({}).payload.submitBehavior).toBe('newline');
    expect(single({ blurOnSubmit: false }).payload.submitBehavior).toBe(
      'submit',
    );
    expect(multi({ blurOnSubmit: true }).payload.submitBehavior).toBe(
      'blurAndSubmit',
    );
    // An explicit `newline` on a SINGLELINE input is coerced: there is no newline to insert.
    expect(single({ submitBehavior: 'newline' }).payload.submitBehavior).toBe(
      'blurAndSubmit',
    );
    expect(multi({ submitBehavior: 'newline' }).payload.submitBehavior).toBe(
      'newline',
    );
  });

  // why: RN resolves BOTH native props from the one W3C token (TextInput.js:938) — Android reads
  // `autoComplete`, iOS reads `textContentType`, and each is inert on the other platform. A token
  // with no Android equivalent falls back to itself; one with no iOS equivalent leaves
  // `textContentType` unset.
  it('resolves the one autoComplete token into both native props', () => {
    const email = single({ autoComplete: 'email' }).payload;
    expect(email.autoComplete).toBe('email');
    expect(email.textContentType).toBe('emailAddress');

    const street = single({ autoComplete: 'street-address' }).payload;
    expect(street.autoComplete).toBe('street-address');
    expect(street.textContentType).toBe('fullStreetAddress');

    const nickname = single({ autoComplete: 'nickname' }).payload;
    // No Android entry, so the raw token rides through; iOS has one.
    expect(nickname.autoComplete).toBe('nickname');
    expect(nickname.textContentType).toBe('nickname');

    const unknown = single({ autoComplete: 'not-a-token' }).payload;
    expect(unknown.autoComplete).toBe('not-a-token');
    expect(unknown.textContentType).toBe(undefined);
  });

  // why: an authored `textContentType` wins over the one derived from `autoComplete`.
  it('lets an authored textContentType beat the derived one', () => {
    const payload = single({
      autoComplete: 'email',
      textContentType: 'username',
    }).payload;
    expect(payload.textContentType).toBe('username');
  });

  // why: RN's three selection colours coalesce onto one authored value, so an app that writes
  // `selectionColor` alone gets a matching caret and handle.
  //
  // The values are ARGB INTEGERS here, not the authored strings: this read shows the payload, and
  // the builder runs RN's own `processColor` over every colour key on the way out. Asserting the
  // string would be asserting a stage that never reaches native — and it is the reason `.props`
  // (what the adapter said) and this (what we sent) have to stay two different reads.
  const RED = 0xff_ff_00_00;
  const BLUE = 0xff_00_00_ff;
  it('coalesces the selection colours', () => {
    const one = single({ selectionColor: 'red' }).payload;
    expect(one.cursorColor).toBe(RED);
    expect(one.selectionHandleColor).toBe(RED);

    const explicit = single({
      selectionColor: 'red',
      cursorColor: 'blue',
    }).payload;
    expect(explicit.cursorColor).toBe(BLUE);
    expect(explicit.selectionHandleColor).toBe(RED);
  });

  // why: `inputMode: 'none'` is how the web spells "focusable but no keyboard".
  it('derives showSoftInputOnFocus from inputMode', () => {
    expect(single({ inputMode: 'none' }).payload.showSoftInputOnFocus).toBe(
      false,
    );
    expect(single({ inputMode: 'text' }).payload.showSoftInputOnFocus).toBe(
      true,
    );
    expect(
      single({ showSoftInputOnFocus: false }).payload.showSoftInputOnFocus,
    ).toBe(false);
  });

  // why: the aliases are INERT at native, and leaving them in the payload is how a reader concludes
  // the rule ran when it did not. `underlineColorAndroid` is absent on this platform for the reason
  // F-76 records: iOS's ViewConfig does not declare it, so sending it costs a wire slot for nothing.
  it('sends no alias and no android-only key', () => {
    const payload = single({
      inputMode: 'numeric',
      enterKeyHint: 'search',
      readOnly: true,
      blurOnSubmit: false,
    }).payload;
    print(`payload keys: ${Object.keys(payload).sort().join(' ')}`);

    expect(payload.inputMode).toBe(undefined);
    expect(payload.enterKeyHint).toBe(undefined);
    expect(payload.readOnly).toBe(undefined);
    expect(payload.blurOnSubmit).toBe(undefined);
    expect(payload.underlineColorAndroid).toBe(undefined);
  });

  // why: the Android default must not be hardcoded PAST an explicit choice — a designer who wants
  // the underline back must be able to ask for it, on either platform. Travelled here from
  // `adapters/react/src/components/text-input/text-input.test.tsx`, which could no longer see it.
  it('lets an explicit underlineColorAndroid through', () => {
    const payload = single({ underlineColorAndroid: '#00ff00' }).payload;
    expect(payload.underlineColorAndroid).toBe(0xff_00_ff_00);
  });

  // why: the controlled value, which is a SEPARATE rule that already lived in the builder — asserted
  // here so the port cannot quietly break it while moving the fold that used to run beside it.
  it('still folds the controlled value into the private text prop', () => {
    const payload = single({ value: 'hello' }).payload;
    expect(payload.text).toBe('hello');
    expect(payload.value).toBe(undefined);
  });

  // why: RN HAS NO `value` FABRIC PROP — the controlled value rides as the private `text`. The four
  // cases below pinned only the TypeScript twin of this rule until 2026-09-18, in a vitest that
  // builds payloads through `fabric-props.ts` and therefore cannot see the C++ copy at all. The
  // device rule could have broken with every one of them green. Same shape as the disabled
  // `touchable-highlight` that committed `focusable: true` for as long as it did.
  it('folds an uncontrolled defaultValue the same way', () => {
    const payload = single({ defaultValue: 'initial' }).payload;
    expect(payload.text).toBe('initial');
    expect(payload.defaultValue).toBe(undefined);
  });

  // why: `value` is the controlled one, so it WINS — and `defaultValue` must still leave the bag,
  // because neither name is a Fabric prop and an undeclared key is dropped in silence on device.
  it('lets the controlled value win over the initial one, and drops both names', () => {
    const payload = single({ value: 'now', defaultValue: 'then' }).payload;
    expect(payload.text).toBe('now');
    expect(payload.value).toBe(undefined);
    expect(payload.defaultValue).toBe(undefined);
  });

  // why: an explicit `text` is the COMPONENT path, where the wrapper already folded. Re-folding
  // there would let a stale `value` overwrite what the machine computed — the controlled-value
  // handshake is one of the things that deliberately stayed in JS.
  it('leaves an explicit text alone while still consuming value', () => {
    const payload = single({ text: 'computed', value: 'stale' }).payload;
    expect(payload.text).toBe('computed');
    expect(payload.value).toBe(undefined);
  });

  // why: THE CONTROL, and the reason the fold is keyed on the COMPONENT rather than on the prop
  // name — `value` is an ordinary prop of Switch and Slider, and a name-keyed fold would write a
  // bogus `text` onto both. Travelled from `core/engine/src/__tests__/text-input-value-fold.test.ts`,
  // which could only ever assert it against the headless builder's copy of the rule.
  //
  // A Switch rather than a view, which is the stronger subject: a view declares no `value` at all,
  // so it cannot tell a component-keyed rule from one that simply found nothing to do.
  it('does not touch value on a component that is not a text input', () => {
    const payload = commit('Switch', 'switch-probe', { value: true }).payload;
    expect(payload.value).toBe(true);
    expect(payload.text).toBe(undefined);
  });

  // why: multiline is a different Fabric component with its own name, and the gate names both. A
  // rule that checked only the singleline one would leave every `<TextInput multiline>` empty.
  it('folds the value on the multiline component too', () => {
    const payload = multi({ value: 'many lines' }).payload;
    expect(payload.text).toBe('many lines');
    expect(payload.value).toBe(undefined);
  });
});

report();
