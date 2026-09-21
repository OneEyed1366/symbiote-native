import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applySplashScreenMainActivity } from './apply-splash-screen-main-activity.js';

const MAIN_ACTIVITY_NO_ONCREATE = `package com.realapp

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "RealApp"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
`;

const MAIN_ACTIVITY_WITH_ONCREATE = `package com.realapp

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    println("hello from a real app's own customization")
  }

  override fun getMainComponentName(): String = "RealApp"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
`;

describe('applySplashScreenMainActivity', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setup(content: string, packagePath = 'com/realapp'): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-splash-mainactivity-'),
    );
    tmpDirs.push(root);
    const dir = path.join(root, 'android/app/src/main/java', packagePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'MainActivity.kt'), content);
    return root;
  }

  function read(root: string, packagePath = 'com/realapp'): string {
    return fs.readFileSync(
      path.join(
        root,
        'android/app/src/main/java',
        packagePath,
        'MainActivity.kt',
      ),
      'utf8',
    );
  }

  it('adds a whole new onCreate override when MainActivity has none, wiring RNBootSplash.init', () => {
    const root = setup(MAIN_ACTIVITY_NO_ONCREATE);
    applySplashScreenMainActivity(root);
    const source = read(root);
    expect(source).toContain('import com.zoontek.rnbootsplash.RNBootSplash');
    expect(source).toContain('import android.os.Bundle');
    expect(source).toContain('RNBootSplash.init(this, R.style.BootTheme)');
    expect(source).toContain(
      'override fun onCreate(savedInstanceState: Bundle?)',
    );
    // The base class's own onCreate must still run — dropping super.onCreate breaks the activity.
    expect(source).toContain('super.onCreate(savedInstanceState)');
  });

  // A real app is far more likely than a fresh scaffold to already override onCreate for its own
  // reasons — the init call must be inserted into it, not replace it with a second override
  // (Kotlin doesn't allow declaring onCreate twice).
  it("inserts into an EXISTING onCreate override without disturbing the developer's own code", () => {
    const root = setup(MAIN_ACTIVITY_WITH_ONCREATE);
    applySplashScreenMainActivity(root);
    const source = read(root);
    expect(source).toContain('RNBootSplash.init(this, R.style.BootTheme)');
    expect(source).toContain(
      'println("hello from a real app\'s own customization")',
    );
    expect(source.match(/override fun onCreate/g)?.length).toBe(1);
  });

  it('finds MainActivity.kt under any package path, not just com/canary', () => {
    const root = setup(MAIN_ACTIVITY_NO_ONCREATE, 'com/example/deeply/nested');
    applySplashScreenMainActivity(root);
    expect(read(root, 'com/example/deeply/nested')).toContain(
      'RNBootSplash.init(',
    );
  });

  it('is idempotent — applying twice does not duplicate the init call or the import', () => {
    const root = setup(MAIN_ACTIVITY_NO_ONCREATE);
    applySplashScreenMainActivity(root);
    applySplashScreenMainActivity(root);
    const source = read(root);
    expect(source.split('RNBootSplash.init(').length - 1).toBe(1);
    expect(
      source.split('import com.zoontek.rnbootsplash.RNBootSplash').length - 1,
    ).toBe(1);
  });

  it('does nothing when there is no MainActivity.kt at all', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-splash-mainactivity-'),
    );
    tmpDirs.push(root);
    expect(() => applySplashScreenMainActivity(root)).not.toThrow();
  });
});
