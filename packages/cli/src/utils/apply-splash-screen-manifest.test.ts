import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applySplashScreenManifest } from './apply-splash-screen-manifest.js';

const BASE_MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.VIBRATE" />

  <application
    android:name=".MainApplication"
    android:label="@string/app_name"
    android:allowBackup="false"
    android:theme="@style/AppTheme"
    android:supportsRtl="true">
    <activity
      android:name=".MainActivity"
      android:label="@string/app_name"
      android:launchMode="singleTask"
      android:exported="true"
      android:theme="@style/AppTheme">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`;

describe('applySplashScreenManifest', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setup(content: string): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-splash-manifest-'),
    );
    tmpDirs.push(root);
    const dir = path.join(root, 'android/app/src/main');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'AndroidManifest.xml'), content);
    return root;
  }

  function read(root: string): string {
    return fs.readFileSync(
      path.join(root, 'android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
  }

  it("switches MainActivity's theme to BootTheme, leaving the <application> theme alone", () => {
    const root = setup(BASE_MANIFEST);
    applySplashScreenManifest(root);
    const manifest = read(root);
    const activityBlock = manifest.match(/<activity\b[^>]*>/)?.[0] ?? '';
    expect(activityBlock).toContain('android:theme="@style/BootTheme"');
    expect(manifest).toContain('android:name=".MainApplication"');
    expect(manifest).toMatch(
      /android:name="\.MainApplication"[\s\S]*?android:theme="@style\/AppTheme"/,
    );
  });

  it('is idempotent — applying twice does not error and leaves a single BootTheme reference', () => {
    const root = setup(BASE_MANIFEST);
    applySplashScreenManifest(root);
    applySplashScreenManifest(root);
    expect(read(root).split('@style/BootTheme').length - 1).toBe(1);
  });

  it('does nothing when there is no AndroidManifest.xml at all', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-splash-manifest-'),
    );
    tmpDirs.push(root);
    expect(() => applySplashScreenManifest(root)).not.toThrow();
  });
});
