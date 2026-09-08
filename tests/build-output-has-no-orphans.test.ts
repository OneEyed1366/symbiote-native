// No package's `build/` may hold a module its `src/` no longer has.
//
// `tsc --build` is incremental and DELETES NOTHING: an emitted `X.js` survives its source being
// renamed, deleted, or moved into a folder — and `scripts/clean-build-outputs.mjs` exists to sweep
// that, but only `pnpm run prepublish-build` calls it. A publish that skips it ships whatever the
// last several refactors left behind.
//
// Device-found 2026-09-08, and the shadowing case is the one that bites rather than the merely-dead
// one. `behaviors/scroll-view.ts` became `behaviors/scroll-view/`; the old FLAT emit stayed beside
// the new directory, and every resolver prefers `X.js` to `X/index.js` — so the package shipped the
// pre-move file. It still registered the ScrollView host behavior under the tag name of the era it
// was compiled in (`symbiote-scroll-view`), which nothing emits any more. `<scroll-view>` therefore
// got NO behavior at all: no content node, `contentContainerStyle` with nowhere to be redirected,
// and the app's children committed straight into `RCTScrollView` — a canary with no padding, no gap
// and overlapping subtrees. Every headless suite was green throughout, because vitest resolves
// `src` and never reads `build`.
//
// The three orphans this first caught also show the quiet half: `state-style` and React's `jsx`,
// both deleted the same day, were still being published as importable modules.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adapterNames } from '../scripts/lib/adapter-names.mjs';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.svelte'] as const;

function packageRoots(): readonly string[] {
  const cores = readdirSync('core').map(name => join('core', name));
  const adapters = adapterNames().map(name => join('adapters', name));
  const companions = readdirSync('packages').map(name =>
    join('packages', name),
  );
  return [...cores, ...adapters, ...companions].filter(root =>
    existsSync(join(root, 'src')),
  );
}

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

// Where a package's emits start — PLURAL, and that is the whole subtlety. `adapters/angular`
// compiles its sources TWICE into one directory: `tsconfig.json` emits `build/**` and
// `tsconfig.angular.json` (ngc) emits `build/angular/**`. Read against a single root, every file
// of the second build reports as an orphan of the first.
//
// Derived from the tsconfigs rather than from the shape of what is on disk: an earlier version
// guessed the root by looking for a lone top-level directory, which was right until `tsc --build`
// put both emits there at once and then called sixty real files orphans.
function emitRootsOf(root: string): readonly string[] {
  const roots = new Set<string>();
  for (const name of readdirSync(root)) {
    if (!name.startsWith('tsconfig') || !name.endsWith('.json')) continue;
    const outDir = readOutDir(join(root, name));
    if (outDir !== undefined) roots.add(join(root, outDir));
  }
  roots.add(join(root, 'build'));
  // Longest first, so a file under `build/angular/` is measured against that emit and not against
  // the shallower one it also sits inside.
  return [...roots].sort((a, b) => b.length - a.length);
}

// Deliberately a regex rather than a JSON parse: these tsconfigs carry comments, and the value is
// a plain string literal in every one of them.
function readOutDir(file: string): string | undefined {
  const match = /"outDir"\s*:\s*"([^"]+)"/.exec(readFileSync(file, 'utf8'));
  return match?.[1];
}

// A build tree only exists after a build, so the suite must be able to say "nothing to check" —
// and must NOT read that as agreement. The count assertion below is what separates the two.
function orphansOf(root: string): readonly string[] {
  if (!existsSync(join(root, 'build'))) return [];
  const emitRoots = emitRootsOf(root);
  const orphans: string[] = [];
  for (const file of walk(join(root, 'build'))) {
    if (!file.endsWith('.js')) continue;
    const emitRoot = emitRoots.find(
      candidate => !relative(candidate, file).startsWith('..'),
    );
    if (emitRoot === undefined) continue;
    const stem = relative(emitRoot, file).replace(/\.js$/, '');
    const hasSourceFile = SOURCE_EXTENSIONS.some(extension =>
      existsSync(join(root, 'src', `${stem}${extension}`)),
    );
    if (hasSourceFile) continue;
    // A directory of the same name is the SHADOWING case: the flat emit wins resolution over the
    // folder that replaced it, so this is worse than a merely-dead file, not better.
    const shadowsDirectory = existsSync(join(root, 'src', stem));
    orphans.push(shadowsDirectory ? `${stem} (shadows src/${stem}/)` : stem);
  }
  return orphans;
}

describe('a built module always has a source twin', () => {
  const roots = packageRoots();

  it.each(roots)('%s/build has no orphans', root => {
    expect(
      orphansOf(root),
      'run `pnpm run prepublish-build` (it cleans first) rather than rebuilding in place',
    ).toEqual([]);
  });

  // The control. Every assertion above is "a list is empty", which an empty package list or a
  // repo with no build trees at all would satisfy for the wrong reason.
  it('reads a real package list', () => {
    expect(roots.length).toBeGreaterThan(10);
    expect(roots).toContain('core/components');
    expect(roots).toContain('core/engine');
  });
});
