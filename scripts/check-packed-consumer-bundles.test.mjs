import assert from 'node:assert/strict';
import test from 'node:test';

import {
  npmCacheDirFor,
  validateCatalystSelection,
} from './check-packed-consumer-bundles.mjs';

test('Catalyst cannot silently verify another arm or a non-native host', () => {
  assert.doesNotThrow(() =>
    validateCatalystSelection(['svelte'], ['ios'], 'darwin'),
  );
  assert.throws(
    () => validateCatalystSelection(['svelte'], ['ios'], 'linux'),
    /macOS/,
  );
  assert.throws(
    () => validateCatalystSelection(['react'], ['ios'], 'darwin'),
    /exactly/,
  );
  assert.throws(
    () => validateCatalystSelection(['svelte', 'react'], ['ios'], 'darwin'),
    /exactly/,
  );
  assert.throws(
    () => validateCatalystSelection(['svelte'], ['ios', 'android'], 'darwin'),
    /exactly/,
  );
});

test('falls back to a disposable per-example dir when no cache root is given', () => {
  assert.equal(
    npmCacheDirFor('/tmp/matrix/react', 'react', undefined),
    '/tmp/matrix/react/.npm-cache',
  );
});

test('uses a stable per-framework dir under the given cache root', () => {
  assert.equal(
    npmCacheDirFor('/tmp/matrix/react', 'react', '/ci-cache/npm-consumers'),
    '/ci-cache/npm-consumers/react',
  );
});

test('two frameworks never share a directory under the same cache root', () => {
  const cacheRoot = '/ci-cache/npm-consumers';
  assert.notEqual(
    npmCacheDirFor('/tmp/matrix/vue', 'vue', cacheRoot),
    npmCacheDirFor('/tmp/matrix/svelte', 'svelte', cacheRoot),
  );
});
