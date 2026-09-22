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

  // why: the component-keyed rule that HAD two TypeScript twins, which is the drift this read
  // closes. `applyTextDefaults` in `fabric-props.ts` and `resolveTextProps` in
  // `core/components/src/text-props.ts` were both deleted on 2026-09-18 and the four cases below are
  // where their claims went. Neither could ever have caught the device rule: one is a vitest over the
  // headless builder, the other a unit test of a function the commit path does not call.
  it('shows a text node the platform defaults no adapter writes', () => {
    const text = commit('RCTText', 'text', {});

    const payload = committedPayloadOf(text);
    if (payload === undefined) throw new Error('the text committed no payload');

    expect(payload.ellipsizeMode).toBe('tail');
    expect(payload.allowFontScaling).toBe(true);
  });

  // why: THE OTHER TWO DEFAULTS RN'S OWN `<Text>` APPLIES, and we did not — found by diffing the
  // committed payload of one bench row against React Native's
  // (`row-payload-parity.itest.tsx`), which is a comparison the mutation oracle cannot make: a
  // mounting log carries `type`, `nativeID` and `index` and no props at all.
  //
  // `Text.js:145` resolves `accessible` as `accessible !== false` on iOS, and `:547` puts
  // `overflow: 'hidden'` in the component's own default style — "native components have
  // historically acted like overflow: hidden", their words, so an app can tell that apart from an
  // explicit `visible`. Both are user-agent rules in the sense
  // `<platform_behavior_is_a_tag_rule_in_cpp>` names: they apply to every app, so they belong to the
  // platform rather than to a component in any one adapter.
  //
  // It is a PARITY gap and not only a benchmark one, which is the order the two matter in: an app
  // on this engine got a text node VoiceOver treats differently and that does not clip. The
  // benchmark consequence follows from it — seven props per row that stock pays and we did not, so
  // every adapter column in the suite was read on a lighter row than the baseline.
  it('marks a text node accessible and clipping, as RN own Text does', () => {
    const text = commit('RCTText', 'text', {});

    const payload = committedPayloadOf(text);
    if (payload === undefined) throw new Error('the text committed no payload');

    expect(payload.accessible).toBe(true);
    expect(payload.overflow).toBe('hidden');
  });

  // why: both are FALLBACKS, the same as the two above — and `overflow` is the one that has to be
  // spelled as a style, since that is where RN puts it and where an app's own `overflow: 'visible'`
  // arrives to beat it.
  it('lets an authored accessible and overflow beat the platform defaults', () => {
    const chosen = commit('RCTText', 'text', {
      accessible: false,
      style: { overflow: 'visible' },
    });
    const payload = committedPayloadOf(chosen);
    if (payload === undefined) throw new Error('the text committed no payload');

    expect(payload.accessible).toBe(false);
    expect(payload.overflow).toBe('visible');
  });

  // why: THE SAME DEFAULT ON THE OTHER HALF OF THE ROW, found in the same payload diff.
  // `TextInput.js:583` resolves `props.accessible !== false` and hands it to both the singleline and
  // the multiline view (`:703`, `:772`) — the identical shape, so it belongs beside the Text rule
  // rather than in any adapter.
  it('marks a text input accessible, as RN own TextInput does', () => {
    const input = commit('RCTSinglelineTextInputView', 'text-input', {});

    const payload = committedPayloadOf(input);
    if (payload === undefined)
      throw new Error('the text input committed no payload');

    expect(payload.accessible).toBe(true);
  });

  // why: a default is a FALLBACK, never an override — the half a payload-time rule can get wrong in
  // a way a seed could not, since a seed ran before the author's write and simply lost. `clip` is a
  // real RN mode rather than an absent value, so it has to survive rather than be re-defaulted.
  it('lets an authored text value beat the platform default', () => {
    const chosen = commit('RCTText', 'text', {
      ellipsizeMode: 'clip',
      allowFontScaling: false,
    });
    const payload = committedPayloadOf(chosen);
    if (payload === undefined) throw new Error('the text committed no payload');

    expect(payload.ellipsizeMode).toBe('clip');
    expect(payload.allowFontScaling).toBe(false);
  });

  // why: `!== false`, not `?? true`. RN treats an explicit `undefined` and a missing prop alike and
  // only a literal `false` opts out — so an adapter that spells an absent prop as `undefined` must
  // still get the default rather than `undefined` reaching native.
  it('treats an explicit undefined as absent, which only a literal false opts out of', () => {
    const blank = commit('RCTText', 'text', {
      ellipsizeMode: undefined,
      allowFontScaling: undefined,
    });
    const payload = committedPayloadOf(blank);
    if (payload === undefined) throw new Error('the text committed no payload');

    expect(payload.ellipsizeMode).toBe('tail');
    expect(payload.allowFontScaling).toBe(true);
  });

  // why: a NULL is not a value the author chose either, and getting that wrong is device-only and
  // silent — `<text ellipsizeMode={null}>` committed null until Solid's renderer was corrected for
  // it in 2026-08, its second revision of a rule it should never have held. Travelled here from
  // `adapters/solid/src/tag-folds.test.tsx`, which could only ever see that adapter's own copy.
  it('treats a null the same as an absent value', () => {
    const nulled = commit('RCTText', 'text', {
      ellipsizeMode: null,
      allowFontScaling: null,
    });
    const payload = committedPayloadOf(nulled);
    if (payload === undefined) throw new Error('the text committed no payload');

    expect(payload.ellipsizeMode).toBe('tail');
    expect(payload.allowFontScaling).toBe(true);
  });

  // why: the keys are Text's. A `<View>` carrying them would be two junk props on every node in the
  // tree — the cost this rule exists to remove, reintroduced at a hundred times the scale. This is
  // the control for the four cases above, and the reason the rule is keyed on the component.
  it('leaves a non-text node without either default', () => {
    const view = commit('RCTView', 'view', { testID: 'plain' });
    const payload = committedPayloadOf(view);
    if (payload === undefined) throw new Error('the view committed no payload');

    expect(payload.ellipsizeMode).toBe(undefined);
    expect(payload.allowFontScaling).toBe(undefined);
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
