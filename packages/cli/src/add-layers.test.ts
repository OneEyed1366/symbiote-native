import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addLayersToApp } from './add-layers.js';
import { scaffoldApp, type IScaffoldOptions } from './generate.js';

const BUNDLE_ID = 'com.example.app';
const WORKLETS_PLUGIN = 'react-native-worklets/plugin';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(
  root: string,
  ...segments: string[]
): Record<string, unknown> {
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(root, ...segments), 'utf8'),
  );
  if (!isRecord(parsed)) throw new Error('expected a JSON object');
  return parsed;
}

function readText(root: string, ...segments: string[]): string {
  return fs.readFileSync(path.join(root, ...segments), 'utf8');
}

// `add` runs against an app this CLI scaffolded with `new` and nothing else on top
// That is the minimal, realistic "existing @symbiote-native/* app", with no second scaffolder
function scaffoldBareApp(
  framework: IScaffoldOptions['framework'] = 'react',
): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'symbiote-cli-add-layers-'),
  );
  const options: IScaffoldOptions = {
    appName: root,
    framework,
    vueFlavor: undefined,
    hasTypescript: true,
    bundleId: BUNDLE_ID,
    hasExpoModules: false,
    hasNavigation: false,
    hasTesting: false,
    hasSplashScreen: false,
    hasSlider: false,
    hasReanimated: false,
    styling: 'css',
    packageManager: 'npm',
  };
  scaffoldApp(options);
  return root;
}

