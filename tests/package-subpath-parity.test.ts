// A companion package is reachable from an adapter only through a per-framework subpath in its own
// package.json `exports`, and nothing enforced that the five agreed: on 2026-08-21 twelve of the
// twenty-five declared ./react ./vue ./svelte ./angular and no ./solid.
//
// No other guard sees this. adapter-barrel-parity.test.ts reads ADAPTER barrels, the tsc audit in
// .claude/rules/adapter-parity-audit.md resolves adapters/*/src/index.ts, and tsc never checks a
// subpath nobody imports — so it fails first in a consuming app, as ERR_PACKAGE_PATH_NOT_EXPORTED.
//
// Resolves each specifier rather than reading the `exports` keys: a key pointing at a deleted file
// passes a key check and fails a real build. Packages declaring no framework subpath at all
// (android, expo-modules-link) are native/build-only and out of the contract.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { adapterNames } from '../scripts/lib/adapter-names.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
// Read from disk — see scripts/lib/adapter-names.mjs.
const FRAMEWORKS = adapterNames();

const RESOLUTION_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  // The mode that honours `exports`, and what Metro and a consuming app's tsconfig use. Node10
  // would ignore the map entirely and report a false pass.
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  noEmit: true,
};

interface IPackage {
  readonly dir: string;
  readonly name: string;
  readonly declared: readonly string[];
}

function readCompanionPackages(): readonly IPackage[] {
  const found: IPackage[] = [];
  for (const dir of fs.readdirSync(PACKAGES_DIR).sort()) {
    const manifest = path.join(PACKAGES_DIR, dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (typeof pkg !== 'object' || pkg === null) continue;
    const record: Record<string, unknown> = { ...pkg };
    const name = record.name;
    const exportsMap = record.exports;
    if (typeof name !== 'string') continue;
    if (typeof exportsMap !== 'object' || exportsMap === null) continue;
    const declared = Object.keys(exportsMap).filter(key =>
      FRAMEWORKS.some(framework => key === `./${framework}`),
    );
    if (declared.length === 0) continue;
    found.push({ dir, name, declared });
  }
  return found;
}

const COMPANIONS = readCompanionPackages();

describe('companion package framework subpaths', () => {
  it('finds the companion packages to check', () => {
    // A rename of packages/ or a JSON shape change would otherwise empty COMPANIONS and turn
    // every it.each below into zero silently-passing cases.
    expect(COMPANIONS.length).toBeGreaterThan(20);
  });

  it.each(COMPANIONS.map(pkg => [pkg.name, pkg] as const))(
    '%s resolves from all five adapters',
    (_name, pkg) => {
      const host = ts.createCompilerHost(RESOLUTION_OPTIONS);
      // Where the workspace links put every @symbiote-native/* sibling.
      const importer = path.join(
        PACKAGES_DIR,
        pkg.dir,
        'node_modules',
        'importer',
        'index.ts',
      );
      const unresolved = FRAMEWORKS.filter(framework => {
        const resolved = ts.resolveModuleName(
          `${pkg.name}/${framework}`,
          importer,
          RESOLUTION_OPTIONS,
          host,
        );
        return resolved.resolvedModule === undefined;
      });
      expect(unresolved).toEqual([]);
    },
  );
});
