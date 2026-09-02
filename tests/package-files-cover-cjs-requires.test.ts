// A loose `.cjs` shipped at a package root — a Babel preset, a Metro transformer — is reachable
// only if `files` lists it. Nothing else checks that: `exports` does not gate an INTERNAL relative
// require, tsc never reads a .cjs, and the file resolves perfectly in the monorepo, where the whole
// working tree is on disk. It fails only after `pnpm pack`, in a consuming app, as a
// MODULE_NOT_FOUND thrown from inside Babel before the first module is transformed.
//
// Measured 2026-08-23: adapters/solid/babel-preset.cjs gained `require('./babel-lower-host-
// primitives.cjs')` and `files` was not updated. Every test stayed green, the package packed
// without a warning, and the missing plugin surfaced as a device measurement that silently read as
// "the optimization does nothing" — the tarball simply had no plugin in it.
//
// Models `files` the way npm does for this one shape: an entry is either a filename or a directory
// prefix, and package.json / README / LICENSE ship unconditionally. Follows requires transitively,
// since a shipped entry may pull a second helper that pulls a third.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE_GROUPS = ['core', 'adapters', 'packages'] as const;
const RELATIVE_REQUIRE = /require\(\s*['"](\.[^'"]*)['"]\s*\)/g;

interface IPackage {
  readonly name: string;
  readonly dir: string;
  readonly files: readonly string[];
}

function readPublishablePackages(): readonly IPackage[] {
  const found: IPackage[] = [];
  for (const group of PACKAGE_GROUPS) {
    const groupDir = path.join(REPO_ROOT, group);
    if (!fs.existsSync(groupDir)) continue;
    for (const entry of fs.readdirSync(groupDir).sort()) {
      const dir = path.join(groupDir, entry);
      const manifestPath = path.join(dir, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest: unknown = JSON.parse(
        fs.readFileSync(manifestPath, 'utf8'),
      );
      if (typeof manifest !== 'object' || manifest === null) continue;
      const record: Record<string, unknown> = { ...manifest };
      if (record.private === true) continue;
      const name = record.name;
      const files = record.files;
      if (typeof name !== 'string' || !name.startsWith('@symbiote-native/'))
        continue;
      if (!Array.isArray(files)) continue;
      found.push({
        name,
        dir,
        files: files.filter(
          (value): value is string => typeof value === 'string',
        ),
      });
    }
  }
  return found;
}

// npm ships these regardless of `files`, so a require reaching one is not a packaging bug.
const ALWAYS_PACKED = new Set(['package.json', 'README.md', 'LICENSE']);

function isPacked(pkg: IPackage, relativePath: string): boolean {
  if (ALWAYS_PACKED.has(relativePath)) return true;
  return pkg.files.some(
    entry =>
      entry === relativePath ||
      relativePath.startsWith(`${entry.replace(/\/$/, '')}/`),
  );
}

// Only the loose root-level scripts: `build/**` is emitted wholesale and its internal graph is
// covered by the directory entry, so walking it would add minutes and find nothing.
function looseRootScripts(pkg: IPackage): readonly string[] {
  return pkg.files.filter(
    entry => /\.(cjs|mjs|js)$/.test(entry) && !entry.includes('/'),
  );
}

function collectMissingTargets(pkg: IPackage): readonly string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  const queue = [...looseRootScripts(pkg)];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    const absolute = path.join(pkg.dir, current);
    if (!fs.existsSync(absolute)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    for (const match of source.matchAll(RELATIVE_REQUIRE)) {
      const target = path
        .relative(pkg.dir, path.resolve(path.dirname(absolute), match[1]))
        .split(path.sep)
        .join('/');
      if (!isPacked(pkg, target)) missing.push(`${current} -> ${match[1]}`);
      else queue.push(target);
    }
  }
  return missing;
}

describe('a published package ships every file its own scripts require', () => {
  const packages = readPublishablePackages();

  it('finds the publishable packages', () => {
    expect(packages.length).toBeGreaterThan(10);
  });

  it.each(packages.map(pkg => [pkg.name, pkg] as const))('%s', (_name, pkg) => {
    expect(collectMissingTargets(pkg)).toEqual([]);
  });
});
