import { describe, expect, it, vi } from 'vitest';

import { FAKE_EXPO_SQLITE } from './native-fakes';

// Ported from expo-sqlite's pathUtils-test.ios.ts (.vendors/expo @ origin/sdk-57). Pure string
// logic — the only native dependency is defaultDatabaseDirectory, faked the same way
// sqlite-database.test.ts fakes it.
vi.mock('./native-module', () => ({ expoSQLite: FAKE_EXPO_SQLITE }));

const { basename, createDatabasePath } = await import('./path-utils');

describe('createDatabasePath', () => {
  it('returns :memory: without any changes', () => {
    expect(createDatabasePath(':memory:', undefined)).toBe(':memory:');
  });

  it('accepts an undefined directory', () => {
    expect(createDatabasePath('test.db', undefined)).toBe(
      `${FAKE_EXPO_SQLITE.defaultDatabaseDirectory}/test.db`,
    );
  });

  it('returns the correct path when a directory is provided', () => {
    expect(createDatabasePath('test.db', '/testDir/')).toBe('/testDir/test.db');
  });

  it('removes excessive slashes', () => {
    expect(createDatabasePath('/test.db', '/testDir//')).toBe(
      '/testDir/test.db',
    );
  });
});

describe('basename', () => {
  it('returns the basename of a path', () => {
    expect(basename('/test/test.db')).toBe('test.db');
  });

  it('returns the entire string if no slash is present', () => {
    expect(basename('test.db')).toBe('test.db');
  });

  it('returns an empty string for an empty path', () => {
    expect(basename('')).toBe('');
  });

  it('handles paths ending with a slash', () => {
    expect(basename('/test/')).toBe('');
    expect(basename('/')).toBe('');
    expect(basename('////')).toBe('');
  });

  it('handles nested directories', () => {
    expect(basename('/foo/bar/baz.db')).toBe('baz.db');
    expect(basename('foo/bar/baz.db')).toBe('baz.db');
    expect(basename('foo/bar/')).toBe('');
  });
});
