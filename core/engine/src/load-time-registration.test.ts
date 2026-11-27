// Guards a release-only bug class no behavioral test can see.
// `inlineRequires` in Metro defers a `require()` to its binding's first value use, so a barrel's
// pure re-export never evaluates a load-time-registering module, while dev and vitest stay green

// So this checks the SHAPE, not the behavior: every such module must be reachable by a bare
// `import './m';` or an ordinary value import, not only `export ... from`. The cheapest fix when
// this fails is usually deleting the indirection, not adding an import.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const REPO_ROOT = resolve(__dirname, '../../..');
const SCANNED_ROOTS = ['core', 'adapters', 'packages'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'build', 'build-ngc']);

// Tests write throwaway probes under a dot or double-underscore name and delete them
function isSkippedEntry(name: string): boolean {
  return (
    SKIPPED_DIRECTORIES.has(name) ||
    name.startsWith('.') ||
    name.startsWith('__')
  );
}

// A load-time registration is a top-level call to an imported `registerX` / `setX` function.
// Both prefixes are used in this codebase (registerInterpolationFactory, registerPostCommit,
// registerComposedComponent, registerShimDocumentFactory, setColorProcessor).
const REGISTRATION_CALLEE = /^(register|set)[A-Z]/;

// `withFileTypes`, a RACE FIX not a tidy-up: Svelte suites write and rmSync a
// `.smoke-compiled-*.mjs` beside their own source, so a separate statSync could ENOENT on an
// entry this function would discard anyway. One syscall closes the window instead of catching it.
function collectSourceFiles(dir: string, out: string[]): void {
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const entry = dirent.name;
    if (isSkippedEntry(entry)) continue;
    const full = join(dir, entry);
    if (dirent.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (isBundledSource(full)) {
      out.push(full);
    }
  }
}

// A bench and an itest are excluded like a test: neither is ever in a Metro bundle
function isBundledSource(file: string): boolean {
  const isDeclaration = file.endsWith('.d.ts');
  const isTestLike = ['.test.', '.bench.', '.itest.'].some(infix =>
    file.includes(infix),
  );
  return file.endsWith('.ts') && !isDeclaration && !isTestLike;
}

// A second race cannot be closed like the `withFileTypes` one, only named
// The walk lists a path and `parse` reads it later, so a `.ts` that vanishes throws a bare ENOENT

// This does not CATCH the race, it labels it: swallowing the file would be worse, since a skipped
// module is a finding that silently stops being reported. Rethrowing with the path means the next
// occurrence arrives already diagnosed instead of read as flakiness.
function parse(file: string): ts.SourceFile {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (cause) {
    throw new Error(
      `${relative(REPO_ROOT, file)} was listed by the walk and could not be read. ` +
        `If this is ENOENT it is a race against a test writing and deleting files under a ` +
        `scanned root, not a finding about that file — rerun it alone to tell them apart.`,
      { cause },
    );
  }
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );
}

// './x' -> the file it actually resolves to, so importers and importees can be compared by path.
function resolveSpecifier(
  fromFile: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith('.')) return resolveWorkspaceSubpath(specifier);
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

// A workspace subpath, through the target package's own `exports` map: without it a module
// reached as `@symbiote-native/components/register` looks unreferenced. Derived from the manifest
// rather than listed, so a new subpath needs no edit here.
function resolveWorkspaceSubpath(specifier: string): string | undefined {
  const match = /^@symbiote-native\/([^/]+)\/(.+)$/.exec(specifier);
  if (match === null) return undefined;
  for (const area of SCANNED_ROOTS) {
    const manifest = join(REPO_ROOT, area, match[1], 'package.json');
    if (!existsSync(manifest)) continue;
    const { exports }: { exports?: Record<string, unknown> } = JSON.parse(
      readFileSync(manifest, 'utf8'),
    );
    const target = exports?.[`./${match[2]}`];
    if (typeof target !== 'string') return undefined;
    const file = join(REPO_ROOT, area, match[1], target);
    return existsSync(file) ? file : undefined;
  }
  return undefined;
}

