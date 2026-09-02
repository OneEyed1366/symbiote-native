// A primitive that has become a public TAG must carry its own strict prop type in the intrinsic
// table — and this test exists because losing that is SILENT.
//
// While a primitive is a component, its props come from `FC<IXProps>` and its intrinsic entry is
// deliberately loose (`HostProps`, index signature); the strictness lives on the component and the
// entry is plumbing. The day it becomes a tag, the entry IS the app's public type surface — but the
// entry already exists and already accepts anything, so `<Image nope={1}/>` silently stops being a
// TS2322 and nothing goes red. There is no failing state to notice.
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
const componentsSource = readFileSync(join(SRC, 'components.ts'), 'utf8');
const jsxSource = readFileSync(join(SRC, 'jsx.ts'), 'utf8');

// A primitive is a TAG here exactly when the barrel exports its name as a string constant whose
// value is the intrinsic — `export const View = 'symbiote-view'`. No annotation and no `as const`:
// a `const` already infers the literal type, and both spellings are lint errors here. Derived from the
// source rather than listed, so a primitive that crosses is picked up by this test in the same
// commit that crosses it.
function taggedIntrinsics(): string[] {
  const found = [
    ...componentsSource.matchAll(
      /export const [A-Za-z]+ = '(symbiote-[a-z-]+)';/g,
    ),
  ].map(match => match[1]);
  return [...new Set(found)].sort();
}

// The names the table declares strictly: everything omitted from the loose Record and re-declared.
function strictlyDeclared(): string[] {
  const omit = jsxSource.match(
    /Record<ISymbioteIntrinsic, HostProps>,\s*([^>]+)>/s,
  );
  if (omit === null) return [];
  return [...omit[1].matchAll(/'(symbiote-[a-z-]+)'/g)]
    .map(match => match[1])
    .sort();
}

describe('intrinsic prop strictness follows the tags', () => {
  // why: the control. Every row below compares two derived lists, and two EMPTY lists compare
  // equal — the shape that reports agreement while measuring nothing. If the extraction stops
  // matching (a rename, a formatting change), this fails first and says so.
  it('control: both extractions find something', () => {
    expect(
      taggedIntrinsics().length,
      'primitives exported as tags',
    ).toBeGreaterThan(0);
    expect(
      strictlyDeclared().length,
      'strict entries in jsx.ts',
    ).toBeGreaterThan(0);
  });

  // why: THE assertion. A primitive that is already a tag and is still typed `HostProps` accepts
  // any prop, so the app loses its compile-time surface with nothing to show for it.
  it('every primitive that is already a tag has a strict entry', () => {
    expect(strictlyDeclared()).toEqual(taggedIntrinsics());
  });

  // why: the table must stay DERIVED from the union. It had drifted four names behind while it was
  // hand-written — `symbiote-pressable` among them, the next primitive due to cross — and a
  // hand-written list cannot report a name that is absent from it.
  it('declares the tag set by deriving it, not by listing it', () => {
    expect(jsxSource).toContain('Record<ISymbioteIntrinsic, HostProps>');
  });
});
