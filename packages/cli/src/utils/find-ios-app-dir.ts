import * as fs from 'node:fs';
import * as path from 'node:path';

// A real app's ios/<AppName>/ directory is named after the app, not "Canary" — the one thing a
// fresh scaffold's fixed path can assume and a real, already-existing app's can't. Every RN
// project has exactly one such directory (Pods/ is CocoaPods', never the app's own).
export function findIosAppDir(root: string): string | undefined {
  const iosDir = path.join(root, 'ios');
  if (!fs.existsSync(iosDir)) return undefined;
  for (const entry of fs.readdirSync(iosDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'Pods')
      return path.join(iosDir, entry.name);
  }
  return undefined;
}
