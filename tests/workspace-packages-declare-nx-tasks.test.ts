// A package without `test` and `lint` scripts is invisible to `nx affected`
// The test script runs from the repo root: many tests read files by root-relative path
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE_GROUPS = ['core', 'adapters', 'packages'] as const;

// Its tests run under `node:test`, which the root `test:node` already discovers
const KEEPS_OWN_TEST_SCRIPT = new Set(['packages/expo-modules-link']);

const LINT_SCRIPT =
  'eslint "**/*.{ts,tsx}" package.json --no-error-on-unmatched-pattern';

type IManifest = {
  readonly scripts?: Readonly<Record<string, string>>;
};

// Native code only, nothing for vitest or eslint to run
const HAS_NO_JS_SOURCES = new Set(['packages/android']);

function isJsPackage(dir: string): boolean {
  return (
    !HAS_NO_JS_SOURCES.has(dir) &&
    fs.existsSync(path.join(REPO_ROOT, dir, 'package.json'))
  );
}

function workspacePackageDirs(): string[] {
  return PACKAGE_GROUPS.flatMap(group => {
    const entries = fs.readdirSync(path.join(REPO_ROOT, group), {
      withFileTypes: true,
    });
    const dirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => `${group}/${entry.name}`);
    return dirs.filter(isJsPackage);
  });
}

function readScripts(dir: string): IManifest['scripts'] {
  const manifest: IManifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, dir, 'package.json'), 'utf8'),
  );
  return manifest.scripts;
}

describe('every workspace package declares the tasks nx affected runs', () => {
  const dirs = workspacePackageDirs();

  it('finds the packages it is meant to guard', () => {
    expect(dirs).toContain('core/engine');
    expect(dirs).toContain('adapters/svelte');
    expect(dirs).toContain('packages/slider');
  });

  it.each(dirs)('%s tests its own slice of the root vitest config', dir => {
    if (KEEPS_OWN_TEST_SCRIPT.has(dir)) return;

    expect(readScripts(dir)?.test).toBe(
      `pnpm -C ../.. exec vitest run ${dir}/ --passWithNoTests`,
    );
  });

  it.each(dirs)('%s lints its own files with the root eslint config', dir => {
    expect(readScripts(dir)?.lint).toBe(LINT_SCRIPT);
  });
});
