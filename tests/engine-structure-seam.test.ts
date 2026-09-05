// The engine reaches an ISymbioteNode's STRUCTURE only through `core/engine/src/tree.ts`.
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
// The census this replaced, run 2026-09-05 before the seam landed:
//
//   DESIRED    node.children / node.parent        57 sites across 7 files   -> now 14, all in tree.ts
//   COMMITTED  record.children / record.parent    11 sites across 2 files   -> unchanged, see below
//
// COMMITTED IS DELIBERATELY NOT GUARDED YET, and the reason recorded here first was WRONG — see
// `tree.ts`'s header. It is not replaced by RN's `NativeDOM`: that API reads the current revision
// only and `symbiote-fabric-cxx-surface` §6a states that marshalling children over JSI per commit
// is O(n) against O(1) for holding a handle, i.e. strictly worse than today. The route the skill
// chose (§7b, design 2) is our OWN native module's `pendingRoot_`, which is a different mechanism.
// It gets its own seam and its own guard when that cut happens; asserting it here now would be a
// rule nobody can satisfy, and one that hides which half is actually done.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(REPO_ROOT, 'core/engine/src/index.ts');
const SEAM = 'core/engine/src/tree.ts';
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

describe('the engine touches node structure only through tree.ts', () => {
  const program = ts.createProgram([ENTRY], OPTIONS);
  const checker = program.getTypeChecker();

  it('resolves the engine, so a silent empty run is impossible', () => {
    // A moved barrel or a bad tsconfig gives an empty program, zero violations and a green run that
    // examined nothing — the shape this repo has been bitten by often enough to write down
    // (`.claude/rules/test-harness-false-greens.md`). The seam's own sites are the sentinel: they
    // are the one thing that must ALWAYS be found.
    const sites = collect(program, checker);
    expect(sites.filter(site => site.file === SEAM).length).toBeGreaterThan(5);
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
            `parentOf / linkAppend / linkBefore / unlink / unlinkFromParent / replaceChildren ` +
            `instead — the whole point is that the desired tree can be replaced by the edit buffer ` +
            `in one file:\n${report}`,
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
