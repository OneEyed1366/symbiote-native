import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applySplashScreenStyles } from './apply-splash-screen-styles.js';

const BASE_STYLES = `<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <!-- Customize your theme here. -->
        <item name="android:editTextBackground">@drawable/rn_edit_text_material</item>
    </style>
</resources>
`;

describe('applySplashScreenStyles', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setup(content: string): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-splash-styles-'),
    );
    tmpDirs.push(root);
    const dir = path.join(root, 'android/app/src/main/res/values');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'styles.xml'), content);
    return root;
  }

  function read(root: string): string {
    return fs.readFileSync(
      path.join(root, 'android/app/src/main/res/values/styles.xml'),
      'utf8',
    );
  }

  // The BootTheme style is what MainActivity's swapped theme (apply-splash-screen-manifest.ts)
  // resolves to, and what MainActivity.kt's `RNBootSplash.init(this, R.style.BootTheme)` names —
  // all three must land together for the app to build.
  it('adds the BootTheme style extending the bootsplash plugin theme, keeping AppTheme intact', () => {
    const root = setup(BASE_STYLES);
    applySplashScreenStyles(root);
    const styles = read(root);
    expect(styles).toContain(
      '<style name="BootTheme" parent="Theme.BootSplash">',
    );
    expect(styles).toContain('bootSplashBackground');
    expect(styles).toContain('bootSplashLogo');
    expect(styles).toContain('postBootSplashTheme');
    expect(styles).toContain('name="AppTheme"');
  });

  it('is idempotent — applying twice does not duplicate the style', () => {
    const root = setup(BASE_STYLES);
    applySplashScreenStyles(root);
    applySplashScreenStyles(root);
    expect(read(root).split('name="BootTheme"').length - 1).toBe(1);
  });

  it('does nothing when there is no styles.xml at all', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-splash-styles-'),
    );
    tmpDirs.push(root);
    expect(() => applySplashScreenStyles(root)).not.toThrow();
  });
});
