// A native path that publishes a shadow tree must arrive WITH the test that compares it to the JS
// one. Not "then we verify it", not "the canary will show it".
//
// ── WHAT THIS GUARD WAS, AND WHY IT IS NOT THAT ANY MORE ─────────────────────────────────────────
//
// It was written for design B of item 8c-1: hand native the child-edit log and let it derive the
// tree, which would have made `replayChildOps` and a C++ twin two spellings of ONE fold. Forbidding
// that pair was right for that design.
//
// Design A was chosen instead (2026-09-07), on one fact: nothing in the engine ever looks INSIDE an
// `IFabricNode` — every use in `commit.ts` is store-it-and-pass-it-back. So the native path can be a
// second `IFabricSlot` implementation that BUFFERS instead of calling, returns integer handles and
// flushes once at `completeRoot`. Not a line of engine logic moves, `replayChildOps` keeps computing
// child lists that native never computes, and the ~5 600 headless tests keep their meaning because
// the slot is still a slot.
//
// **So the pair this file forbade is no longer a pair, and keeping the old assertion would have
// blocked the correct design with a red that means nothing.** That is the failure mode the file's own
// history now demonstrates twice in one day: its first marker (`registerCommitHook`) named a
// MECHANISM the chosen design does not use, and its subject named a FORK the chosen design does not
// create. A guard keyed on how something is built expires when the build changes; only a guard keyed
// on what must remain TRUE survives.
//
// ── AND THE SUBJECT EXPIRED A THIRD TIME (2026-09-08), EXACTLY AS THE PARAGRAPH ABOVE PREDICTS ────
//
// Design A's risk was two `IFabricSlot` implementations — the direct facade and the batching one —
// producing different effects on Fabric. Both are gone: `batching-slot.ts` and the C++ applier were
// deleted, because there are no per-call JSI crossings left to batch once the tree lives in C++ and
// the whole commit crosses as one buffer. So `slot-differential.test.ts`, which this file used to
// demand, no longer has a subject either.
//
// The risk did not go away, it MOVED UP A LAYER, and it is the same shape: **two TREE HOSTS over one
// buffer.** `core/test-utils/src/tree-applier.ts` is the TypeScript reference and
// `core/engine/cpp/SymbioteTree.cpp` is the device one, they are written to be read side by side,
// and a divergence between them is invisible here and fatal there. What keeps them honest is the
// reference applier's own differential — a property test running programs against independent
// oracles — so that is what a native publish now owes.
//
// Three expiries in this one file, and the lesson is the one it already states about itself: a guard
// keyed on HOW something is built expires when the build changes. What survived all three is the
// obligation — native code that publishes a tree arrives with the comparison that can catch it —
// so keep re-aiming that, and never soften it into "the canary will show it".
//
// ── The distinction it deliberately does NOT police: the node table's STORE. `node-table.ts` is
// byte-identical whether its `Int32Array` comes from `new Int32Array(n)` or from native memory — one
// implementation, two allocators, nothing to drift. That one may stand indefinitely.
// `native-engine.ts`'s header carries the full statement.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolved from this file, never from the CWD: a relative path in a test resolves against wherever
// the runner was started, which is the defect `test-harness-false-greens.md` §15 records.
const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));
const ENGINE_ROOT = join(SRC_DIR, '..');

// What makes native code an APPLIER rather than a store: it writes the shadow tree.
//
// This started as `registerCommitHook` alone, on the reasoning that a commit hook is the only seam
// through which our op log could reach the tree. **That was wrong and would have made this guard
// silently useless** — read from `UIManager.h` 2026-09-07, `createNode` / `cloneNode` /
// `appendChild` / `completeSurface` are all PUBLIC, and `completeSurface` runs the retried
// transaction itself with a lambda that ignores the old root. So the applier the project is actually
// going to write never registers a hook at all, and a single-marker guard would have sat green while
// a native applier landed beside the JS one — exactly the failure this file exists to prevent, with
// the header still reading as coverage.
//
// `completeSurface` is the marker that cannot be avoided: it is what PUBLISHES a tree, nothing else
// does, and native code that never publishes is not an applier. `registerCommitHook` stays because
// the other design branch is still reachable and one of the two will always be present.
//
// The general shape, since this repo keeps meeting it: a marker naming one MECHANISM is a proxy for
// the CAPABILITY it was chosen to detect, and it rots the moment a second mechanism gives the same
// capability. Prefer the call that is definitional — here, the publish.
const NATIVE_APPLIER_MARKERS: readonly string[] = [
  'registerCommitHook',
  'completeSurface',
];

// The differential the native publish owes: the reference tree applier's property test, which runs
// generated programs against oracles independent of the applier itself. It lives in another package
// because a JS tree may not ship inside the engine (`tree-applier.ts`'s header), so the path is
// relative to the engine rather than to this directory.
const TREE_DIFFERENTIAL = '../test-utils/src/tree-applier.fuzz.test.ts';

function filesUnder(
  directory: string,
  extensions: readonly string[],
): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    // The directory does not exist yet, which is the state before Android's shim lands.
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path, extensions));
      continue;
    }
    if (extensions.some(extension => entry.endsWith(extension)))
      found.push(path);
  }
  return found;
}

// A mention is not a call, and this file's own header is the proof: the first run of this guard went
// red against `SymbioteEngineBindings.h`, which explains the commit-hook seam in prose. A survey over
// source text either strips comments or resolves every hit to a line that runs
// (`verify-the-deciding-side.md`), and stripping is the cheaper of the two here.
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
  // The anti-degeneracy arm. Without it the file is satisfiable by the scan finding nothing for a
  // reason that has nothing to do with the subject — a moved directory, a renamed extension, a typo
  // in a root. It asserts the scanner can still SEE our native sources at all, which is the one fact
  // every other assertion here rests on.
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
