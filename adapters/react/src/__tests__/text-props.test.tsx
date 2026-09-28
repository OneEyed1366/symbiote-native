// What the React adapter contributes to a `<text>` tag's props — the FORWARDING.

// RN's two Text defaults are `foldTextDefaults`'s alone now, in `SymbioteFabricProps.cpp`, keyed
// on the component; asserted in `committed-payload.itest.ts` against a real commit. This harness's
// `fabricProps` carries no platform rules, so asserting a default here would assert the harness.

// What remains is the half that is genuinely this adapter's: an authored value reaches the engine
// unchanged, including the `false` that the whole `!== false` encoding exists for.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

const ROOT_TAG = 241;

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function textNode(): Record<string, unknown> {
  const node = fabric.find(n => n.viewName === 'RCTText');
  expect(node, 'an RCTText was created').toBeDefined();
  return payloadOf(node!.handle);
}

describe('what React sends a text tag', () => {
  // why: the engine's rule is keyed on the COMPONENT, so committing a `<text>` as `RCTText` is the
  // precondition for every default arriving. It is the one thing that can differ per adapter, and
  // asserting it says what the unauthored cases used to without restating the rule.
  it('commits a text tag under the component the rule is keyed on', () => {
    mount(ROOT_TAG, <text>hi</text>);
    expect(fabric.find(n => n.viewName === 'RCTText')).toBeDefined();
  });

  // why: an authored value has to REACH the engine untouched. Whether it then survives the default
  // is the rule's business and is asserted where the rule runs.
  it('forwards an authored ellipsizeMode', () => {
    mount(ROOT_TAG, <text ellipsizeMode="middle">hi</text>);
    expect(textNode().ellipsizeMode).toBe('middle');
  });

  // why: `false` is the value the `!== false` encoding exists for, and the one an adapter is most
  // likely to swallow — a renderer that treats falsy as absent drops it, and the engine would then
  // correctly default it to true. So the forwarding of THIS value is worth its own case even though
  // the encoding it feeds is no longer tested here.
  it('forwards an explicit allowFontScaling={false}', () => {
    mount(ROOT_TAG, <text allowFontScaling={false}>hi</text>);
    expect(textNode().allowFontScaling).toBe(false);
  });
});
