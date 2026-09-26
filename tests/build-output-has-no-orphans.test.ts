// No package's `build/` may hold a module its `src/` no longer has.
//
// `tsc --build` is incremental and DELETES NOTHING: an emitted `X.js` survives its source being
// renamed, deleted, or moved into a folder — and `scripts/clean-build-outputs.mjs` exists to sweep
// that, but only `pnpm run prepublish-build` calls it. A publish that skips it ships whatever the
// last several refactors left behind.
//
// The shadowing case is the one that bites, not the merely-dead one: a source moved from `X.ts`
// into `X/index.ts` leaves the old FLAT `X.js` emit beside it, and every resolver prefers `X.js`
// to `X/index.js` — invisible to a headless suite, which resolves `src`, never `build`.

// The other half this catches: a deleted source still published as an importable module.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

// `withFileTypes`, which is a race fix and not a tidy-up — the type comes from the SAME syscall that
// listed the entry, so a file that vanishes between the listing and the question cannot throw ENOENT
// here. The window is real in a full parallel run: the Svelte suites write a `.smoke-compiled-*.mjs`
// beside their own source and `rmSync` it in an `afterAll`, dozens of them by design. Presents as a
// guard that passes alone and fails in a full run, with no assertion in the message.
function walk(dir: string, found: string[] = []): string[] {
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) walk(full, found);
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
