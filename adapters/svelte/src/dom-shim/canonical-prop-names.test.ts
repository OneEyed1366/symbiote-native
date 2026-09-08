// The guard that keeps `canonical-prop-names.ts` from becoming the hand-written list this repo
// keeps getting burned by (`.claude/rules/adapter-parity-audit.md`, "Check Solid last and
// separately"). It re-derives the set through the TypeScript checker and compares — so a primitive
// that gains a prop, or a barrel that gains an `I*Props` type, fails HERE instead of failing on a
// device as a key Fabric silently drops.
//
// To regenerate after a legitimate change, run the failure's own diff: the message names every
// added and removed member. There is no generator script on purpose — a second copy of this
// derivation is a second thing to keep in step.
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { join } from 'node:path';
import { CANONICAL_PROP_NAMES } from './canonical-prop-names';

// The adapter's PUBLIC barrel, deliberately — not a directory scan. Whatever an app can import is
// exactly what an app can write on a tag, so the surface cannot drift out from under the list
// without also drifting out of the package's API (`tests/adapter-barrel-parity.test.ts`).
const ENTRY = join(__dirname, '..', 'index.ts');

function derivePropNames(): string[] {
  const program = ts.createProgram([ENTRY], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    strict: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(ENTRY);
  if (source === undefined) throw new Error(`could not load ${ENTRY}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined)
    throw new Error(`${ENTRY} resolved to no module symbol`);

  const names = new Set<string>();
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    if (!/^I[A-Z].*Props$/.test(symbol.getName())) continue;
    const target =
      (symbol.flags & ts.SymbolFlags.Alias) !== 0
        ? checker.getAliasedSymbol(symbol)
        : symbol;
    const declared = checker.getDeclaredTypeOfSymbol(target);
    for (const prop of checker.getPropertiesOfType(declared))
      names.add(prop.getName());
  }
  return [...names].sort();
}

describe('the canonical prop-name list', () => {
  const derived = derivePropNames();

  // The premise the whole file rests on: if the checker resolved nothing, every comparison below
  // is vacuous and would agree with an empty list (`test-harness-false-greens.md` §13).
  it('resolves a real surface through the checker', () => {
    expect(derived.length).toBeGreaterThan(200);
    expect(derived, 'a name only a prop type could supply').toContain('testID');
  });

  it('matches what the shim ships', () => {
    expect([...CANONICAL_PROP_NAMES].sort()).toEqual(derived);
  });

  // Two props whose names differ only in case would make the casing repair a coin toss: the shim
  // sees one lowercased key and has to pick. No such pair exists today; this is what says so.
  it('has no two names that collide when lowercased', () => {
    const byLower = new Map<string, string[]>();
    for (const name of CANONICAL_PROP_NAMES) {
      const lower = name.toLowerCase();
      byLower.set(lower, [...(byLower.get(lower) ?? []), name]);
    }
    const collisions = [...byLower.values()].filter(group => group.length > 1);
    expect(collisions).toEqual([]);
  });
});
