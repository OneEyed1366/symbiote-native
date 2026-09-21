import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyExpoModulesInfoPlist } from './apply-expo-modules-plist.js';

const BASE_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDisplayName</key>
\t<string>RealApp</string>
</dict>
</plist>
`;

describe('applyExpoModulesInfoPlist', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  // `add` runs against a REAL app's Info.plist, whose native folder is named after the real app
  // (never "Canary", unlike a fresh `new` scaffold) — the fixed-Canary-path assumption `new`'s own
  // whole-file overlay relies on doesn't hold here, so this must locate the file by globbing
  // `ios/*/Info.plist` instead.
  function setupApp(plistContent: string, iosAppDirName = 'RealApp'): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-cli-plist-'));
    tmpDirs.push(root);
    const iosDir = path.join(root, 'ios', iosAppDirName);
    fs.mkdirSync(iosDir, { recursive: true });
    fs.writeFileSync(path.join(iosDir, 'Info.plist'), plistContent);
    return root;
  }

  function readPlist(root: string, iosAppDirName = 'RealApp'): string {
    return fs.readFileSync(
      path.join(root, 'ios', iosAppDirName, 'Info.plist'),
      'utf8',
    );
  }

  it('adds the three usage-description keys the bundled modules need', () => {
    const root = setupApp(BASE_PLIST);
    applyExpoModulesInfoPlist(root);
    const plist = readPlist(root);
    expect(plist).toContain('<key>NSFaceIDUsageDescription</key>');
    expect(plist).toContain('<key>NSMotionUsageDescription</key>');
    expect(plist).toContain('<key>NSUserTrackingUsageDescription</key>');
  });

  // Real Info.plists aren't scaffolder-generated — the app's own dir name varies per app, so the
  // function must find it rather than assume "Canary".
  it('finds Info.plist under the app-specific ios/<AppName> directory', () => {
    const root = setupApp(BASE_PLIST, 'SomeOtherAppName');
    applyExpoModulesInfoPlist(root);
    expect(readPlist(root, 'SomeOtherAppName')).toContain(
      'NSFaceIDUsageDescription',
    );
  });

  it('is idempotent — running it twice does not duplicate the keys', () => {
    const root = setupApp(BASE_PLIST);
    applyExpoModulesInfoPlist(root);
    applyExpoModulesInfoPlist(root);
    const plist = readPlist(root);
    expect(plist.split('NSFaceIDUsageDescription').length - 1).toBe(1);
  });

  // A real app's Info.plist may already declare one of these keys with its OWN wording (the
  // developer added Face ID support before ever running `add`) — must not clobber it.
  it('leaves an already-present key untouched instead of overwriting its value', () => {
    const withOwnKey = BASE_PLIST.replace(
      '</dict>\n</plist>',
      '\t<key>NSFaceIDUsageDescription</key>\n\t<string>Custom reason.</string>\n</dict>\n</plist>',
    );
    const root = setupApp(withOwnKey);
    applyExpoModulesInfoPlist(root);
    expect(readPlist(root)).toContain('Custom reason.');
    expect(readPlist(root).split('NSFaceIDUsageDescription').length - 1).toBe(
      1,
    );
  });
});
