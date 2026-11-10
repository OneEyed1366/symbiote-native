import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKAGES = path.join(import.meta.dirname, '..', '..');
const NATIVE_PEERS = ['react-native-reanimated', 'react-native-worklets'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sectionOf(file: string, section: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  const found = isRecord(parsed) ? parsed[section] : undefined;
  return isRecord(found) ? found : {};
}

// The layer pins what the package's peer range is anchored to, so a new app starts on the
// version the package was ported and tested against, and a bump of one cannot miss the other
describe('the reanimated layer fragment', () => {
  const pinned = sectionOf(
    path.join(
      PACKAGES,
      'cli',
      'templates',
      'layers',
      'reanimated',
      'package.json.fragment.json',
    ),
    'dependencies',
  );
  const peers = sectionOf(
    path.join(PACKAGES, 'reanimated', 'package.json'),
    'peerDependencies',
  );

  it.each(NATIVE_PEERS)(
    'pins %s at the version its peer range is anchored to',
    name => {
      const anchor = String(peers[name]).replace(/^~/, '');

      expect(pinned[name]).toBe(anchor);
    },
  );
});
