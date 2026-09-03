// Vitest intentionally owns TypeScript/component tests, but a few production-critical tools are
// authored in native ESM/CommonJS and use node:test so they can execute without Vite transforms.
// Discover those suites instead of hardcoding today's filenames: adding a new *.test.mjs/cjs under
// scripts/ or packages/ automatically puts it under the root `pnpm test` and CI gate.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SEARCH_ROOTS = ['scripts', 'packages'];
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'build',
  'build-ngc',
  'dist',
  'e2e',
  'node_modules',
]);
const NODE_TEST_FILE = /\.test\.(?:cjs|mjs)$/;

function collectNodeTests(directory, repoRoot, found) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        collectNodeTests(absolute, repoRoot, found);
      }
      continue;
    }
    if (entry.isFile() && NODE_TEST_FILE.test(entry.name)) {
      found.push(path.relative(repoRoot, absolute));
    }
  }
}

export function discoverNodeTestFiles(repoRoot = REPO_ROOT) {
  const found = [];
  for (const searchRoot of SEARCH_ROOTS) {
    const absolute = path.join(repoRoot, searchRoot);
    if (fs.existsSync(absolute)) collectNodeTests(absolute, repoRoot, found);
  }
  return found.sort((a, b) => a.localeCompare(b));
}

export function runNodeTests({ repoRoot = REPO_ROOT, extraArgs = [] } = {}) {
  const files = discoverNodeTestFiles(repoRoot);
  if (files.length === 0) {
    throw new Error(
      `No Node test files found under ${SEARCH_ROOTS.join(', ')} in ${repoRoot}`,
    );
  }

  console.log(`Running ${files.length} Node test file(s):`);
  for (const file of files) console.log(`  ${file}`);

  const result = spawnSync(
    process.execPath,
    ['--test', ...extraArgs, ...files],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  );
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exitCode = runNodeTests({ extraArgs: process.argv.slice(2) });
}
