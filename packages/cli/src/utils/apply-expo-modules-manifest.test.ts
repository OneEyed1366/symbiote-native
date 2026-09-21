import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyExpoModulesAndroidManifest } from './apply-expo-modules-manifest.js';

const BASE_MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.VIBRATE" />

  <application
    android:name=".MainApplication"
    android:label="@string/app_name"
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:allowBackup="false"
    android:theme="@style/AppTheme"
    android:usesCleartextTraffic="\${usesCleartextTraffic}"
    android:supportsRtl="true">
    <activity android:name=".MainActivity" />
  </application>
</manifest>
`;

describe('applyExpoModulesAndroidManifest', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setupManifest(content: string): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-manifest-'),
    );
    tmpDirs.push(root);
    const manifestDir = path.join(root, 'android/app/src/main');
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(path.join(manifestDir, 'AndroidManifest.xml'), content);
    return root;
  }

  function readManifest(root: string): string {
    return fs.readFileSync(
      path.join(root, 'android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
  }

  // `add` re-applies this against an app that may already have had --expo-modules scaffolded (or
  // run `add --expo-modules` a second time) — the splice used to match its own OWN inserted
  // VIBRATE line on a second pass and duplicate the whole permissions block.
  it('does not duplicate the permissions block when applied twice', () => {
    const root = setupManifest(BASE_MANIFEST);
    applyExpoModulesAndroidManifest(root);
    applyExpoModulesAndroidManifest(root);
    const manifest = readManifest(root);
    expect(manifest.split('USE_BIOMETRIC').length - 1).toBe(1);
    expect(manifest.split('READ_PHONE_STATE').length - 1).toBe(1);
  });

  it('does not duplicate the backup attributes when applied twice', () => {
    const root = setupManifest(BASE_MANIFEST);
    applyExpoModulesAndroidManifest(root);
    applyExpoModulesAndroidManifest(root);
    const manifest = readManifest(root);
    expect(manifest.split('dataExtractionRules').length - 1).toBe(1);
  });
});
