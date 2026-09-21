import * as fs from 'node:fs';
import * as path from 'node:path';
import { findIosAppDir } from './find-ios-app-dir.js';

// `new` ships the same 3 keys via a whole-file Info.plist overlay (safe: the file is
// scaffolder-generated and never customized yet). `add` runs against a REAL app's Info.plist —
// overwriting it would lose whatever the developer already put there — so this inserts only the
// keys that are missing, one at a time, idempotently.
const USAGE_DESCRIPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['NSFaceIDUsageDescription', 'This app uses Face ID to authenticate you.'],
  ['NSMotionUsageDescription', 'This app uses motion sensor data.'],
  [
    'NSUserTrackingUsageDescription',
    'This app tracks your activity across other apps and websites.',
  ],
];

export function applyExpoModulesInfoPlist(root: string): void {
  const iosAppDir = findIosAppDir(root);
  if (iosAppDir === undefined) return;
  const plistPath = path.join(iosAppDir, 'Info.plist');
  if (!fs.existsSync(plistPath)) return;

  const plist = fs.readFileSync(plistPath, 'utf8');
  const updated = USAGE_DESCRIPTIONS.reduce((current, [key, description]) => {
    if (current.includes(`<key>${key}</key>`)) return current;
    return current.replace(
      '</dict>\n</plist>',
      `\t<key>${key}</key>\n\t<string>${description}</string>\n</dict>\n</plist>`,
    );
  }, plist);

  if (updated !== plist) fs.writeFileSync(plistPath, updated);
}
