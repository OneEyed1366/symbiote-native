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

  // why: TextInput.js:938-954 — iOS (this build) derives `textContentType` from the W3C token and
  // sends NO `autoComplete` (`Platform.OS === 'android' ? … : undefined`); the Android half is in
  // `android-rules.android.itest.ts`. A token with no iOS entry leaves `textContentType` unset.
  it('resolves the autoComplete token into textContentType and sends no autoComplete', () => {
    const email = single({ autoComplete: 'email' }).payload;
    expect(email.autoComplete).toBe(undefined);
    expect(email.textContentType).toBe('emailAddress');

    const street = single({ autoComplete: 'street-address' }).payload;
    expect(street.textContentType).toBe('fullStreetAddress');

    const nickname = single({ autoComplete: 'nickname' }).payload;
    expect(nickname.textContentType).toBe('nickname');

    const unknown = single({ autoComplete: 'not-a-token' }).payload;
    expect(unknown.autoComplete).toBe(undefined);
    expect(unknown.textContentType).toBe(undefined);
  });

  // `TextInput-test` "should give precedence to `textContentType` when set"
  it('keeps an authored textContentType over the autoComplete token', () => {
    const payload = single({
      autoComplete: 'tel',
      textContentType: 'emailAddress',
    }).payload;

    expect(payload.textContentType).toBe('emailAddress');
  });

  // why: TextInput.js:919-937 — the W3C spelling WINS over the native one when both are authored.
  it('lets the web alias beat the native prop', () => {
    expect(
      single({ inputMode: 'numeric', keyboardType: 'default' }).payload
        .keyboardType,
    ).toBe('number-pad');
    expect(
      single({ enterKeyHint: 'search', returnKeyType: 'done' }).payload
        .returnKeyType,
    ).toBe('search');
    expect(single({ readOnly: true, editable: true }).payload.editable).toBe(
      false,
    );
    expect(
      single({ inputMode: 'none', showSoftInputOnFocus: true }).payload
        .showSoftInputOnFocus,
    ).toBe(false);
  });

  // why: TextInput.js:708,711 (both platforms) — `rows` wins as numberOfLines; `tabIndex` decides
  // `focusable` as `!tabIndex`, else `focusable !== false`, always sent.
  it('maps rows and tabIndex, and always sends focusable', () => {
    const rows = multi({ rows: 3, numberOfLines: 1 }).payload;
    expect(rows.numberOfLines).toBe(3);
    expect(rows.rows).toBe(undefined);
    expect(single({}).payload.focusable).toBe(true);
    expect(single({ focusable: false }).payload.focusable).toBe(false);
    expect(single({ tabIndex: -1 }).payload.focusable).toBe(false);
    expect(single({ tabIndex: 0 }).payload.focusable).toBe(true);
    expect(single({ tabIndex: 0 }).payload.tabIndex).toBe(undefined);
  });

  // why: TextInput.js:904 — `allowFontScaling = true` by default.
  it('defaults allowFontScaling on', () => {
    expect(single({}).payload.allowFontScaling).toBe(true);
    expect(single({ allowFontScaling: false }).payload.allowFontScaling).toBe(
      false,
    );
  });

  // why: an authored `textContentType` wins over the one derived from `autoComplete`.
  it('lets an authored textContentType beat the derived one', () => {
    const payload = single({
      autoComplete: 'email',
      textContentType: 'username',
    }).payload;
    expect(payload.textContentType).toBe('username');
  });

  // iOS RN takes `cursorColor` and `selectionHandleColor` out of the props (TextInput.js:368)
  // The payload holds ARGB integers, `processColor` runs over every colour key on the way out
  const RED = 0xff_ff_00_00;
  it('sends only selectionColor of the three selection colours', () => {
    const payload = single({
      selectionColor: 'red',
      cursorColor: 'blue',
      selectionHandleColor: 'green',
    }).payload;
    expect(payload.selectionColor).toBe(RED);
    expect(payload.cursorColor).toBe(undefined);
    expect(payload.selectionHandleColor).toBe(undefined);
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

  // The aliases are inert at native, and iOS's ViewConfig does not declare `underlineColorAndroid`
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

  // The Android default must not be hardcoded past an explicit choice
  it('lets an explicit underlineColorAndroid through', () => {
    const payload = single({ underlineColorAndroid: '#00ff00' }).payload;
    expect(payload.underlineColorAndroid).toBe(0xff_00_ff_00);
  });

  // The controlled value is a separate rule that lives in the builder
  it('still folds the controlled value into the private text prop', () => {
    const payload = single({ value: 'hello' }).payload;
    expect(payload.text).toBe('hello');
    expect(payload.value).toBe(undefined);
  });

  // RN has no `value` Fabric prop, the controlled value rides as the private `text`
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

  // The fold is keyed on the component, `value` is an ordinary prop of Switch and Slider
  it('does not touch value on a component that is not a text input', () => {
    const payload = commit('Switch', 'switch-probe', { value: true }).payload;
    expect(payload.value).toBe(true);
    expect(payload.text).toBe(undefined);
  });

  // `TextInput.js:549-558`, the style overrides shared with Text
  it('turns a numeric fontWeight into a string', () => {
    expect(single({ style: { fontWeight: 700 } }).payload.fontWeight).toBe(
      '700',
    );
  });

  it('turns verticalAlign into textAlignVertical', () => {
    const payload = single({ style: { verticalAlign: 'middle' } }).payload;
    expect(payload.textAlignVertical).toBe('center');
    expect(payload.verticalAlign).toBe(undefined);
  });

  // `TextInput.js:677-684,767-768`, iOS only: a multiline input with no vertical padding of its own
  // gets a 5pt top inset so it sits like a singleline one
  it('gives a multiline input a top inset only when it has no padding of its own', () => {
    expect(multi({}).payload.paddingTop).toBe(5);
    expect(multi({ style: { color: 'red' } }).payload.paddingTop).toBe(5);
    expect(multi({ style: { padding: 8 } }).payload.paddingTop).toBe(undefined);
    expect(multi({ style: { paddingVertical: 8 } }).payload.paddingTop).toBe(
      undefined,
    );
    expect(multi({ style: { paddingTop: 2 } }).payload.paddingTop).toBe(2);
    expect(single({}).payload.paddingTop).toBe(undefined);
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
