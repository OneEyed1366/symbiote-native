import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { discoverNodeTestFiles, REPO_ROOT } from './run-node-tests.mjs';

function write(root, relativePath) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '// fixture\n');
}

test('discovers native Node suites in scripts/packages, sorted, excluding generated trees', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-node-tests-'));
  try {
    write(root, 'scripts/z-last.test.mjs');
    write(root, 'scripts/not-a-test.mjs');
    write(root, 'packages/demo/src/a-first.test.cjs');
    write(root, 'packages/demo/build/ignored.test.mjs');
    write(root, 'packages/demo/build-ngc/ignored.test.cjs');
    write(root, 'packages/demo/node_modules/dependency.test.mjs');
    write(root, 'packages/demo/e2e/device.test.cjs');

    assert.deepEqual(discoverNodeTestFiles(root), [
      path.join('packages', 'demo', 'src', 'a-first.test.cjs'),
      path.join('scripts', 'z-last.test.mjs'),
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the real repository discovery includes every release-critical Node suite', () => {
  const found = discoverNodeTestFiles(REPO_ROOT);
  assert.ok(
    found.includes(path.join('scripts', 'fix-esm-extensions.test.mjs')),
  );
  assert.ok(found.includes(path.join('scripts', 'run-node-tests.test.mjs')));
  assert.ok(
    found.includes(
      path.join('packages', 'expo-modules-link', 'src', 'index.test.cjs'),
    ),
  );
  assert.ok(found.length >= 3);
});
