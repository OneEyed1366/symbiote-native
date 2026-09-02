// `TextInput` is the first primitive whose TAG is chosen by a prop, and the first refusal category
// where getting it wrong commits the WRONG NATIVE VIEW rather than a wrong prop value — no later
// write corrects that, which is why `dynamicIntrinsicChoice` is its own category and not a case of
// `unreadableValue`.
//
// The entry is withheld from the shared spec, so this injects its own — see below for why the
// self-deleting shape is the point and not a shortcut.
import { describe, expect, it } from 'vitest';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import { lowerHostPrimitives } from './lower-host-primitives';

// The `TextInput` entry is WITHHELD from the shared spec — it was thrown on 2026-08-31 and reverted
// the same hour, because lowering a TextInput hands it to a host behavior that no adapter registers
// yet, and the two paths share their tags (unlike Pressable, whose component emits `symbiote-view`).
// The entry is REAL as of 2026-08-31. Until then this file carried its own copy of it behind a
// self-deleting injection — the right shape for proving a transform before the switch is thrown,
// and a live hazard the moment the switch lands: the `afterAll` that removed the injection would
// have removed the SHIPPING entry, from module state shared with every suite in the process.
// Reading the spec cannot do that, and cannot drift from it either.
const TEXT_INPUT_ENTRY = HOST_PRIMITIVES.TextInput;

const IMPORT = `<script>\n  import { TextInput } from '@symbiote-native/svelte';\n</script>\n`;

const lower = (markup: string): string =>
  lowerHostPrimitives().markup({
    content: `${IMPORT}${markup}`,
    filename: 'Probe.svelte',
  })?.code ?? `${IMPORT}${markup}`;

// WHICH lowered tag the output carries, or undefined if the transform refused.
//
// Membership in a SET derived from the spec, never a substring: the four spellings form a prefix
// family (`symbiote-text-input`, `…-multiline`, `…-managed`, `…-multiline-managed`), so
// `includes('symbiote-text-input')` is true for all four. Vue and Solid carried that as a false
// GREEN — a wrapper tag reading as a lowering; here it was a false RED, because a refusal asserted
// `not.toContain(base)` and the `-managed` sibling contains the base. Different sign, one cause, and
// no delimiter trick fixes both: `<${tag} ` still matches `-managed` if the base is dropped from it.
//
// None of the four is reachable through this transform today — the `-managed` pair is printed by the
// wrapper at runtime and never appears in compiled output. That is the reason to close it rather
// than note it: "unreachable because nobody has written it yet" is the exact reasoning the tag split
// existed to retire.
function loweredTag(out: string): string | undefined {
  const primitive = HOST_PRIMITIVES.TextInput;
  const lowerable = new Set(
    [primitive?.intrinsic, primitive?.intrinsicWhen?.intrinsic].filter(
      (tag): tag is string => tag !== undefined,
    ),
  );
  for (const match of out.matchAll(/<(symbiote-[a-z-]+)/g))
    if (lowerable.has(match[1])) return match[1];
  return undefined;
}

describe('the reader this file measures with', () => {
  // The guard cannot be reached THROUGH the transform — no input makes it print a `-managed` tag —
  // so the assertion has to be made on the reader itself. Without this, weakening `loweredTag` back
  // to a substring test leaves every case below green: a lever that moves nothing.
  it('does not mistake a wrapper tag for a lowered one', () => {
    expect(
      loweredTag('<symbiote-text-input-managed p={{}} />'),
    ).toBeUndefined();
    expect(
      loweredTag('<symbiote-text-input-multiline-managed p={{}} />'),
    ).toBeUndefined();
  });

  it('still reads the two tags that ARE lowerings', () => {
    expect(loweredTag('<symbiote-text-input p={{}} />')).toBe(
      'symbiote-text-input',
    );
    expect(loweredTag('<symbiote-text-input-multiline p={{}} />')).toBe(
      'symbiote-text-input-multiline',
    );
  });
});

describe('a prop that selects between two intrinsics', () => {
  it.each([
    ['<TextInput multiline />', 'symbiote-text-input-multiline'],
    ['<TextInput multiline={true} />', 'symbiote-text-input-multiline'],
    ['<TextInput />', 'symbiote-text-input'],
    ['<TextInput multiline={false} />', 'symbiote-text-input'],
  ])('%s lowers to %s', (markup, intrinsic) => {
    // Equality, so a sibling of the prefix family cannot satisfy it and the "which one must NOT
    // appear" pin is subsumed rather than maintained beside it.
    expect(loweredTag(lower(markup))).toBe(intrinsic);
  });

  it('refuses a runtime value rather than guessing a view', () => {
    for (const markup of [
      '<TextInput multiline={isLong} />',
      '<TextInput multiline={!single} />',
      '<TextInput multiline={rows > 1} />',
    ]) {
      expect(loweredTag(lower(markup)), markup).toBeUndefined();
    }
  });

  it('refuses a literal that is neither true nor false', () => {
    // `{1}` and `{'yes'}` are Literals, so a check that stopped at the node TYPE would resolve them
    // by truthiness and commit a view the author never asked for.
    for (const markup of [
      `<TextInput multiline={1} />`,
      `<TextInput multiline={'yes'} />`,
    ]) {
      expect(loweredTag(lower(markup)), markup).toBeUndefined();
    }
  });
});
