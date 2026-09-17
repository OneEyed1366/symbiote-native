// What the payload builder actually SENT, readable at last.
//
// why: every rule in `SymbioteFabricProps.cpp` was verifiable only through its TypeScript twin,
// because nothing in this harness could see a committed node's real props. `committed-props.itest.ts`
// measures the other read and says so in its own header: `Props::getDebugProps()` is a hand-written
// selection per component, so an absent key proves nothing. For `RCTSinglelineTextInputView` the
// selection is EMPTY — a committed text input reports `testID` and not one prop besides — which is
// exactly the component whose fold resolves `inputMode` into `keyboardType`.
//
// RN's own complete read is `Props::rawProps` behind `RN_SERIALIZABLE_STATE`, and that flag pulls
// `fbjni/fbjni.h` into `State`'s virtual interface: it does not compile on a host build, tried
// 2026-09-15 and recorded in this directory's `CMakeLists.txt`.
//
// `committedPayloadOf` needs no flag and adds no bookkeeping. `SymbioteTree` already retains the
// payload per node as the next commit's diff baseline (`Node::committedProps`), so the read is a
// conversion and nothing else, and no commit path changed to add it.
//
// WHAT IT IS NOT: proof that Fabric PARSED anything. A key no ViewConfig declares sits in the answer
// exactly as it was sent — `processor-refusal.itest.ts` is the test for that, and `getDebugProps`
// stays the read that proves the round trip. This answers what we sent, which is the question every
// payload rule is about.

import { registerTextInputBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerTextInputBehavior();

function commit(
  component: string,
  tag: string,
  props: Record<string, unknown>,
): ISymbioteNode {
  const surface = createSurface(ROOT_TAG);
  const node = createElement(component, false, tag);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return node;
}

describe('reading back the payload a commit sent', () => {
  // why: the read this file exists for, on the component that made it necessary. Every key below is
  // produced by a rule that lives in C++ and had no test that could see it.
  it('shows a text input its aliases resolved into native names', () => {
    const input = commit('RCTSinglelineTextInputView', 'text-input', {
      inputMode: 'numeric',
      enterKeyHint: 'search',
      readOnly: true,
      value: 'hello',
    });

    const payload = committedPayloadOf(input);
    if (payload === undefined)
      throw new Error('the input committed no payload');
    print(`payload: ${Object.keys(payload).sort().join(' ')}`);

    // THE MAPPINGS, each one a rule that was previously provable only in TypeScript.
    expect(payload.keyboardType).toBe('number-pad');
    expect(payload.returnKeyType).toBe('search');
    expect(payload.editable).toBe(false);
    // RN HAS NO `value` FABRIC PROP — the controlled value rides as the private `text`, folded by
    // `foldTextInputValue` in the builder. A lowered element that sent `value` rendered EMPTY with
    // nothing red anywhere, which is the bug this read would have caught in one line.
    expect(payload.text).toBe('hello');
    expect(payload.value).toBe(undefined);

    // THE ALIASES MUST NOT RIDE ALONG: they are inert at native, and leaving them in is how a reader
    // concludes the fold ran when it did not.
    expect(payload.inputMode).toBe(undefined);
    expect(payload.enterKeyHint).toBe(undefined);
    expect(payload.readOnly).toBe(undefined);
  });

  // why: the component-keyed rule that has a TWIN in TypeScript, which is the drift this read
  // closes. `applyTextDefaults` is written once in `fabric-props.ts` and once in
  // `SymbioteFabricProps.cpp`, and until now only the first copy had a test.
  it('shows a text node the platform defaults no adapter writes', () => {
    const text = commit('RCTText', 'text', {});

    const payload = committedPayloadOf(text);
    if (payload === undefined) throw new Error('the text committed no payload');

    expect(payload.ellipsizeMode).toBe('tail');
    expect(payload.allowFontScaling).toBe(true);
  });

  // why: the style hoist, which no other read can see at all. The builder writes the style slot's
  // keys straight into the one payload object rather than nesting them, which is the shape RN itself
  // uses — and `getDebugProps` reports a `RCTView`'s style as its own resolved fields, never as what
  // was sent.
  it('shows a style slot hoisted into the payload rather than nested', () => {
    const view = commit('RCTView', 'view', {
      style: [{ width: 10 }, { height: 20 }],
      testID: 'probe',
    });

    const payload = committedPayloadOf(view);
    if (payload === undefined) throw new Error('the view committed no payload');
    print(`view payload: ${Object.keys(payload).sort().join(' ')}`);

    expect(payload.width).toBe(10);
    expect(payload.height).toBe(20);
    expect(payload.style).toBe(undefined);
    expect(payload.testID).toBe('probe');
  });

  // why: `undefined` before a commit is the ORDINARY answer and not an error — an adapter wiring an
  // imperative call at lifecycle time runs before the first commit under every async renderer.
  it('answers undefined for a node that has never committed', () => {
    createSurface(ROOT_TAG);
    const orphan = createElement('RCTView', false, 'view');

    expect(committedPayloadOf(orphan)).toBe(undefined);
  });
});

report();
