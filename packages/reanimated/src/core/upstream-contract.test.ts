import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);

function packageRoot(name: string): string {
  return dirname(require_.resolve(`${name}/package.json`));
}

function versionOf(name: string): string {
  return JSON.parse(
    readFileSync(join(packageRoot(name), 'package.json'), 'utf8'),
  ).version;
}

const HOOK_DIR = join(packageRoot('react-native-reanimated'), 'src', 'hook');

function hookSources(): string[] {
  return readdirSync(HOOK_DIR)
    .filter(file => file.endsWith('.ts'))
    .sort();
}

function fingerprintOfHooks(): string {
  const hash = createHash('sha256');
  for (const file of hookSources()) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(join(HOOK_DIR, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function exportedNames(file: string): string[] {
  const source = readFileSync(join(HOOK_DIR, file), 'utf8');
  return [...source.matchAll(/^export (?:async )?function (\w+)/gm)].map(
    match => match[1],
  );
}

// The ported hook controllers are written against these exact sources. Review the diff of
// `react-native-reanimated/src/hook` against the controllers, then update the fingerprint
const HOOK_SOURCES_FINGERPRINT =
  'eeb6c712207156e7198c810254604ba9360d25f7001d4deb47f82a6a7cb91bae';

describe('the Reanimated release the hook controllers are ported against', () => {
  it('is the pinned Reanimated and Worklets pair', () => {
    expect(versionOf('react-native-reanimated')).toBe('4.7.1');
    expect(versionOf('react-native-worklets')).toBe('0.13.0');
  });

  it('has hook sources identical to the ones the controllers were written against', () => {
    expect(fingerprintOfHooks()).toBe(HOOK_SOURCES_FINGERPRINT);
  });

  it('still exports the React-free helpers the controllers import', () => {
    expect(exportedNames('useAnimatedStyleCommon.ts')).toEqual(
      expect.arrayContaining([
        'createAnimatedStyleHandle',
        'prepareAnimation',
        'runAnimations',
        'styleUpdater',
        'checkSharedValueUsage',
        'buildWorkletsHash',
      ]),
    );
    expect(exportedNames('useHandlerCommon.ts')).toEqual(
      expect.arrayContaining([
        'ensureWorkletHandlers',
        'areWorkletHandlersEqual',
        'areDependenciesEqual',
      ]),
    );
  });
});
