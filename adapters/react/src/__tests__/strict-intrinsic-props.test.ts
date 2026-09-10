// Which intrinsics carry a STRICT prop type, and which still accept anything.
//
// THE PREMISE THIS TEST USED TO HAVE IS GONE, and the replacement is the finding. It used to derive
// "is this primitive a tag yet" from `export const View = 'view'` in `components.ts` — a capitalized
// alias whose value was the tag string — and require a strict entry for each one that had crossed.
// Every alias was deleted on 2026-09-11: an app writes `<view>` / `<text>` directly, so the set the
// old oracle measured is empty and nothing is a component any more.
//
// What that changes is who owns the app's compile-time surface. While a primitive was a component,
// `FC<IXProps>` supplied strictness and the loose intrinsic entry was plumbing. Now the ENTRY is the
// whole surface — and only two of them are strict, so `<image nope={1}/>` is not a TS2322 today.
// That is open debt, pinned below so it shrinks deliberately rather than being rediscovered.
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

// The names the table declares strictly: everything omitted from the loose Record and re-declared.
function strictlyDeclared(): string[] {
  const omit = jsxSource.match(
    /Record<ISymbioteIntrinsic, IHostProps>,\s*([^>]+)>/s,
  );
  if (omit === null) return [];
  return [...omit[1].matchAll(/'([a-z][a-z-]*)'/g)]
    .map(match => match[1])
    .sort();
}

// Equality, not a floor: an entry added without a strict type reddens here, and so does one
// removed. Growing this list is the intended direction — every name still absent is a primitive
// whose props an app can misspell with nothing red.
const STRICT = ['text', 'view'];

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

  // why: the table must stay DERIVED from the union. It had drifted four names behind while it was
  // hand-written — `pressable` among them — and a hand-written list cannot report a name that is
  // absent from it.
  it('declares the tag set by deriving it, not by listing it', () => {
    expect(jsxSource).toContain('Record<ISymbioteIntrinsic, IHostProps>');
  });
});