type IModuleFacts = {
  /** Top-level `registerX(...)` / `setX(...)` calls on an imported binding. */
  registrations: string[];
  /** Files this module pulls in with a BARE side-effect import (`import './m';`). */
  bareImports: string[];
  /** Names this module imports as VALUES from anywhere (type-only imports excluded). */
  valueImportedNames: string[];
  /** Names this module exports as values, i.e. what a consumer could name to wake it up. */
  exportedNames: string[];
};

const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(
    m => m.kind === ts.SyntaxKind.ExportKeyword,
  );

function noteImportedBindings(
  clause: ts.ImportClause,
  importedNames: Set<string>,
  valueImportedNames: string[],
): void {
  // `import type ...` is erased at compile time and carries no runtime dependency.
  if (clause.isTypeOnly === true) return;
  if (clause.name !== undefined) valueImportedNames.push(clause.name.text);
  const named = clause.namedBindings;
  if (named === undefined || !ts.isNamedImports(named)) return;
  for (const element of named.elements) {
    if (element.isTypeOnly) continue;
    importedNames.add(element.name.text);
    valueImportedNames.push(element.name.text);
  }
}

function noteImport(
  file: string,
  statement: ts.ImportDeclaration,
  importedNames: Set<string>,
  facts: IModuleFacts,
): void {
  if (!ts.isStringLiteral(statement.moduleSpecifier)) return;
  const clause = statement.importClause;
  if (clause !== undefined) {
    noteImportedBindings(clause, importedNames, facts.valueImportedNames);
    return;
  }
  // No import clause at all == `import './m';` — the one form inline-requires cannot defer,
  // because there is no binding for it to chase to a use site.
  const target = resolveSpecifier(file, statement.moduleSpecifier.text);
  if (target !== undefined) facts.bareImports.push(target);
}

function noteExport(statement: ts.Statement, exportedNames: string[]): void {
  if (!isExported(statement)) return;
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name))
        exportedNames.push(declaration.name.text);
    }
    return;
  }
  const isNamedDeclaration =
    ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement);
  if (isNamedDeclaration && statement.name !== undefined) {
    exportedNames.push(statement.name.text);
  }
}

// A top-level expression statement calling an imported register*/set* function.
function noteRegistration(
  statement: ts.Statement,
  importedNames: Set<string>,
  registrations: string[],
): void {
  if (!ts.isExpressionStatement(statement)) return;
  if (!ts.isCallExpression(statement.expression)) return;
  const callee = statement.expression.expression;
  if (!ts.isIdentifier(callee) || !REGISTRATION_CALLEE.test(callee.text)) {
    return;
  }
  if (importedNames.has(callee.text)) registrations.push(callee.text);
}

function analyze(file: string): IModuleFacts {
  const source = parse(file);
  const importedNames = new Set<string>();
  const facts: IModuleFacts = {
    registrations: [],
    bareImports: [],
    valueImportedNames: [],
    exportedNames: [],
  };

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      noteImport(file, statement, importedNames, facts);
    }
    noteExport(statement, facts.exportedNames);
    noteRegistration(statement, importedNames, facts.registrations);
  }

  return facts;
}

