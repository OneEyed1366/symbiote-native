// An adapter reaches an engine node only through the host-access API, never through its fields
// A single `node.parent` pins the adapter to the tree's shape (`symbiote-fabric-cxx-surface` §9)
// The audit is type-aware, so the framework's own props and children pass

// A grep counted 275-453 `.props` and `.children` hits per adapter, mostly the framework's own
// Scoped by resolved type the real number was 8-13 per seam, and a regex cannot tell them apart
// `SymbioteSurface.children` and a Descriptor's `component` resolve to other types, so they pass

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { adapterNames } from '../scripts/lib/adapter-names.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');

// The engine's private fields, each reachable through the host-access API instead
// (`parentOf`, `childrenOf`, `firstChildOf`, `propOf`, `committedOf` and the rest)
const PRIVATE_FIELDS = new Set([
  'children',
  'parent',
  'props',
  'component',
  'isText',
  'listeners',
  'committed',
]);
// `dirty`, `propsDirty` and `structureDirty` are not fields any more, so a use is a tsc error
// Do not re-add them: a name no type carries is a rule that cannot fire and reads as coverage

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
  allowJs: false,
  noEmit: true,
  // Types must resolve, diagnostics need not be clean, and skipping lib checks keeps it in seconds
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  strict: true,
};

function adapterEntries(): string[] {
  return adapterNames()
    .map(name => path.join(REPO_ROOT, 'adapters', name, 'src', 'index.ts'))
    .filter(entry => fs.existsSync(entry));
}

type IViolation = {
  readonly file: string;
  readonly line: number;
  readonly text: string;
};

// A property access is a violation when the receiver is an `ISymbioteNode` and the property is
// an engine field, and the receiver is often a union, so its members are checked, not the union
function receiverIsEngineNode(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): boolean {
  const type = checker.getTypeAtLocation(expression);
  const parts = type.isUnion() ? type.types : [type];
  return parts.some(part => checker.typeToString(part) === 'ISymbioteNode');
}

function collectViolations(
  program: ts.Program,
  checker: ts.TypeChecker,
): IViolation[] {
  const found: IViolation[] = [];
  for (const source of program.getSourceFiles()) {
    const rel = path.relative(REPO_ROOT, source.fileName);
    if (!rel.startsWith('adapters' + path.sep)) continue;
    if (rel.includes('node_modules')) continue;
    // Tests may reach the engine's shape on purpose, e.g. asserting `node.props` after a commit
    if (/\.(test|spec|bench|probe)\.tsx?$/.test(rel)) continue;

    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        PRIVATE_FIELDS.has(node.name.text) &&
        receiverIsEngineNode(checker, node.expression)
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        found.push({ file: rel, line: line + 1, text: node.getText() });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe('adapters reach an engine node only through host-access', () => {
  const entries = adapterEntries();
  const program = ts.createProgram(entries, OPTIONS);
  const checker = program.getTypeChecker();

  it('resolves every adapter entry, so a silent empty run is impossible', () => {
    // Without it a moved barrel or a bad tsconfig gives an empty program, zero violations and a
    // green run that examined nothing (`.claude/rules/test-harness-false-greens.md`)
    expect(entries.length).toBe(adapterNames().length);
    const adapterSources = program
      .getSourceFiles()
      .filter(source =>
        path
          .relative(REPO_ROOT, source.fileName)
          .startsWith('adapters' + path.sep),
      );
    expect(adapterSources.length).toBeGreaterThan(100);
  });

  it('finds no field access on an ISymbioteNode', () => {
    const violations = collectViolations(program, checker);
    const report = violations
      .map(v => `  ${v.file}:${v.line}  ${v.text}`)
      .join('\n');
    expect(
      violations,
      violations.length === 0
        ? ''
        : `An adapter is reading the retained node's shape. Use the host-access API instead ` +
            `(parentOf / childrenOf / firstChildOf / nextSiblingOf / componentOf / ` +
            `isTextContainer / isRawTextNode / textOf / propOf):\n${report}`,
    ).toEqual([]);
  });

  it('would catch a field access, proven against a synthetic receiver', () => {
    // The break-test must be synthetic, as the real tree is clean and cannot show the rule fires
    // A green audit over a clean tree is also what a rule that matches nothing produces
    // An `.itest.` name, which the load-time scanner skips while the file exists
    const probe = path.join(
      REPO_ROOT,
      'adapters',
      '__host-access-probe__.itest.ts',
    );
    fs.writeFileSync(
      probe,
      `import type { ISymbioteNode } from '@symbiote-native/engine';\n` +
        `export function probe(node: ISymbioteNode): unknown {\n` +
        `  return node.parent;\n}\n`,
      'utf8',
    );
    try {
      const probeProgram = ts.createProgram([probe], OPTIONS);
      const violations = collectViolations(
        probeProgram,
        probeProgram.getTypeChecker(),
      );
      expect(violations.map(v => v.text)).toEqual(['node.parent']);
    } finally {
      fs.rmSync(probe, { force: true });
    }
  });
});
