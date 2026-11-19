// The change detection behind an incremental `registry:sync`
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  declaredAmong,
  isUnchanged,
  isUntouched,
  movedSince,
  newestMtimeMs,
  readStamps,
  withDependents,
  writeStamps,
} from '../scripts/lib/registry-stamps.mjs';

const STAMP = { version: '1.0.0', integrity: 'sha512-a' };

describe('isUnchanged', () => {
  it('holds only when version and integrity match and the registry has it', () => {
    expect(isUnchanged(STAMP, STAMP, true)).toBe(true);
  });

  it('is a change for a package never stamped', () => {
    expect(isUnchanged(undefined, STAMP, true)).toBe(false);
  });

  it('is a change when the bytes differ under the same version', () => {
    expect(isUnchanged(STAMP, { ...STAMP, integrity: 'sha512-b' }, true)).toBe(
      false,
    );
  });

  it('is a change when the version moved', () => {
    expect(isUnchanged(STAMP, { ...STAMP, version: '1.0.1' }, true)).toBe(
      false,
    );
  });

  it('is a change when the registry lost the version', () => {
    expect(isUnchanged(STAMP, STAMP, false)).toBe(false);
  });
});

describe('isUntouched', () => {
  const stamped = { ...STAMP, at: 1_000 };

  it('holds when nothing was written after the stamp', () => {
    expect(isUntouched(stamped, '1.0.0', 1_000)).toBe(true);
  });

  it('fails when a file is newer than the stamp', () => {
    expect(isUntouched(stamped, '1.0.0', 1_001)).toBe(false);
  });

  it('fails for the wrong version, no stamp, or a stamp with no time', () => {
    expect(isUntouched(stamped, '1.0.1', 0)).toBe(false);
    expect(isUntouched(undefined, '1.0.0', 0)).toBe(false);
    expect(isUntouched(STAMP, '1.0.0', 0)).toBe(false);
  });
});

describe('newestMtimeMs', () => {
  it('reads the newest file below the folder and skips node_modules', () => {
    const root = mkdtempSync(join(tmpdir(), 'registry-mtime-'));
    mkdirSync(join(root, 'build'));
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'build', 'a.js'), '');
    writeFileSync(join(root, 'node_modules', 'b.js'), '');
    utimesSync(join(root, 'build', 'a.js'), 100, 100);
    utimesSync(join(root, 'node_modules', 'b.js'), 900, 900);

    expect(newestMtimeMs(root)).toBe(100_000);
    rmSync(root, { recursive: true });
  });
});

describe('withDependents', () => {
  const dependencies = {
    engine: [],
    components: ['engine'],
    svelte: ['components'],
    slider: ['engine', 'svelte'],
    standalone: [],
  };

  it('adds the packages that depend on a changed one, through any number of hops', () => {
    expect(withDependents(['engine'], dependencies).sort()).toEqual([
      'components',
      'engine',
      'slider',
      'svelte',
    ]);
  });

  it('leaves out a package nothing depends on, and keeps a leaf alone', () => {
    expect(withDependents(['standalone'], dependencies)).toEqual([
      'standalone',
    ]);
    expect(withDependents([], dependencies)).toEqual([]);
  });
});

describe('movedSince', () => {
  const stamps = {
    '@symbiote-native/engine': STAMP,
    '@symbiote-native/vue': { version: '2.0.0', integrity: 'sha512-v' },
  };

  it('is empty when the example installed the stamped bytes', () => {
    const installed = {
      '@symbiote-native/engine': 'sha512-a',
      '@symbiote-native/vue': 'sha512-v',
    };

    expect(movedSince(stamps, installed)).toEqual([]);
  });

  it('lists a package whose installed bytes differ or were never recorded', () => {
    const installed = { '@symbiote-native/engine': 'sha512-old' };

    expect(movedSince(stamps, installed)).toEqual([
      { name: '@symbiote-native/engine', version: '1.0.0' },
      { name: '@symbiote-native/vue', version: '2.0.0' },
    ]);
  });
});

describe('declaredAmong', () => {
  it('keeps the changed packages the example declares in either dependency list', () => {
    const manifest = {
      dependencies: { '@symbiote-native/engine': 'latest' },
      devDependencies: { '@symbiote-native/css-parser': 'latest' },
    };

    expect(
      declaredAmong(manifest, [
        '@symbiote-native/engine',
        '@symbiote-native/css-parser',
        '@symbiote-native/vue',
      ]),
    ).toEqual(['@symbiote-native/engine', '@symbiote-native/css-parser']);
  });

  it('reads a manifest with no dependency lists as declaring nothing', () => {
    expect(declaredAmong({}, ['@symbiote-native/engine'])).toEqual([]);
  });
});

describe('the stamp file', () => {
  const folder = mkdtempSync(join(tmpdir(), 'registry-stamps-'));
  const path = join(folder, 'stamps.json');

  afterEach(() => rmSync(path, { force: true }));

  it('round-trips what was written', () => {
    writeStamps(path, { '@symbiote-native/engine': STAMP });

    expect(readStamps(path)).toEqual({ '@symbiote-native/engine': STAMP });
  });

  it('reads a missing or corrupt file as no stamps', () => {
    expect(readStamps(path)).toEqual({});
    writeFileSync(path, '{ not json');

    expect(readStamps(path)).toEqual({});
  });
});
