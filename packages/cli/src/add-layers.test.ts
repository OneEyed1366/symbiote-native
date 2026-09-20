import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addLayersToApp } from './add-layers.js';
import { scaffoldApp, type IScaffoldOptions } from './generate.js';

const BUNDLE_ID = 'com.example.app';

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

// `add` runs against an app this exact CLI already scaffolded with `new` and nothing else on top
// — the minimal, realistic fixture of "an existing @symbiote-native/* app" without dragging in a
// second scaffolding mechanism just for these tests.
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

  it('merges the navigation dependency into the existing package.json without touching App source', async () => {
    const root = scaffold();
    const appBefore = readText(root, 'App.tsx');

    const result = await addLayersToApp({
      root,
      framework: 'react',
      layers: ['navigation'],
      confirmTestingOverwrite: async () => false,
    });

    expect(readJson(root, 'package.json').dependencies).toMatchObject({
      '@symbiote-native/navigation': 'latest',
    });
    expect(readText(root, 'App.tsx')).toBe(appBefore);
    expect(result.appliedLayers).toEqual(['navigation']);
  });

  it('merges the slider dependency', async () => {
    const root = scaffold();
    const result = await addLayersToApp({
      root,
      framework: 'react',
      layers: ['slider'],
      confirmTestingOverwrite: async () => false,
    });
    expect(readJson(root, 'package.json').dependencies).toMatchObject({
      '@symbiote-native/slider': 'latest',
    });
    expect(result.appliedLayers).toEqual(['slider']);
  });

  // Any EXPO_PACKAGE_LAYERS id (battery, sensors, …) is dependency-only, same generic branch as
  // slider above — addLayersToApp itself never special-cases these; only resolveAddLayers (already
  // covered in prompts.test.ts) decides whether `expo-modules` also needs to ride along.
  it('merges an expo-package dependency (battery) via the generic dependency-only branch', async () => {
    const root = scaffold();
    const result = await addLayersToApp({
      root,
      framework: 'react',
      layers: ['battery'],
      confirmTestingOverwrite: async () => false,
    });
    expect(readJson(root, 'package.json').dependencies).toMatchObject({
      '@symbiote-native/battery': 'latest',
    });
    expect(result.appliedLayers).toEqual(['battery']);
  });

  // `expo-modules` is the one v1 layer that also touches native files — it must reach the real
  // AndroidManifest.xml/Info.plist the app already has (already covered idempotently by the two
  // apply-expo-modules-* utils on their own), not overwrite them wholesale.
  it('wires expo-modules: dependency, Android manifest, and iOS Info.plist', async () => {
    const root = scaffold();
    const result = await addLayersToApp({
      root,
      framework: 'react',
      layers: ['expo-modules'],
      confirmTestingOverwrite: async () => false,
    });

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
    const result = await addLayersToApp({
      root,
      framework: 'react',
      layers: ['navigation', 'slider'],
      confirmTestingOverwrite: async () => false,
    });
    const deps = readJson(root, 'package.json').dependencies;
    expect(deps).toMatchObject({
      '@symbiote-native/navigation': 'latest',
      '@symbiote-native/slider': 'latest',
    });
    expect(result.appliedLayers).toEqual(['navigation', 'slider']);
  });

  // splash-screen is the one layer that touches 4 native files plus the App source on top of the
  // dependency — all via the idempotent apply-splash-screen-* splices, never a whole-file overlay
  // (see their own comments for why: a real app's native files may already be customized). The
  // App-source hide() splice is a real bug fix (2026-09-18): without it, the native splash screen
  // never hides itself and a real `add`-extended app freezes on it forever.
  it('wires splash-screen: dependency + all 4 native splices + the App hide() call', async () => {
    const root = scaffold();
    const result = await addLayersToApp({
      root,
      framework: 'react',
      layers: ['splash-screen'],
      confirmTestingOverwrite: async () => false,
    });

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
    expect(result.appliedLayers).toEqual(['splash-screen']);
  });

  // expo-modules and splash-screen both splice the SAME AndroidManifest.xml (permissions/backup
  // attrs on <application>, MainActivity's theme on <activity>) — different regions of one file,
  // but only a real combined run proves neither's splice clobbers the other's.
  it('survives combining expo-modules and splash-screen — both touch AndroidManifest.xml', async () => {
    const root = scaffold();
    await addLayersToApp({
      root,
      framework: 'react',
      layers: ['expo-modules', 'splash-screen'],
      confirmTestingOverwrite: async () => false,
    });
    const manifest = readText(root, 'android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('USE_BIOMETRIC');
    expect(manifest).toContain('android:theme="@style/BootTheme"');
  });

  describe('testing layer', () => {
    it('writes detox.config.js and e2e/ on a fresh app with no existing files to conflict with', async () => {
      const root = scaffold();
      const result = await addLayersToApp({
        root,
        framework: 'react',
        layers: ['testing'],
        confirmTestingOverwrite: async () => false,
      });
      expect(fs.existsSync(path.join(root, 'detox.config.js'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'e2e/smoke.test.ts'))).toBe(true);
      expect(result.appliedLayers).toEqual(['testing']);
    });

    // Re-running `add --testing` on an app that already has it must not silently clobber files the
    // developer may have customized since the first add — the confirm callback is the product's
    // only guard against that, so this proves it is actually consulted, not bypassed.
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

      const result = await addLayersToApp({
        root,
        framework: 'react',
        layers: ['testing'],
        confirmTestingOverwrite: async () => false,
      });

      expect(readText(root, 'detox.config.js')).toBe(
        '// customized by the developer\n',
      );
      expect(result.appliedLayers).toEqual([]);
      expect(result.skippedLayers).toEqual(['testing']);
    });

    it('overwrites when the confirm callback approves', async () => {
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

      const result = await addLayersToApp({
        root,
        framework: 'react',
        layers: ['testing'],
        confirmTestingOverwrite: async () => true,
      });

      expect(readText(root, 'detox.config.js')).not.toBe(
        '// customized by the developer\n',
      );
      expect(result.appliedLayers).toEqual(['testing']);
    });

    // Angular's e2e:build scripts need an `ngc` pass before Detox builds the native binary — same
    // framework-conditional fragment `new` already picks between.
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
