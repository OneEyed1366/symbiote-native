// A native path that publishes a shadow tree must arrive WITH the test that compares it to the
// reference one — not "then we verify it", not "the canary will show it".

// The risk: two TREE HOSTS over one buffer. core/test-utils/src/tree-applier.ts is the reference,
// SymbioteTree.cpp is the device one — a divergence is invisible here, fatal there. The reference
// applier's own property-test differential is what a native publish owes.

// Deliberately NOT policed: the node table's STORE. node-table.ts is byte-identical whether its
// Int32Array comes from `new Int32Array(n)` or native memory — one implementation, two allocators,
// nothing to drift. See native-engine.ts's header for the full statement.

import { type Dirent, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolved from this file, never from the CWD: a relative path in a test resolves against wherever
// the runner was started, which is the defect `test-harness-false-greens.md` §15 records.
const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));
const ENGINE_ROOT = join(SRC_DIR, '..');

// What makes native code an APPLIER rather than a store: it writes the shadow tree.

// `completeSurface` is the marker that can't be avoided: it's what PUBLISHES a tree, and native
// code that never publishes isn't an applier. `registerCommitHook` alone would miss an applier
// that reaches the tree through UIManager.h's other public calls instead.

// The general shape: a marker naming one MECHANISM is a proxy for the CAPABILITY it detects, and
// rots the moment a second mechanism gives the same capability — prefer the definitional call.
const NATIVE_APPLIER_MARKERS: readonly string[] = [
  'registerCommitHook',
  'completeSurface',
];

// The differential the native publish owes: the reference tree applier's property test, running
// generated programs against independent oracles. Path relative to the engine, not this directory
// — a JS tree may not ship inside the engine (see tree-applier.ts's header).
const TREE_DIFFERENTIAL = '../test-utils/src/tree-applier.fuzz.test.ts';

function filesUnder(
  directory: string,
  extensions: readonly string[],
): string[] {
  // `withFileTypes` gets the type in the SAME syscall that lists the entry, so a file vanishing
  // mid-walk (Svelte's `.smoke-compiled-*.mjs`, rmSync'd in an afterAll) can't throw ENOENT here.
  // The catch below is only for a directory that doesn't exist at all.
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    // The directory does not exist yet, which is the state before Android's shim lands.
    return [];
  }
  const found: string[] = [];
  for (const dirent of entries) {
    const entry = dirent.name;
    const path = join(directory, entry);
    if (dirent.isDirectory()) {
      found.push(...filesUnder(path, extensions));
      continue;
    }
    if (extensions.some(extension => entry.endsWith(extension)))
      found.push(path);
  }
  return found;
}

// A mention is not a call: a survey over source text either strips comments or resolves every hit
// to a line that runs, and stripping is the cheaper of the two here.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function nativeApplierFiles(): string[] {
  // Every directory our own native code can live in — derived by listing, so Android's `android/`
  // joins the audit the day the folder exists rather than the day someone remembers it. That is the
  // `adapterNames()` repair applied one level down.
  const nativeRoots = ['cpp', 'ios', 'android'].map(name =>
    join(ENGINE_ROOT, name),
  );
  return nativeRoots
    .flatMap(root =>
      filesUnder(root, ['.cpp', '.h', '.mm', '.m', '.java', '.kt']),
    )
    .filter(path => {
      const source = withoutComments(readFileSync(path, 'utf8'));
      return NATIVE_APPLIER_MARKERS.some(marker => source.includes(marker));
    });
}

function differentialExists(): boolean {
  try {
    return statSync(join(ENGINE_ROOT, TREE_DIFFERENTIAL)).isFile();
  } catch {
    return false;
  }
}

describe('a native publish arrives with its differential', () => {
  // The anti-degeneracy arm: without it the file is satisfiable by the scan finding nothing for an
  // unrelated reason (a moved directory, a renamed extension). Asserts the scanner can still SEE
  // our native sources at all — the one fact every other assertion here rests on.
  it('can still see our own native sources', () => {
    const nativeRoots = ['cpp', 'ios', 'android'].map(name =>
      join(ENGINE_ROOT, name),
    );
    const all = nativeRoots.flatMap(root =>
      filesUnder(root, ['.cpp', '.h', '.mm', '.m', '.java', '.kt']),
    );
    expect(
      all.length,
      'The native scan found no files at all, so every other assertion in this file is vacuous. ' +
        'Either the roots moved or an extension is missing from the list.',
    ).toBeGreaterThan(0);
  });

  // The whole point, and it is LIVE now rather than trivially green: `SymbioteTree.cpp` publishes.
  it('never publishes a tree from native without the reference differential', () => {
    const native = nativeApplierFiles();
    if (native.length === 0) return;

    expect(
      differentialExists(),
      `Native code publishes a shadow tree (${native.join(', ')}) and ` +
        `core/engine/${TREE_DIFFERENTIAL} does not exist. Two tree hosts consume one buffer — ` +
        'the TypeScript reference and the C++ one — and a divergence between them is a ' +
        'device-only bug: the same ops, a different tree, nothing red. The property test is what ' +
        'holds the reference to independent oracles, which is what makes the C++ checkable ' +
        'against something at all. See this file’s header, and native-engine.ts for why the ' +
        'node-table STORE is a different question.',
    ).toBe(true);
  });
});
