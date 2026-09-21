import * as fs from 'node:fs';
import * as path from 'node:path';

// `new`'s --splash-screen overlays a whole second AndroidManifest.xml with MainActivity's theme
// already swapped. `add` must reach the SAME single real manifest --expo-modules may already have
// spliced (see apply-expo-modules-manifest.ts's own comment on why this is a splice, not a third
// overlay) — targeting only the <activity android:name=".MainActivity"> block so an app with other
// activities, or a differently-themed <application>, isn't touched anywhere else.
const MAIN_ACTIVITY_BLOCK =
  /<activity\b[^>]*android:name="\.MainActivity"[^>]*>/;

export function applySplashScreenManifest(root: string): void {
  const manifestPath = path.join(
    root,
    'android/app/src/main/AndroidManifest.xml',
  );
  if (!fs.existsSync(manifestPath)) return;

  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const match = manifest.match(MAIN_ACTIVITY_BLOCK);
  if (match === null) return;

  const block = match[0];
  if (block.includes('@style/BootTheme')) return; // idempotent
  if (!block.includes('android:theme="@style/AppTheme"')) return; // unrecognized shape, don't guess

  const updatedBlock = block.replace(
    'android:theme="@style/AppTheme"',
    'android:theme="@style/BootTheme"',
  );
  fs.writeFileSync(manifestPath, manifest.replace(block, updatedBlock));
}