// No classic throw/reject Negative group: this static analysis reports findings via a returned
// string. "Negative" means the shape the detector must FLAG; "Positive" means known-safe shapes
// that must NOT be flagged, or the false positive defeats the whole guard.
describe('load-time registrations survive an inline-requires production bundle', () => {
  describe('detector correctness on synthetic fixtures', () => {
    // A fresh scratch directory per test: collectSourceFiles/analyze operate on real files on
    // disk by design, so a temp fixture tree is the only way to drive them without real source.
    let scratchDir: string;

    beforeEach(() => {
      scratchDir = mkdtempSync(
        join(tmpdir(), 'load-time-registration-fixture-'),
      );
    });

    afterEach(() => {
      rmSync(scratchDir, { recursive: true, force: true });
    });

    function writeModule(relativePath: string, contents: string): void {
      const full = join(scratchDir, relativePath);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents, 'utf8');
    }

    function scanScratchDir(): string[] {
      const files: string[] = [];
      collectSourceFiles(scratchDir, files);
      const facts = new Map(files.map(file => [file, analyze(file)]));

      const bareImported = new Set<string>();
      const namedAsValue = new Set<string>();
      for (const { bareImports, valueImportedNames } of facts.values()) {
        for (const target of bareImports) bareImported.add(target);
        for (const name of valueImportedNames) namedAsValue.add(name);
      }

      return [...facts]
        .filter(
          ([file, fact]) =>
            fact.registrations.length > 0 &&
            !bareImported.has(file) &&
            !fact.exportedNames.some(name => namedAsValue.has(name)),
        )
        .map(([file]) => relative(scratchDir, file));
    }

    // why: the literal bug shape — a barrel re-export as the only path, nothing naming the export
    // as a value. Without this fixture the real-repo test below proves nothing either way.
    it('flags a registration reachable only through a barrel re-export', () => {
      writeModule(
        'thing.ts',
        "import { registerFactory } from './registry';\nregisterFactory('thing', {});\nexport const Thing = 1;\n",
      );
      writeModule(
        'registry.ts',
        'export function registerFactory(name: string, impl: unknown): void {}\n',
      );
      writeModule('barrel.ts', "export { Thing } from './thing';\n");
      writeModule(
        'consumer.ts',
        "import type { Thing } from './barrel';\nexport type { Thing };\n",
      );

      expect(scanScratchDir()).toEqual(['thing.ts']);
    });

    // The shape the repo's own fix landed on for AnimatedInterpolation
    // A bare side-effect import is a real use site with no binding to defer, so it is not flagged
    it('does not flag a registration reached via a bare side-effect import', () => {
      writeModule(
        'thing.ts',
        "import { registerFactory } from './registry';\nregisterFactory('thing', {});\nexport const Thing = 1;\n",
      );
      writeModule(
        'registry.ts',
        'export function registerFactory(name: string, impl: unknown): void {}\n',
      );
      writeModule('entry.ts', "import './thing';\n");

      expect(scanScratchDir()).toEqual([]);
    });

    // why: an ordinary named value import materializes the require at that use site under
    // inline-requires — this is the everyday, unremarkable safe case the detector must not flag.
    it('does not flag a registration reached via an ordinary value import', () => {
      writeModule(
        'thing.ts',
        "import { registerFactory } from './registry';\nregisterFactory('thing', {});\nexport const Thing = 1;\n",
      );
      writeModule(
        'registry.ts',
        'export function registerFactory(name: string, impl: unknown): void {}\n',
      );
      writeModule(
        'consumer.ts',
        "import { Thing } from './thing';\nconsole.log(Thing);\n",
      );

      expect(scanScratchDir()).toEqual([]);
    });
  });

  it('is never reachable only through a lazy re-export', () => {
    const files: string[] = [];
    for (const root of SCANNED_ROOTS)
      collectSourceFiles(join(REPO_ROOT, root), files);

    const facts = new Map(files.map(file => [file, analyze(file)]));

    // Two ways a module's body is guaranteed to run.
    //
    // 1. Something bare-imports it (`import './m';`) — no binding, nothing to defer.
    const bareImported = new Set<string>();
    // 2. Something names one of its exports as a VALUE, materializing the require. Matched on the
    //    NAME, not a resolved path (adapters reach internals via package specifier) — a heuristic,
    //    so an identically-named export elsewhere could mask a real finding.
    const namedAsValue = new Set<string>();
    for (const { bareImports, valueImportedNames } of facts.values()) {
      for (const target of bareImports) bareImported.add(target);
      for (const name of valueImportedNames) namedAsValue.add(name);
    }

    const unreachable = [...facts]
      .filter(
        ([file, fact]) =>
          fact.registrations.length > 0 &&
          !bareImported.has(file) &&
          !fact.exportedNames.some(name => namedAsValue.has(name)),
      )
      .map(
        ([file, fact]) =>
          `${relative(REPO_ROOT, file)} — calls ${fact.registrations.join(', ')} at module scope, ` +
          `but nothing bare-imports it and none of its exports (${fact.exportedNames.join(', ') || 'none'}) ` +
          `is ever named as a value, so a release bundle never evaluates it`,
      );

    // Joined into one string on purpose: an array diff gets truncated by the reporter, and the
    // whole value of this test is naming the offending file in the failure output.
    expect(
      unreachable.join('\n'),
      'modules whose load-time registration would be skipped in release',
    ).toBe('');
  });
});
