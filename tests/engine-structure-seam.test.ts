// The engine reaches an ISymbioteNode's STRUCTURE only through `core/engine/src/host-access.ts`.
//
// That seam exists so the desired tree can be replaced by the edit buffer in ONE file rather than
// across the engine (`symbiote-fabric-cxx-surface` §9). It is worth a test rather than a convention
// because a leak is completely silent: `node.parent` compiles, works, and passes every suite — it
// just quietly puts the swap back out of reach, one line at a time.
//
// TYPE-AWARE, not textual, and the difference is not stylistic. `.parent` is also a field on the
// animated graph's nodes and on an event, `.children` is a field on `SymbioteSurface` and on the
// fake Fabric's node — and most textual hits in this tree are comments. A raw grep over
// `core/engine/src` reports 93 matches where the real number is 25, so a grep-based guard would
// either be permanently red or tuned until it caught nothing.
//
// The census that motivated it, and where it ended up:
//
//   2026-09-05   node.children / node.parent   57 sites across 7 files
//   2026-09-08   ZERO — the tree left JS entirely, and the two fields left `ISymbioteNode` with it
//
// So the count this guards is now nil rather than small, and the guard is one layer of two: a leak
// is also a type error today. The layers fail differently, which is why both are worth having — a
// widened interface satisfies `tsc` and reads as an ordinary field addition, and this is what asks
// whether anything is reading a node's shape at all.
//
// THE SENTINEL IS NOT KEYED ON THE COUNT, and that survived the change that made the count zero. It
// used to require the seam to hold at least four field accesses; a correct deletion then turned it
// red. **A false-green sentinel must not be keyed on the thing being deleted.** It asks whether the
// PROGRAM resolved instead — the real question ("did this examine anything?"), which no legitimate
// deletion can move. Had it stayed keyed on the count, today's tree would have failed it.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(REPO_ROOT, 'core/engine/src/index.ts');
// `tree.ts` until the tree left JS entirely. The seam is now the read half of the HOST boundary —
// `parentOf` / `childrenOf` / `firstChildOf` / `nextSiblingOf`, each of which flushes the pending ops
// and asks whoever holds the tree. The rule below did not change; what changed is that it is now
// enforced by the type system as well, since `ISymbioteNode` carries no `children` or `parent` at
// all. This stays because the type is not the whole guard: a leak can be reintroduced by widening
// the interface, and that reads as an ordinary field addition.
const SEAM = 'core/engine/src/host-access.ts';
const STRUCTURE_FIELDS = new Set(['children', 'parent']);

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: false,
  noEmit: true,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  strict: true,
};

interface ISite {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function collect(program: ts.Program, checker: ts.TypeChecker): ISite[] {
  const found: ISite[] = [];
  for (const source of program.getSourceFiles()) {
    const rel = path.relative(REPO_ROOT, source.fileName);
    if (!rel.startsWith(path.join('core', 'engine', 'src'))) continue;
    // Tests reach into the shape on purpose — several assert on a committed child list to prove a
    // commit did what it should. They are not the contract this guards.
    if (rel.includes('__tests__') || /\.(test|bench|probe)\.tsx?$/.test(rel)) {
      continue;
    }

    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        STRUCTURE_FIELDS.has(node.name.text)
      ) {
        // The RECEIVER's resolved type is what decides, never the property name. A union is
        // normal here (`ISymbioteNode | undefined` off an optional parent), and its members are
        // what matter rather than the union itself.
        const type = checker.getTypeAtLocation(node.expression);
        const parts = type.isUnion() ? type.types : [type];
        if (
          parts.some(part => checker.typeToString(part) === 'ISymbioteNode')
        ) {
          const { line } = source.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          found.push({ file: rel, line: line + 1, text: node.getText() });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe('the engine touches node structure only through host-access.ts', () => {
  const program = ts.createProgram([ENTRY], OPTIONS);
  const checker = program.getTypeChecker();

  it('resolves the engine, so a silent empty run is impossible', () => {
    // A moved barrel or a bad tsconfig gives an empty program, zero violations and a green run that
    // examined nothing — the shape this repo has been bitten by often enough to write down
    // (`.claude/rules/test-harness-false-greens.md`).
    //
    // Asks about the PROGRAM, not about the violations. It used to require the seam to hold at least
    // four field accesses, which is the count the roadmap is deleting — see the header. The floor of
    // 60 is deliberately well under the ~110 engine sources: measured 2026-09-07, the real barrel
    // resolves 103 and a moved one resolves 0, so anything in between is a broken tsconfig.
    const engineFiles = program
      .getSourceFiles()
      .map(source => path.relative(REPO_ROOT, source.fileName))
      .filter(rel => rel.startsWith(path.join('core', 'engine', 'src')));
    expect(engineFiles).toContain(SEAM);
    expect(engineFiles.length).toBeGreaterThan(60);
  });

  it('finds no structural field access outside the seam', () => {
    const leaks = collect(program, checker).filter(site => site.file !== SEAM);
    const report = leaks
      .map(leak => `  ${leak.file}:${leak.line}  ${leak.text}`)
      .join('\n');
    expect(
      leaks,
      leaks.length === 0
        ? ''
        : `The engine is reading an ISymbioteNode's structure outside ${SEAM}. Use childrenOf / ` +
            `parentOf / linkAppend / linkBefore / unlink / unlinkFromParent instead — the whole ` +
            `point is that the desired tree can be answered by the record, the op log and the ` +
            `back-edge map in one file:\n${report}`,
    ).toEqual([]);
  });

  it('would catch a leak, proven against a synthetic one', () => {
    // The break-test, and it has to be synthetic: the tree is clean, so nothing in it can show the
    // rule fires. A green audit over a clean tree is the same observation a rule matching NOTHING
    // produces, and only this separates them.
    const probe = path.join(REPO_ROOT, 'core/engine/src/__seam-probe__.ts');
    fs.writeFileSync(
      probe,
      `import type { ISymbioteNode } from './node';\n` +
        `export function probe(node: ISymbioteNode): unknown {\n` +
        `  return node.children;\n}\n`,
      'utf8',
    );
    try {
      const probeProgram = ts.createProgram([probe], OPTIONS);
      const leaks = collect(probeProgram, probeProgram.getTypeChecker()).filter(
        site => site.file !== SEAM,
      );
      expect(leaks.map(leak => leak.text)).toEqual(['node.children']);
    } finally {
      fs.rmSync(probe, { force: true });
    }
  });
});
