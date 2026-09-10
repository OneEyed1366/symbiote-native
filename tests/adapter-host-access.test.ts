// An adapter must reach an engine node only through the host-access API, never through its fields.
//
// The narrowing landed on 2026-09-05 — every renderer seam and four non-seam files moved from
// `node.parent` / `node.children` / `node.component` onto parentOf / childrenOf / componentOf and
// friends — and nothing held it. A single `node.parent` in the next PR puts an adapter back on the
// tree's SHAPE, which is what makes the representation impossible to change: the whole point of
// `symbiote-fabric-cxx-surface` §9 is that the retained node can become an address, or move onto
// the framework's own object, without any adapter noticing.
//
// TYPE-AWARE, not textual, and that is the difference between this and a grep. The survey that
// started the narrowing counted `.props` and `.children` across whole adapters and reported 275-453
// hits per adapter; almost all of them were the FRAMEWORK's props and children — Vue's VNode,
// Solid's component props, Angular's signals, Svelte's own ShimNode fields. Scoped by resolved TYPE
// the real number was 8-13 per seam. A regex cannot tell those apart, and an allowlist of receiver
// names would be the same guess with more steps.
//
// It also cannot report a false positive for the legitimate look-alikes, without listing them:
// `SymbioteSurface.children` resolves to SymbioteSurface, `ShimNode.children` to ShimNode, and a
// Descriptor's `component` to the components package's own type. None of them is ISymbioteNode, so
// none of them is reachable by this rule.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { adapterNames } from '../scripts/lib/adapter-names.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');

// The engine's own private surface. Each is reachable through host-access.ts instead:
// parentOf / childrenOf / firstChildOf / nextSiblingOf / componentOf / isTextContainer /
// isRawTextNode / textOf / propOf, plus committedOf for the commit record.
const PRIVATE_FIELDS = new Set([
  'children',
  'parent',
  'props',
  'component',
  'isText',
  'listeners',
  'committed',
]);
// `dirty` / `propsDirty` / `structureDirty` used to be listed here. They are no longer FIELDS —
// the commit's three questions live in `core/engine/src/edit-buffer.ts` — so an adapter naming one
// is a tsc error rather than a violation this audit could report. Do not re-add them: a name in
// this set that no type carries is a rule that can never fire, which reads as coverage.

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
  allowJs: false,
  noEmit: true,
  // The audit needs types resolved, not diagnostics clean — skipping lib checking keeps a run
  // measured in seconds rather than minutes without changing a single answer.
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  strict: true,
};

function adapterEntries(): string[] {
  return adapterNames()
    .map(name => path.join(REPO_ROOT, 'adapters', name, 'src', 'index.ts'))
    .filter(entry => fs.existsSync(entry));
}

interface IViolation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

// A property access is a violation when the RECEIVER's type is ISymbioteNode and the property is
// one of the engine's own fields. `typeToString` rather than a symbol identity comparison because
// the receiver is routinely a union (`ISymbioteNode | undefined` off a shim, `ISymbioteNode |
// SymbioteSurface` in a seam) and the union's members are what matter, not the union itself.
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
    // Tests may reach into the engine's shape deliberately — several assert on `node.props` to
    // prove a commit wrote what it should. They are not the contract this guards.
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
    // Without this, a moved barrel or a bad tsconfig would give an empty program, zero violations
    // and a green run that examined nothing — the shape this repo has been bitten by often enough
    // to write down (.claude/rules/test-harness-false-greens.md).
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
    // The break-test, and it has to be synthetic: the real tree is clean, so nothing in it can
    // demonstrate the rule fires. A green audit over a clean tree is exactly the result a rule that
    // matches NOTHING also produces, and the two are indistinguishable without this.
    const probe = path.join(REPO_ROOT, 'adapters', '__host-access-probe__.ts');
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