describe('addLayersToApp', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffold(
    framework: IScaffoldOptions['framework'] = 'react',
  ): string {
    const root = scaffoldBareApp(framework);
    tmpDirs.push(root);
    return root;
  }

  function addLayers(
    root: string,
    layers: Parameters<typeof addLayersToApp>[0]['layers'],
  ) {
    return addLayersToApp({
      root,
      framework: 'react',
      layers,
      confirmTestingOverwrite: async () => false,
    });
  }

  it('merges the navigation dependency into the existing package.json without touching App source', async () => {
    const root = scaffold();
    const appBefore = readText(root, 'App.tsx');

    const result = await addLayers(root, ['navigation']);

    expect(readJson(root, 'package.json').dependencies).toMatchObject({
      '@symbiote-native/navigation': 'latest',
    });
    expect(readText(root, 'App.tsx')).toBe(appBefore);
    expect(result.appliedLayers).toEqual(['navigation']);
  });

  it('merges the slider dependency', async () => {
    const root = scaffold();
    const result = await addLayers(root, ['slider']);
    expect(readJson(root, 'package.json').dependencies).toMatchObject({
      '@symbiote-native/slider': 'latest',
    });
    expect(result.appliedLayers).toEqual(['slider']);
  });

  // Any EXPO_PACKAGE_LAYERS id (battery, sensors) is dependency-only, like slider above
  // `addLayersToApp` never special-cases them, and `resolveAddLayers` decides whether
  // `expo-modules` rides along (covered in add-layer-prompts.test.ts)
  it('merges an expo-package dependency (battery) via the generic dependency-only branch', async () => {
    const root = scaffold();
    const result = await addLayers(root, ['battery']);
    expect(readJson(root, 'package.json').dependencies).toMatchObject({
      '@symbiote-native/battery': 'latest',
    });
    expect(result.appliedLayers).toEqual(['battery']);
  });

  describe('reanimated layer', () => {
    it('merges the package with the two native peers it needs, at the pinned versions', async () => {
      const root = scaffold();

      const result = await addLayers(root, ['reanimated']);

      expect(readJson(root, 'package.json').dependencies).toMatchObject({
        '@symbiote-native/reanimated': 'latest',
        'react-native-reanimated': '4.7.1',
        'react-native-worklets': '0.13.0',
      });
      expect(result.appliedLayers).toEqual(['reanimated']);
    });

    it('puts the worklets plugin last in the babel config of the app', async () => {
      const root = scaffold();

      await addLayers(root, ['reanimated']);

      expect(readText(root, 'babel.config.js')).toMatch(
        new RegExp(`'${WORKLETS_PLUGIN}',?\\s*\\],?\\s*\\};`),
      );
    });

    it('needs no manual step when it could write the plugin itself', async () => {
      const root = scaffold();

      const result = await addLayers(root, ['reanimated']);

      expect(result.hasManualBabelStep).toBe(false);
    });

    it('lists the plugin once however many times it is added', async () => {
      const root = scaffold();

      await addLayers(root, ['reanimated']);
      await addLayers(root, ['reanimated']);

      const config = readText(root, 'babel.config.js');
      expect(config.split(WORKLETS_PLUGIN)).toHaveLength(2);
    });

    // A hand-built app can have a babel config with no `plugins` list to extend
    // The layer cannot edit what it cannot find, so it hands the developer the step instead
    it('asks for a manual step and leaves the config alone when it has no plugins list', async () => {
      const root = scaffold();
      const handBuilt = 'module.exports = { presets: [] };\n';
      fs.writeFileSync(path.join(root, 'babel.config.js'), handBuilt);

      const result = await addLayers(root, ['reanimated']);

      expect(result.hasManualBabelStep).toBe(true);
      expect(readText(root, 'babel.config.js')).toBe(handBuilt);
      expect(result.appliedLayers).toEqual(['reanimated']);
    });
  });

  // `expo-modules` is the one v1 layer that also touches native files
  // It must reach the real AndroidManifest.xml and Info.plist the app has, not overwrite them
  it('wires expo-modules: dependency, Android manifest, and iOS Info.plist', async () => {
    const root = scaffold();
    const result = await addLayers(root, ['expo-modules']);

    expect(readJson(root, 'package.json').dependencies).toMatchObject({
      '@symbiote-native/expo-modules-link': 'latest',
    });
    expect(
      readText(root, 'android/app/src/main/AndroidManifest.xml'),
    ).toContain('USE_BIOMETRIC');
    const iosAppDir = fs
      .readdirSync(path.join(root, 'ios'), { withFileTypes: true })
      .find(entry => entry.isDirectory() && entry.name !== 'Pods')?.name;
    expect(iosAppDir).toBeDefined();
    expect(readText(root, 'ios', iosAppDir ?? '', 'Info.plist')).toContain(
      'NSFaceIDUsageDescription',
    );
    expect(result.appliedLayers).toEqual(['expo-modules']);
  });

  it('applies multiple layers in one call, same as "new"\'s multi-flag interface', async () => {
    const root = scaffold();
    const result = await addLayers(root, ['navigation', 'slider']);
    const deps = readJson(root, 'package.json').dependencies;
    expect(deps).toMatchObject({
      '@symbiote-native/navigation': 'latest',
      '@symbiote-native/slider': 'latest',
    });
    expect(result.appliedLayers).toEqual(['navigation', 'slider']);
  });

  // The order of `appliedLayers` follows the order asked for, `testing` in the middle included
  it('reports applied layers in the order they were asked for, around a testing layer', async () => {
    const root = scaffold();

    const result = await addLayers(root, ['navigation', 'testing', 'slider']);

    expect(result.appliedLayers).toEqual(['navigation', 'testing', 'slider']);
  });

  // `splash-screen` touches 4 native files plus the App source, all via idempotent splices
  // Without the App-source `hide()` splice the native splash never hides and the app freezes on it
  it('wires splash-screen: dependency + all 4 native splices + the App hide() call', async () => {
    const root = scaffold();
    const result = await addLayers(root, ['splash-screen']);

    expect(result.appliedLayers).toEqual(['splash-screen']);
    expect(readJson(root, 'package.json').dependencies).toMatchObject({
      '@symbiote-native/splash-screen': 'latest',
    });
    const iosAppDir = fs
      .readdirSync(path.join(root, 'ios'), { withFileTypes: true })
      .find(entry => entry.isDirectory() && entry.name !== 'Pods')?.name;
    expect(
      readText(root, 'ios', iosAppDir ?? '', 'AppDelegate.swift'),
    ).toContain('RNBootSplash.initWithStoryboard(');
    expect(
      readText(root, 'android/app/src/main/res/values/styles.xml'),
    ).toContain('name="BootTheme"');
    expect(
      readText(root, 'android/app/src/main/AndroidManifest.xml'),
    ).toContain('android:theme="@style/BootTheme"');
    const mainActivityContent = fs
      .readdirSync(path.join(root, 'android/app/src/main/java/com/example/app'))
      .join(',');
    expect(mainActivityContent).toContain('MainActivity.kt');
    expect(
      readText(
        root,
        'android/app/src/main/java/com/example/app/MainActivity.kt',
      ),
    ).toContain('RNBootSplash.init(');
    expect(readText(root, 'App.tsx')).toContain('hide(');
    expect(result.skippedLayers).toEqual([]);
  });

  // `expo-modules` and `splash-screen` splice the SAME AndroidManifest.xml in different regions
  // Only a real combined run proves neither splice clobbers the other
  it('survives combining expo-modules and splash-screen, both touch AndroidManifest.xml', async () => {
    const root = scaffold();
    await addLayers(root, ['expo-modules', 'splash-screen']);
    const manifest = readText(root, 'android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('USE_BIOMETRIC');
    expect(manifest).toContain('android:theme="@style/BootTheme"');
  });

  describe('testing layer', () => {
    it('writes detox.config.js and e2e/ on a fresh app with no existing files to conflict with', async () => {
      const root = scaffold();
      const result = await addLayers(root, ['testing']);
      expect(fs.existsSync(path.join(root, 'detox.config.js'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'e2e/smoke.test.ts'))).toBe(true);
      expect(result.appliedLayers).toEqual(['testing']);
    });

    // Re-running `add --testing` must not clobber files a developer customized since the first add
    // The confirm callback is the only guard, so this proves it is consulted and not bypassed
    it('asks before overwriting when detox.config.js already exists, and skips on decline', async () => {
      const root = scaffold();
      await addLayersToApp({
        root,
        framework: 'react',
        layers: ['testing'],
        confirmTestingOverwrite: async () => true,
      });
      fs.writeFileSync(
        path.join(root, 'detox.config.js'),
        '// customized by the developer\n',
      );

      const result = await addLayers(root, ['testing']);

      expect(readText(root, 'detox.config.js')).toBe(
        '// customized by the developer\n',
      );
      expect(result.appliedLayers).toEqual([]);
      expect(result.skippedLayers).toEqual(['testing']);
    });

    it('overwrites when the confirm callback approves', async () => {
      const root = scaffold();
      const approve = async () => true;
      await addLayersToApp({
        root,
        framework: 'react',
        layers: ['testing'],
        confirmTestingOverwrite: approve,
      });
      fs.writeFileSync(
        path.join(root, 'detox.config.js'),
        '// customized by the developer\n',
      );

      const result = await addLayersToApp({
        root,
        framework: 'react',
        layers: ['testing'],
        confirmTestingOverwrite: approve,
      });

      expect(readText(root, 'detox.config.js')).not.toBe(
        '// customized by the developer\n',
      );
      expect(result.appliedLayers).toEqual(['testing']);
    });

    // Angular's e2e:build scripts need an `ngc` pass before Detox builds the native binary
    // It is the same framework-conditional fragment `new` already picks between
    it('picks the angular-flavored fragment for an angular app', async () => {
      const root = scaffold('angular');
      await addLayersToApp({
        root,
        framework: 'angular',
        layers: ['testing'],
        confirmTestingOverwrite: async () => false,
      });
      expect(readText(root, 'package.json')).toMatch(/"e2e:build/);
    });
  });
});
