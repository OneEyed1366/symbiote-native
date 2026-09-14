// Which intrinsics carry a STRICT prop type, and which still accept anything.
//
// SECOND PREMISE SHIFT (2026-09-14, first one dated 2026-09-11 below): `jsx-runtime.ts` no longer
// hand-rolls `Omit<Record<ISymbioteIntrinsic, IHostProps>, 'view' | 'text'>` plus two explicit
// fields. It now calls the same `ICrossTypedIntrinsics` generic Vue/Svelte/Solid already use, fed
// an `ICrossedPrimitiveProps` interface that lists every crossed tag directly — 18 of them now
// (pressable, button, image, scroll-view, switch, text-input, ... ), not just view/text. The
// extraction below reads that interface's own keys instead of an Omit clause that no longer exists.
//
// Original premise (2026-09-11): this used to derive "is this primitive a tag yet" from
// `export const View = 'view'` in `components.ts` — a capitalized alias whose value was the tag
// string. Every alias was deleted that day: an app writes `<view>` / `<text>` directly, so that
// oracle went to zero and nothing was a component any more.
//
// Read as source rather than checked by the compiler on purpose: NO test file in this repo is
// type-checked (every package's tsconfig excludes `**/*.test.ts`, and vitest strips types without
// checking them), so a type-level assertion written here would be decoration. See
// `.claude/rules/test-harness-false-greens.md`, "A type-level oracle inside a test file does not
// run".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const jsxSource = readFileSync(join(SRC, 'jsx-runtime.ts'), 'utf8');

// The names the table declares strictly: every key of `ICrossedPrimitiveProps`.
function strictlyDeclared(): string[] {
  const body = jsxSource.match(/interface ICrossedPrimitiveProps \{([^}]+)\}/s);
  if (body === null) return [];
  return [...body[1].matchAll(/^\s*'?([a-zA-Z][a-zA-Z-]*)'?:/gm)]
    .map(match => match[1])
    .sort();
}

// Equality, not a floor: an entry added without a strict type reddens here, and so does one
// removed. Growing this list is the intended direction — every name still absent is a primitive
// whose props an app can misspell with nothing red.
const STRICT = [
  'activity-indicator',
  'button',
  'image',
  'image-background',
  'input-accessory-view',
  'modal',
  'pressable',
  'refresh-control',
  'safe-area-view',
  'scroll-view',
  'switch',
  'text',
  'text-input',
  'touchable-highlight',
  'touchable-native-feedback',
  'touchable-opacity',
  'touchable-without-feedback',
  'view',
];

describe('intrinsic prop strictness', () => {
  // why: the control. The assertion below compares two derived lists, and two EMPTY lists compare
  // equal — the shape that reports agreement while measuring nothing. If the extraction stops
  // matching (a rename, a formatting change), this fails first and says so.
  it('control: the extraction finds something', () => {
    expect(
      strictlyDeclared().length,
      'strict entries in jsx-runtime.ts',
    ).toBeGreaterThan(0);
  });

  it('declares exactly the strict entries this adapter has', () => {
    expect(strictlyDeclared()).toEqual(STRICT);
  });

  // why: the table must stay DERIVED from the union, not hand-listed. `ICrossTypedIntrinsics`
  // (`Omit<Record<ISymbioteIntrinsic, LooseProps>, keyof Crossed> & Crossed`) is what does that
  // derivation now, shared verbatim with Vue/Svelte/Solid — a tag missing from `Crossed` falls
  // through to the loose bag instead of vanishing, which the old hand-written interface couldn't
  // guarantee.
  it('declares the tag set by deriving it, not by listing it', () => {
    expect(jsxSource).toContain('ICrossTypedIntrinsics<');
  });
});
