// The wrapper and the LOWERED element must never share a tag, and this file is the only thing that
// can say so — both spellings resolve to the same Fabric view, so the committed tree cannot tell
// them apart, and every existing suite stays green either way.
//
// Why they must differ: the host behavior (`registerTextInputBehavior`) is keyed by TAG, and it does
// the same work this wrapper does — focus/blur mirror, event counter, controlled write, autoFocus.
// One tag for both paths means one node with two owners. `symbiote-pressable` set the precedent in
// the other direction: there the LOWERED tag is the new spelling, because the wrapper renders
// `symbiote-view`; here the wrapper had the plain name first, so the wrapper is what gets qualified.
//
// This is a source assertion rather than a mounted one, deliberately. The tag is written LITERALLY
// in the template (`<svelte:element this={descriptor.type}>` is refused for the reason that file's
// header records), so the template does not follow `render-text-input.ts` on its own — which is
// exactly the coupling that needs a test. Both sides are DERIVED here, never memorised: rename an
// intrinsic on either side and this fails.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderTextInput } from '@symbiote-native/components';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';

const SOURCE = readFileSync(join(__dirname, 'index.svelte'), 'utf8');

const intrinsicFor = (multiline: boolean): string =>
  renderTextInput({
    multiline,
    text: undefined,
    mostRecentEventCount: 0,
    folded: {},
    passthrough: {},
  }).type;

describe('the TextInput wrapper tag', () => {
  it.each([
    ['single-line', false],
    ['multiline', true],
  ])(
    'renders the %s intrinsic that renderTextInput picks',
    (_label, multiline) => {
      expect(SOURCE).toContain(`<${intrinsicFor(multiline)}`);
    },
  );

  it('never renders a tag the lowering transform emits', () => {
    const primitive = HOST_PRIMITIVES.TextInput;
    // Withheld entries are a real state for this primitive (the switch has been thrown and reverted
    // once), and a skipped assertion is honest where a passing one would not be.
    expect(primitive, 'the spec carries a TextInput entry').toBeDefined();
    const lowered = new Set(
      [primitive.intrinsic, primitive.intrinsicWhen?.intrinsic].filter(
        (tag): tag is string => tag !== undefined,
      ),
    );
    // Parse the tags out and test SET MEMBERSHIP. A delimiter (`<tag ` / `<tag\n`) also works today
    // and is the wrong shape: these four spellings are a prefix family, so every containment check
    // over them is one rename away from matching a sibling, and a formatter that moves the delimiter
    // breaks it silently. Membership cannot be fooled by a prefix at all.
    const rendered = [...SOURCE.matchAll(/<(symbiote-[a-z-]+)/g)].map(
      match => match[1],
    );
    expect(rendered.filter(tag => lowered.has(tag))).toEqual([]);
  });
});
