// GUARDS A RELEASE-ONLY BUG CLASS THAT NO BEHAVIOURAL TEST CAN SEE.
//
// Metro enables `inlineRequires` in production only: it moves a `require()` from the top of a
// module down to the first place its binding is USED. A barrel's `export { Thing } from './thing'`
// compiles to a lazy getter, so if nothing ever names `Thing` as a VALUE, `./thing` is never
// evaluated — and any work its module body does at load time silently never happens. In dev, in
// vitest, and in `tsc` everything is eager and everything passes. The code is even present in the
// release bundle; it just never runs.
//
// That is exactly how `interpolation-node.ts` shipped broken (2026-08-14): it called
// `registerInterpolationFactory(...)` at module scope, the only path to it was the animated
// barrel's re-export, nothing named `AnimatedInterpolation` as a value (adapters only TYPE it),
// and the first `.interpolate()` on device threw `interpolation factory not registered`, blanking
// examples/vue-sfc's screen. Adding a bare `import './interpolation-node'` beside the re-export
// did NOT help either — Babel merges two imports of the same specifier into one lazy dependency.
//
// So this test checks the SHAPE, not the behaviour: every module that performs a load-time
// registration must be reachable by something other than a pure re-export. The two shapes that
// satisfy it are a bare `import './m';` (as in packages/slider/src/*/index.ts) or an ordinary
// value import — both give inline-requires a real use site. A module reachable ONLY through
// `export ... from` fails here.
//
// Cheapest correct fix when this fails is usually not to add an import but to DELETE the
// indirection, which is what the interpolation case ended up doing (AnimatedInterpolation now
// lives in graph.ts next to the base class it extends).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const REPO_ROOT = resolve(__dirname, '../../..');
const SCANNED_ROOTS = ['core', 'adapters', 'packages'];

// A load-time registration is a top-level call to an imported `registerX` / `setX` function.
// Both prefixes are used in this codebase (registerInterpolationFactory, registerPostCommit,
// registerComposedComponent, registerShimDocumentFactory, setColorProcessor).
const REGISTRATION_CALLEE = /^(register|set)[A-Z]/;

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'build' || entry === 'build-ngc') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (full.endsWith('.ts') && !full.endsWith('.d.ts') && !full.includes('.test.')) {
      out.push(full);
    }
  }
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );
}

// './x' -> the file it actually resolves to, so importers and importees can be compared by path.
function resolveSpecifier(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

interface IModuleFacts {
  /** Top-level `registerX(...)` / `setX(...)` calls on an imported binding. */
  registrations: string[];
  /** Files this module pulls in with a BARE side-effect import (`import './m';`). */
  bareImports: string[];
  /** Names this module imports as VALUES from anywhere (type-only imports excluded). */
  valueImportedNames: string[];
  /** Names this module exports as values, i.e. what a consumer could name to wake it up. */
  exportedNames: string[];
}

function analyze(file: string): IModuleFacts {
  const source = parse(file);
  const importedNames = new Set<string>();
  const bareImports: string[] = [];
  const valueImportedNames: string[] = [];
  const exportedNames: string[] = [];
  const registrations: string[] = [];

  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      // No import clause at all == `import './m';` — the one form inline-requires cannot defer,
      // because there is no binding for it to chase to a use site.
      if (clause === undefined) {
        const target = resolveSpecifier(file, statement.moduleSpecifier.text);
        if (target !== undefined) bareImports.push(target);
      } else if (clause.isTypeOnly !== true) {
        // `import type ...` is erased at compile time and carries no runtime dependency.
        if (clause.name !== undefined) valueImportedNames.push(clause.name.text);
        const named = clause.namedBindings;
        if (named !== undefined && ts.isNamedImports(named)) {
          for (const element of named.elements) {
            if (!element.isTypeOnly) {
              importedNames.add(element.name.text);
              valueImportedNames.push(element.name.text);
            }
          }
        }
      }
    }

    if (
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isVariableStatement(statement)) &&
      isExported(statement)
    ) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) exportedNames.push(declaration.name.text);
        }
      } else if (statement.name !== undefined) {
        exportedNames.push(statement.name.text);
      }
    }

    // A top-level expression statement calling an imported register*/set* function.
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
      const callee = statement.expression.expression;
      if (ts.isIdentifier(callee) && REGISTRATION_CALLEE.test(callee.text)) {
        if (importedNames.has(callee.text)) registrations.push(callee.text);
      }
    }
  }

  return { registrations, bareImports, valueImportedNames, exportedNames };
}

describe('load-time registrations survive an inline-requires production bundle', () => {
  it('is never reachable only through a lazy re-export', () => {
    const files: string[] = [];
    for (const root of SCANNED_ROOTS) collectSourceFiles(join(REPO_ROOT, root), files);

    const facts = new Map(files.map(file => [file, analyze(file)]));

    // Two ways a module's body is guaranteed to run.
    //
    // 1. Something bare-imports it (`import './m';`) — no binding, nothing to defer.
    const bareImported = new Set<string>();
    // 2. Something names one of its exports as a VALUE. Walking a barrel getter to read that name
    //    materializes the require, so the body runs at first access. This is deliberately matched
    //    on the NAME rather than a resolved path: adapters reach engine internals through the
    //    package specifier (`from '@symbiote-native/engine'`), which no relative resolver can
    //    follow. The trade-off is that an identically-named export in an unrelated package would
    //    mask a real finding — acceptable for a guard whose job is catching the shape, and the
    //    reason this is a heuristic rather than a proof.
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
