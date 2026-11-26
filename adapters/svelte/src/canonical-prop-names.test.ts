// Re-derives `canonical-prop-names.ts` through the TypeScript checker, so a primitive that gains
// a prop fails here and not on a device as a key Fabric silently drops
// To regenerate, run the failure's own diff, which names every added and removed member
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { join } from 'node:path';
import {
  BOOLEAN_PROP_NAMES,
  CANONICAL_PROP_NAMES,
} from './canonical-prop-names';

// The adapter's PUBLIC barrel, not a directory scan: what an app can import is what it can write
// on a tag, so the surface cannot drift without drifting from the package API
const ENTRY = join(__dirname, 'index.ts');

type IDerivedSurface = {
  readonly names: string[];
  // Props typed boolean with no string anywhere, so for these "" can only be the shorthand for true
  readonly booleans: string[];
};

function takesBoolean(type: ts.Type): boolean {
  return (
    (type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !== 0
  );
}

function takesEmptyString(type: ts.Type): boolean {
  if ((type.flags & ts.TypeFlags.String) !== 0) return true;
  return type.isStringLiteral() && type.value === '';
}

function resolvedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  const isAlias = (symbol.flags & ts.SymbolFlags.Alias) !== 0;
  return isAlias ? checker.getAliasedSymbol(symbol) : symbol;
}

function propsExportedBy(
  checker: ts.TypeChecker,
  moduleSymbol: ts.Symbol,
): ts.Symbol[] {
  return checker
    .getExportsOfModule(moduleSymbol)
    .filter(symbol => /^I[A-Z].*Props$/.test(symbol.getName()))
    .map(symbol => resolvedSymbol(checker, symbol));
}

// Kept apart from `deriveSurface` so the program setup and the walk each stay readable
function surfaceOf(
  checker: ts.TypeChecker,
  moduleSymbol: ts.Symbol,
): IDerivedSurface {
  const names = new Set<string>();
  const booleans = new Set<string>();
  const strings = new Set<string>();
  for (const target of propsExportedBy(checker, moduleSymbol)) {
    const declared = checker.getDeclaredTypeOfSymbol(target);
    for (const prop of checker.getPropertiesOfType(declared)) {
      const name = prop.getName();
      names.add(name);
      const type = checker.getTypeOfSymbol(prop);
      const members = type.isUnion() ? type.types : [type];
      if (members.some(takesBoolean)) booleans.add(name);
      if (members.some(takesEmptyString)) strings.add(name);
    }
  }
  return {
    names: [...names].sort(),
    booleans: [...booleans].filter(name => strings.has(name) === false).sort(),
  };
}

function deriveSurface(): IDerivedSurface {
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
  return surfaceOf(checker, moduleSymbol);
}

describe('the canonical prop-name list', () => {
  const surface = deriveSurface();
  const derived = surface.names;

  // `accessible` is the device-seen case, `accessibilityLabel` is a string and must never be in it
  it('derives the boolean subset', () => {
    expect(surface.booleans).toContain('accessible');
    expect(surface.booleans).not.toContain('accessibilityLabel');
    expect([...BOOLEAN_PROP_NAMES].sort()).toEqual(surface.booleans);
  });

  // The premise of the file: a checker that resolved nothing would agree with an empty list
  it('resolves a real surface through the checker', () => {
    expect(derived.length).toBeGreaterThan(200);
    expect(derived, 'a name only a prop type could supply').toContain('testID');
  });

  it('matches what the renderer ships', () => {
    expect([...CANONICAL_PROP_NAMES].sort()).toEqual(derived);
  });

  // Two names that differ only in case would make the casing repair a coin toss
  // The renderer sees one lowercased key and has to pick
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
