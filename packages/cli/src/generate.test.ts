import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXPO_PACKAGE_LAYERS,
  type IExpoPackageLayerName,
} from './expo-package-layers.js';
import { scaffoldApp, type IScaffoldOptions } from './generate.js';
import type { IFramework, IVueFlavor } from './types.js';
import { sanitizeNativeAppName } from './utils/native-identity.js';
import { isValidPackageName } from './utils/package-name.js';

const BUNDLE_ID = 'com.example.app';
// applyAppIdentity moves android/app/.../java/com/canary to a path derived from the bundle id
// (com.example.app -> com/example/app) and renames ios/Canary -> ios/<nativeAppName> — a test
// reading back from the literal template paths ("com/canary", "ios/Canary") would silently read
// nothing or the wrong file once identity substitution has already run.
const ANDROID_PACKAGE_PATH = BUNDLE_ID.split('.').join('/');

function readText(root: string, ...segments: string[]): string {
  return fs.readFileSync(path.join(root, ...segments), 'utf8');
}

// Every scaffolded app's native template (templates/native/{ios,android}) can optionally wire
// react-native-bootsplash (MainActivity.kt: com.zoontek.rnbootsplash.RNBootSplash,
// AppDelegate.swift: RNBootSplash) — gated behind hasSplashScreen, same shape as navigation/
// expo-modules/testing. Off by default: the base native template must compile WITHOUT the
// @symbiote-native/splash-screen package (no import/init call, no Android theme that extends
// the plugin's own Theme.BootSplash — that parent style only exists once the plugin's AAR is a
// Gradle dependency, so leaving AndroidManifest/styles.xml pointed at it without the dependency
// is an aapt build break, not just a runtime "module not found").
describe('scaffoldApp splash-screen option', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffold(
    hasSplashScreen: boolean,
    framework: IFramework = 'react',
    vueFlavor?: IVueFlavor,
  ): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework,
      vueFlavor,
      hasTypescript: true,
      bundleId: BUNDLE_ID,
      hasExpoModules: false,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen,
      hasSlider: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    return root;
  }

  it('is off by default: no splash-screen dependency, plain theme, no native wiring', () => {
    const root = scaffold(false);
    const nativeAppName = sanitizeNativeAppName(root);
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('dependencies' in pkg)) {
      throw new Error('generated package.json has no "dependencies" field');
    }
    expect(pkg.dependencies).not.toHaveProperty(
      '@symbiote-native/splash-screen',
    );

    const mainActivity = readText(
      root,
      'android/app/src/main/java',
      ANDROID_PACKAGE_PATH,
      'MainActivity.kt',
    );
    expect(mainActivity).not.toContain('RNBootSplash');

    const manifest = readText(root, 'android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:theme="@style/AppTheme"');
    expect(manifest).not.toContain('BootTheme');

    const styles = readText(root, 'android/app/src/main/res/values/styles.xml');
    expect(styles).not.toContain('BootTheme');

    const appDelegate = readText(
      root,
      'ios',
      nativeAppName,
      'AppDelegate.swift',
    );
    expect(appDelegate).not.toContain('RNBootSplash');
  });

  it('wires bootsplash end to end when opted in, with the app identity substituted throughout', () => {
    const root = scaffold(true);
    const nativeAppName = sanitizeNativeAppName(root);
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('dependencies' in pkg)) {
      throw new Error('generated package.json has no "dependencies" field');
    }
    expect(pkg.dependencies).toMatchObject({
      '@symbiote-native/splash-screen': expect.any(String),
    });

    const mainActivity = readText(
      root,
      'android/app/src/main/java',
      ANDROID_PACKAGE_PATH,
      'MainActivity.kt',
    );
    expect(mainActivity).toContain(
      'import com.zoontek.rnbootsplash.RNBootSplash',
    );
    expect(mainActivity).toContain(
      'RNBootSplash.init(this, R.style.BootTheme)',
    );
    // The layer file is a full copy of the template's "Canary" placeholder content — prove
    // applyAppIdentity's substitution pass (which runs AFTER this layer is applied) actually
    // reaches it too, not just the base template's own files.
    expect(mainActivity).not.toContain('Canary');
    expect(mainActivity).toContain(
      `getMainComponentName(): String = "${nativeAppName}"`,
    );

    const manifest = readText(root, 'android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:theme="@style/BootTheme"');

    const styles = readText(root, 'android/app/src/main/res/values/styles.xml');
    expect(styles).toContain('name="BootTheme"');

    const appDelegate = readText(
      root,
      'ios',
      nativeAppName,
      'AppDelegate.swift',
    );
    expect(appDelegate).toContain('import RNBootSplash');
    expect(appDelegate).toContain(
      'RNBootSplash.initWithStoryboard("BootSplash"',
    );
    expect(appDelegate).not.toContain('Canary');
    expect(appDelegate).toContain(`withModuleName: "${nativeAppName}"`);
  });

  // The native/ overlay (MainActivity.kt, AndroidManifest.xml, styles.xml, AppDelegate.swift) is
  // framework-agnostic — it never touches js/<framework> — but the two tests above only exercise
  // the react default. Prove the wiring actually lands identically regardless of --framework,
  // same cross-framework shape as "declares @symbiote-native/android for every framework" below.
  const frameworksForSplashScreen: ReadonlyArray<
    [IFramework, IVueFlavor | undefined]
  > = [
    ['react', undefined],
    ['vue', 'tsx'],
    ['vue', 'sfc'],
    ['angular', undefined],
    ['solid', undefined],
    ['svelte', undefined],
  ];

  it.each(frameworksForSplashScreen)(
    'wires bootsplash for %s (%s)',
    (framework, vueFlavor) => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
      );
      tmpDirs.push(root);
      const options: IScaffoldOptions = {
        appName: root,
        framework,
        vueFlavor,
        hasTypescript: true,
        bundleId: BUNDLE_ID,
        hasExpoModules: false,
        hasNavigation: false,
        hasTesting: false,
        hasSplashScreen: true,
        hasSlider: false,
        styling: 'css',
        packageManager: 'npm',
      };
      scaffoldApp(options);
      const nativeAppName = sanitizeNativeAppName(root);

      const mainActivity = readText(
        root,
        'android/app/src/main/java',
        ANDROID_PACKAGE_PATH,
        'MainActivity.kt',
      );
      expect(mainActivity).toContain(
        'RNBootSplash.init(this, R.style.BootTheme)',
      );

      const manifest = readText(
        root,
        'android/app/src/main/AndroidManifest.xml',
      );
      expect(manifest).toContain('android:theme="@style/BootTheme"');

      const appDelegate = readText(
        root,
        'ios',
        nativeAppName,
        'AppDelegate.swift',
      );
      expect(appDelegate).toContain(
        'RNBootSplash.initWithStoryboard("BootSplash"',
      );
    },
  );
});

// react-native-bootsplash's native splash screen never hides itself — it stays up until JS calls
// hide(). Every real example (examples/react's useEffect, .../vue-sfc's onMounted, .../angular's
// ngOnInit, .../solid's onMount, .../svelte's bare top-level call) wires this at the App root, but
// --splash-screen only ever overlaid native/ + the dependency — never the JS side. Without it, a
// scaffolded --splash-screen app would freeze on the splash screen forever, on every framework.
describe('scaffoldApp splash-screen option wires hide() into the App entry (real bug)', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function findAppFile(root: string): string {
    const stack = [root];
    const names = ['App.tsx', 'App.jsx', 'App.ts', 'App.vue', 'App.svelte'];
    while (stack.length > 0) {
      const dir = stack.pop();
      if (dir === undefined) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === 'ios' ||
          entry.name === 'android' ||
          entry.name === 'node_modules'
        ) {
          continue;
        }
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(entryPath);
        } else if (names.includes(entry.name)) {
          return entryPath;
        }
      }
    }
    throw new Error(`no App file found under ${root}`);
  }

  const cases: ReadonlyArray<[IFramework, IVueFlavor | undefined]> = [
    ['react', undefined],
    ['vue', 'tsx'],
    ['vue', 'sfc'],
    ['angular', undefined],
    ['solid', undefined],
    ['svelte', undefined],
  ];

  it.each(cases)(
    '%s (%s) calls hide() at mount, without navigation',
    (framework, vueFlavor) => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
      );
      tmpDirs.push(root);
      scaffoldApp({
        appName: root,
        framework,
        vueFlavor,
        hasTypescript: true,
        bundleId: BUNDLE_ID,
        hasExpoModules: false,
        hasNavigation: false,
        hasTesting: false,
        hasSplashScreen: true,
        hasSlider: false,
        styling: 'css',
        packageManager: 'npm',
      });
      const source = fs.readFileSync(findAppFile(root), 'utf8');
      expect(source).toContain('splash-screen');
      expect(source).toContain('hide(');
    },
  );

  it.each(cases)(
    '%s (%s) still calls hide() when stacked with --navigation',
    (framework, vueFlavor) => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
      );
      tmpDirs.push(root);
      scaffoldApp({
        appName: root,
        framework,
        vueFlavor,
        hasTypescript: true,
        bundleId: BUNDLE_ID,
        hasExpoModules: false,
        hasNavigation: true,
        hasTesting: false,
        hasSplashScreen: true,
        hasSlider: false,
        styling: 'css',
        packageManager: 'npm',
      });
      const source = fs.readFileSync(findAppFile(root), 'utf8');
      expect(source).toContain('splash-screen');
      expect(source).toContain('hide(');
      // Prove the splice didn't clobber the navigation overlay it ran on top of.
      expect(source).toContain('Stack');
    },
  );

  it('does not call hide() when splash-screen is off', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    scaffoldApp({
      appName: root,
      framework: 'react',
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
    });
    const source = fs.readFileSync(findAppFile(root), 'utf8');
    expect(source).not.toContain('splash-screen');
  });

  // react/solid/vue-tsx have a genuinely separate .jsx file for hasTypescript: false (not just a
  // .typescript. infix on the same name like svelte/vue-sfc) — the only axis the cases above don't
  // already cover.
  it.each(['react', 'solid', 'vue'] as const)(
    '%s calls hide() in the JS (.jsx) variant too',
    framework => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
      );
      tmpDirs.push(root);
      scaffoldApp({
        appName: root,
        framework,
        vueFlavor: framework === 'vue' ? 'tsx' : undefined,
        hasTypescript: false,
        bundleId: BUNDLE_ID,
        hasExpoModules: false,
        hasNavigation: false,
        hasTesting: false,
        hasSplashScreen: true,
        hasSlider: false,
        styling: 'css',
        packageManager: 'npm',
      });
      const appFile = findAppFile(root);
      expect(appFile.endsWith('.jsx')).toBe(true);
      const source = fs.readFileSync(appFile, 'utf8');
      expect(source).toContain('splash-screen');
      expect(source).toContain('hide(');
    },
  );

  it.each(['css-modules', 'stylesheet'] as const)(
    'survives stacking with --styling %s (whole-file App overlay renders after the splice target)',
    styling => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
      );
      tmpDirs.push(root);
      scaffoldApp({
        appName: root,
        framework: 'react',
        vueFlavor: undefined,
        hasTypescript: true,
        bundleId: BUNDLE_ID,
        hasExpoModules: false,
        hasNavigation: false,
        hasTesting: false,
        hasSplashScreen: true,
        hasSlider: false,
        styling,
        packageManager: 'npm',
      });
      const source = fs.readFileSync(findAppFile(root), 'utf8');
      expect(source).toContain('splash-screen');
      expect(source).toContain('hide(');
    },
  );
});

// `useStackNavigation()`'s return type differs per framework: React returns the handle directly,
// Solid an Accessor (`navigation()`), Svelte a rune object (`navigation.current`) — but Vue
// returns a ComputedRef (`navigation.value`). vue-sfc's `.vue` template auto-unwraps a top-level
// ref referenced in `<template>`/`@press`, so `navigation.push(...)` compiles correctly there —
// but vue-tsx's App is a plain JSX render function, which Vue's compiler never touches, so the
// SAME unwrapped call leaves `navigation` a bare ComputedRef with no `.push`/`.pop` method. Real
// device bug (2026-09-18): tapping "Go to Details" threw `TypeError: undefined is not a function`.
describe('scaffoldApp vue-tsx navigation dereferences the ComputedRef with .value (real bug)', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each(['sfc', 'tsx'] as const)(
    '%s calls navigation methods through .value or its template equivalent',
    vueFlavor => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
      );
      tmpDirs.push(root);
      scaffoldApp({
        appName: root,
        framework: 'vue',
        vueFlavor,
        hasTypescript: true,
        bundleId: BUNDLE_ID,
        hasExpoModules: false,
        hasNavigation: true,
        hasTesting: false,
        hasSplashScreen: false,
        hasSlider: false,
        styling: 'css',
        packageManager: 'npm',
      });
      const appSource = readText(
        root,
        vueFlavor === 'sfc' ? 'App.vue' : 'App.tsx',
      );
      if (vueFlavor === 'tsx') {
        // A plain JSX render function never goes through Vue's SFC compiler, so no auto-unwrap.
        expect(appSource).toContain('navigation.value.push(');
        expect(appSource).toContain('navigation.value.pop(');
        expect(appSource).not.toMatch(/[^.]navigation\.push\(/);
        expect(appSource).not.toMatch(/[^.]navigation\.pop\(/);
      } else {
        // vue-sfc keeps the bare form: Vue's <template> compiler auto-unwraps it.
        const menuSource = readText(root, 'MenuScreen.vue');
        const detailsSource = readText(root, 'DetailsScreen.vue');
        expect(menuSource).toContain("navigation.push('Details')");
        expect(detailsSource).toContain('navigation.pop()');
      }
    },
  );
});

// Real bug (2026-09-18): svelte's scaffolded screen rendered zero logos on device, every other
// element (text, counter, buttons) fine. `require('./assets/x.png')`'s numeric-asset-id path has
// no working precedent anywhere in this project for Svelte — every other Svelte image use,
// examples/svelte included, is a plain `{uri}` object. Switched the templates to inline data-URI
// `{uri}` sources instead, the one shape proven to work.
describe('scaffoldApp svelte images use {uri} sources, not require() (real bug)', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([false, true])(
    'base app (--navigation=%s) never calls require() for an image',
    hasNavigation => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
      );
      tmpDirs.push(root);
      scaffoldApp({
        appName: root,
        framework: 'svelte',
        vueFlavor: undefined,
        hasTypescript: true,
        bundleId: BUNDLE_ID,
        hasExpoModules: false,
        hasNavigation,
        hasTesting: false,
        hasSplashScreen: false,
        hasSlider: false,
        styling: 'css',
        packageManager: 'npm',
      });
      const appFile = hasNavigation ? 'MenuScreen.svelte' : 'App.svelte';
      const source = readText(root, appFile);
      expect(source).not.toContain('require(');
      expect(source).toContain("from './image-uris'");
      expect(source).toContain('source={{ uri: REACT_NATIVE_LOGO_URI }}');
      expect(fs.existsSync(path.join(root, 'image-uris.js'))).toBe(true);
    },
  );
});

// Found via a real `tsc -p tsconfig.json` run against a scaffolded app (not just string-matching
// the template): react's base tsconfig unconditionally set `types: ["jest"]`, but `@types/jest`
// is only installed by the OPTIONAL `--testing` layer — every react scaffold WITHOUT --testing
// failed typecheck immediately with "TS2688: Cannot find type definition file for 'jest'". The
// same root config also has no reason to typecheck `e2e/**` at all, since the testing layer
// ships e2e/tsconfig.json as its own separate, complete project — but the root `include` glob
// (`**/*.ts`) picks up e2e's specs anyway unless explicitly excluded, and e2e's own describe/it/
// beforeAll globals then read as unresolved names under the root config specifically. Every
// framework template needs "e2e" in its root exclude for this reason, testing on or off.
describe('scaffoldApp tsconfig correctness (each framework, testing off)', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldTsconfig(
    framework: IFramework,
    vueFlavor?: IVueFlavor,
  ): Record<string, unknown> {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework,
      vueFlavor,
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
    // Some frameworks' tsconfig.json carries full-line `//` comments (e.g. angular's) — valid
    // TypeScript JSONC, not valid JSON.parse input.
    const withoutComments = readText(root, 'tsconfig.json').replace(
      /^\s*\/\/.*$/gm,
      '',
    );
    const parsed: unknown = JSON.parse(withoutComments);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('generated tsconfig.json did not parse to an object');
    }
    return parsed as Record<string, unknown>;
  }

  function compilerOptions(
    tsconfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const options = tsconfig.compilerOptions;
    if (typeof options !== 'object' || options === null) {
      throw new Error('generated tsconfig.json has no compilerOptions');
    }
    return options as Record<string, unknown>;
  }

  it('react: types JSX against its own adapter, excludes e2e, no unconditional jest dependency', () => {
    const tsconfig = scaffoldTsconfig('react');
    const options = compilerOptions(tsconfig);
    expect(options.jsxImportSource).toBe('@symbiote-native/react');
    expect(options.types ?? []).not.toContain('jest');
    expect(tsconfig.exclude).toContain('e2e');
  });

  it('vue-tsx: preserves JSX and points it at the Vue adapter, excludes e2e', () => {
    const tsconfig = scaffoldTsconfig('vue', 'tsx');
    const options = compilerOptions(tsconfig);
    expect(options.jsx).toBe('preserve');
    expect(options.jsxImportSource).toBe('@symbiote-native/vue');
    expect(tsconfig.exclude).toContain('e2e');
  });

  it('vue-sfc: points Volar at the Vue adapter for .vue template type-checking, excludes e2e', () => {
    const tsconfig = scaffoldTsconfig('vue', 'sfc');
    const vueCompilerOptions = tsconfig.vueCompilerOptions;
    if (typeof vueCompilerOptions !== 'object' || vueCompilerOptions === null) {
      throw new Error(
        'generated vue-sfc tsconfig.json has no vueCompilerOptions',
      );
    }
    expect((vueCompilerOptions as Record<string, unknown>).lib).toBe(
      '@symbiote-native/vue',
    );
    expect(tsconfig.exclude).toContain('e2e');
  });

  it('angular: excludes e2e (no unconditional jest dependency needed either)', () => {
    const tsconfig = scaffoldTsconfig('angular');
    const options = compilerOptions(tsconfig);
    expect(options.types).not.toContain('jest');
    expect(tsconfig.exclude).toContain('e2e');
  });

  it('solid: keeps its own JSX namespace, excludes e2e', () => {
    const tsconfig = scaffoldTsconfig('solid');
    const options = compilerOptions(tsconfig);
    expect(options.jsx).toBe('preserve');
    expect(options.jsxImportSource).toBe('@symbiote-native/solid');
    expect(tsconfig.exclude).toContain('e2e');
  });

  it('svelte: already excludes e2e (regression guard)', () => {
    const tsconfig = scaffoldTsconfig('svelte');
    expect(tsconfig.exclude).toContain('e2e');
  });
});

// A directory name the filesystem happily accepts ("My Cool App") is not automatically a valid
// npm package name (uppercase, spaces) — writing it unsanitized into package.json's "name" field
// scaffolds fine and only fails later, at `npm install`, with an npm-internal error nowhere near
// the actual cause. create-vue's own create() has the identical isValidPackageName/
// toValidPackageName split for exactly this reason (see utils/package-name.ts).
describe("scaffoldApp sanitizes package.json's name", () => {
  const tmpDirs: string[] = [];
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  // scaffoldApp resolves the target dir as `path.resolve(cwd, appName)` — every OTHER describe
  // block in this file dodges that by passing an absolute tmp path as `appName` itself (which
  // `path.resolve` then returns unchanged). That trick breaks HERE: it's specifically appName's
  // own (non-path) string content under test, e.g. "My Cool App", so this scaffolds from inside
  // a real tmp cwd instead, exactly like the CLI's own real invocation does.
  function scaffoldWithAppName(appName: string): string {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(tmpRoot);
    process.chdir(tmpRoot);
    const options: IScaffoldOptions = {
      appName,
      framework: 'react',
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
    return scaffoldApp(options);
  }

  it('writes an already-valid app name through unchanged', () => {
    const root = scaffoldWithAppName('my-cool-app');
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('name' in pkg)) {
      throw new Error('generated package.json has no "name" field');
    }
    expect(pkg.name).toBe('my-cool-app');
  });

  it('sanitizes a filesystem-legal but npm-illegal app name ("My Cool App")', () => {
    const root = scaffoldWithAppName('My Cool App');
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (
      typeof pkg !== 'object' ||
      pkg === null ||
      !('name' in pkg) ||
      typeof pkg.name !== 'string'
    ) {
      throw new Error('generated package.json has no string "name" field');
    }
    expect(isValidPackageName(pkg.name)).toBe(true);
    expect(pkg.name).toBe('my-cool-app');
  });

  // create-vue supports `npx create-vue .` (scaffold into the current directory) — a well-known
  // idiom this CLI's own `path.resolve(cwd, appName)` already handles for FREE (it normalizes to
  // cwd). But toValidPackageName('.') strips the leading dot and is left with "", an npm-illegal
  // package.json "name" that fails `npm install` — checked against create-vue's own
  // toValidPackageName, which has the identical hole and papers over it with a forced interactive
  // re-prompt (see .vendors/create-vue). This CLI never re-prompts, so the empty string must never
  // reach package.json in the first place.
  it('derives a real package name from the directory when appName is "."', () => {
    const root = scaffoldWithAppName('.');
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (
      typeof pkg !== 'object' ||
      pkg === null ||
      !('name' in pkg) ||
      typeof pkg.name !== 'string'
    ) {
      throw new Error('generated package.json has no string "name" field');
    }
    expect(isValidPackageName(pkg.name)).toBe(true);
    expect(pkg.name).toBe(path.basename(root).toLowerCase());
  });
});

// Every framework's own metro.config.js does `require('@react-native/metro-config')` and every
// babel.config.js has `presets: ['module:@react-native/babel-preset']` — these are hard
// `require()` calls, not optional conveniences, so a scaffold missing either package fails before
// Metro even boots (`npm start`/`npm run ios`/`npm run android` all go through it). Found via
// `/vendor`-style direct inspection of each template's own config files against its fragment's
// devDependencies: vue-sfc and angular required both packages but declared neither.
describe('scaffoldApp declares the metro/babel packages every framework config requires', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldDevDependencies(
    framework: IFramework,
    vueFlavor?: IVueFlavor,
  ): Record<string, unknown> {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework,
      vueFlavor,
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
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (
      typeof pkg !== 'object' ||
      pkg === null ||
      !('devDependencies' in pkg) ||
      typeof pkg.devDependencies !== 'object' ||
      pkg.devDependencies === null
    ) {
      throw new Error('generated package.json has no devDependencies object');
    }
    return pkg.devDependencies as Record<string, unknown>;
  }

  const frameworks: ReadonlyArray<[IFramework, IVueFlavor | undefined]> = [
    ['react', undefined],
    ['vue', 'tsx'],
    ['vue', 'sfc'],
    ['angular', undefined],
    ['solid', undefined],
    ['svelte', undefined],
  ];

  it.each(frameworks)('%s (%s)', (framework, vueFlavor) => {
    const devDependencies = scaffoldDevDependencies(framework, vueFlavor);
    expect(devDependencies).toHaveProperty('@react-native/babel-preset');
    expect(devDependencies).toHaveProperty('@react-native/metro-config');
  });
});

// Every framework's package.json.fragment.json wires `"lint": "eslint ."`, and `eslint` +
// `@react-native/eslint-config` are universal devDependencies (templates/native's own fragment)
// — checked against a `lint`-script-without-a-config regression, since ESLint's flat config
// needs an actual eslint.config.js file to run at all. `templates/native/eslint.config.js` covers
// react/angular/vue-tsx for free (their real examples ship that exact 3-line base config
// verbatim, no framework-specific overrides needed); vue-sfc/solid/svelte's own `templates/js/
// <fw>/eslint.config.js` then overrides it with the `.vue`/`.svelte` parser wiring their SFC/
// component format needs (confirmed via `/vendor`-style diff against each framework's real
// examples/<fw>/eslint.config.js).
describe('scaffoldApp ships an eslint.config.js for every framework', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldRoot(framework: IFramework, vueFlavor?: IVueFlavor): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework,
      vueFlavor,
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

  const frameworks: ReadonlyArray<[IFramework, IVueFlavor | undefined]> = [
    ['react', undefined],
    ['vue', 'tsx'],
    ['vue', 'sfc'],
    ['angular', undefined],
    ['solid', undefined],
    ['svelte', undefined],
  ];

  it.each(frameworks)('%s (%s)', (framework, vueFlavor) => {
    const root = scaffoldRoot(framework, vueFlavor);
    expect(fs.existsSync(path.join(root, 'eslint.config.js'))).toBe(true);
    expect(readText(root, 'eslint.config.js')).toContain(
      '@react-native/eslint-config/flat',
    );
  });
});

// @angular/core declares rxjs as a mandatory (non-optional — checked via peerDependenciesMeta)
// peerDependency, and @symbiote-native/angular's own peerDependencies list @angular/forms
// alongside @angular/core — every real Angular app needs both regardless of this project's
// zoneless choice (zone.js, the one genuinely optional peer here, correctly stays out).
describe('scaffoldApp angular includes rxjs and @angular/forms', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  it('declares both required Angular peers', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework: 'angular',
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
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('dependencies' in pkg)) {
      throw new Error('generated package.json has no "dependencies" field');
    }
    expect(pkg.dependencies).toHaveProperty('rxjs');
    expect(pkg.dependencies).toHaveProperty('@angular/forms');
  });
});

// Every framework gets the same `pretypecheck` (css-dts, generating .module.css.d.ts) +
// `typecheck` script pair, one per framework's own type-checker — vue-tsc / svelte-check where
// the framework has a dedicated one, plain tsc (react, solid) or ngc (angular, which already
// needs the AOT compiler for its real build) otherwise. react/angular's own REAL examples happen
// not to have this pair, but that's upstream inconsistency, not a reason to omit it here — the
// scaffolder gives every framework the same story on purpose. Our templates already shipped
// vue-tsx/vue-sfc's tsconfig.typecheck.json (TYPESCRIPT_ONLY_FILENAMES in render-template.ts
// already treats it as TS-only) but never wired the scripts or the `vue-tsc`/`svelte-check`
// devDependency that would make them work — a half-finished feature.
describe('scaffoldApp wires the pretypecheck/typecheck scripts each framework example has', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldPackageJson(
    framework: IFramework,
    vueFlavor?: IVueFlavor,
  ): Record<string, unknown> {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework,
      vueFlavor,
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
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null) {
      throw new Error('generated package.json did not parse to an object');
    }
    return pkg as Record<string, unknown>;
  }

  it('vue-tsx: pretypecheck + vue-tsc typecheck, vue-tsc as a devDependency', () => {
    const pkg = scaffoldPackageJson('vue', 'tsx');
    expect(pkg.scripts).toMatchObject({
      pretypecheck: 'css-dts .',
      typecheck: 'vue-tsc --noEmit -p tsconfig.typecheck.json',
    });
    expect(pkg.devDependencies).toHaveProperty('vue-tsc');
  });

  it('vue-sfc: pretypecheck + vue-tsc typecheck, vue-tsc as a devDependency', () => {
    const pkg = scaffoldPackageJson('vue', 'sfc');
    expect(pkg.scripts).toMatchObject({
      pretypecheck: 'css-dts .',
      typecheck: 'vue-tsc --noEmit -p tsconfig.typecheck.json',
    });
    expect(pkg.devDependencies).toHaveProperty('vue-tsc');
  });

  it('solid: pretypecheck + plain tsc typecheck, no extra devDependency needed', () => {
    const pkg = scaffoldPackageJson('solid');
    expect(pkg.scripts).toMatchObject({
      pretypecheck: 'css-dts .',
      typecheck: 'tsc --noEmit',
    });
  });

  it('svelte: pretypecheck + svelte-check typecheck, svelte-check as a devDependency and its own tsconfig.typecheck.json', () => {
    const pkg = scaffoldPackageJson('svelte');
    expect(pkg.scripts).toMatchObject({
      pretypecheck: 'css-dts .',
      typecheck:
        'svelte-check --tsconfig ./tsconfig.typecheck.json --threshold error',
    });
    expect(pkg.devDependencies).toHaveProperty('svelte-check');
  });

  it('react: pretypecheck + plain tsc typecheck', () => {
    const pkg = scaffoldPackageJson('react');
    expect(pkg.scripts).toMatchObject({
      pretypecheck: 'css-dts .',
      typecheck: 'tsc --noEmit',
    });
  });

  it('angular: pretypecheck + ngc typecheck (its own AOT compiler, --noEmit)', () => {
    const pkg = scaffoldPackageJson('angular');
    expect(pkg.scripts).toMatchObject({
      pretypecheck: 'css-dts .',
      typecheck: 'ngc -p tsconfig.angular.json --noEmit',
    });
  });
});

// examples/vue-tsx's babel.config.js uses @symbiote-native/vue/babel-jsx (the plugin PLUS its
// isCustomElement option) instead of the bare '@vue/babel-plugin-jsx' string — per that file's
// own comment, "Either half alone is broken": without isCustomElement, the `<view>`/`<text>`/…
// intrinsic tags each compile to a Vue COMPONENT INSTANCE instead of their lowered intrinsic
// element, defeating the host-primitive-lowering optimization this project's whole perf story
// depends on for Vue. Our template used the bare plugin string.
describe('scaffoldApp vue-tsx wires the adapter-provided JSX plugin, not the bare one', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  it('babel.config.js requires @symbiote-native/vue/babel-jsx, not a bare plugin-name string', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework: 'vue',
      vueFlavor: 'tsx',
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
    const babelConfig = readText(root, 'babel.config.js');
    expect(babelConfig).toContain("require('@symbiote-native/vue/babel-jsx')");
    // The bare plugin name may still appear in prose (explaining why it's NOT used directly,
    // exactly like the real reference file's own comment does) — what must never appear is the
    // bare string actually PLACED in the plugins array.
    expect(babelConfig).not.toMatch(
      /plugins:\s*\[[^\]]*'@vue\/babel-plugin-jsx'/,
    );
    expect(babelConfig).toMatch(/plugins:\s*\[\.\.\.symbioteVueJsx\(\)/);
  });
});

// @symbiote-native/expo-modules-link's OWN README documents this as step 2 of "Setup (once per
// app)", right after `npm install`: without the postinstall hook, its `bin/postinstall.cjs`
// linker never runs, so the Android `build.gradle` implementation line and the
// `MainApplication.kt` ModulesProvider entry it writes never happen. The layer's fragment
// already listed the package and all 20+ @symbiote-native/<expo-module> dependencies, but never
// wired the script that makes them WORK — every module compiles clean and then throws
// "Cannot find native module '<Name>'" at runtime, exactly the failure mode the package's own
// README calls out. examples/expo-react has this wired; the scaffolder's expo-modules layer did
// not.
describe('scaffoldApp expo-modules option wires the postinstall linker', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldWithExpoModules(hasExpoModules: boolean): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework: 'react',
      vueFlavor: undefined,
      hasTypescript: true,
      bundleId: BUNDLE_ID,
      hasExpoModules,
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

  it('adds the postinstall script when expo-modules is on', () => {
    const root = scaffoldWithExpoModules(true);
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('scripts' in pkg)) {
      throw new Error('generated package.json has no scripts object');
    }
    expect(pkg.scripts).toMatchObject({ postinstall: 'symbiote-expo-link' });
  });

  it('does not add it when expo-modules is off', () => {
    const root = scaffoldWithExpoModules(false);
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (
      typeof pkg !== 'object' ||
      pkg === null ||
      !('scripts' in pkg) ||
      typeof pkg.scripts !== 'object' ||
      pkg.scripts === null
    ) {
      throw new Error('generated package.json has no scripts object');
    }
    expect(pkg.scripts).not.toHaveProperty('postinstall');
  });
});

// @symbiote-native/slider is a real dependency of every example (examples/react, vue-sfc, vue-tsx,
// angular, svelte, solid), yet had zero scaffolder wiring — the one package outside the
// expo-modules bundle with no option at all. It needs no native/ files of its own: RN autolinking
// discovers it through the package's own react-native.config.cjs + symbiote-slider.podspec (see
// packages/slider/README.md, "Packaging — one dependency, not two"), so the whole scaffolder side
// of "necessary native side" is the dependency declaration itself — `npm install` + the user's own
// `pod install` do the rest.
describe('scaffoldApp slider option', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldWithSlider(hasSlider: boolean): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework: 'react',
      vueFlavor: undefined,
      hasTypescript: true,
      bundleId: BUNDLE_ID,
      hasExpoModules: false,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    return root;
  }

  it('adds the dependency when opted in', () => {
    const root = scaffoldWithSlider(true);
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('dependencies' in pkg)) {
      throw new Error('generated package.json has no "dependencies" field');
    }
    expect(pkg.dependencies).toMatchObject({
      '@symbiote-native/slider': expect.any(String),
    });
  });

  it('is off by default: no slider dependency', () => {
    const root = scaffoldWithSlider(false);
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('dependencies' in pkg)) {
      throw new Error('generated package.json has no "dependencies" field');
    }
    expect(pkg.dependencies).not.toHaveProperty('@symbiote-native/slider');
  });
});

// @symbiote-native/android — the Android host-shim re-providing RN host signals (keyboard events,
// …) that SymbioteNative's Fabric surface bypasses (packages/android/package.json's own
// description) — is a real dependency of every framework's example (examples/react, vue-sfc,
// vue-tsx, angular, solid, svelte all pin it), unconditionally, not behind any feature flag. None
// of the six js/<framework>/package.json.fragment.json base fragments declared it.
// Each EXPO_PACKAGE_LAYERS entry (battery, sensors, …) is individually selectable — previously
// they only ever arrived as one all-or-nothing bundle glued to `--expo-modules`, so a battery-only
// app had no way to avoid also declaring sensors/sms/web-browser/etc. Off by default, and picking
// ONE implies the same expo/autolinking wiring `--expo-modules` provides on its own — see
// generate.ts's own `hasExpoModules` derivation comment for why that's computed here, not trusted
// to the caller.
describe('scaffoldApp expo-package options', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldWithExpoPackages(
    expoPackages: ReadonlySet<IExpoPackageLayerName>,
  ): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework: 'react',
      vueFlavor: undefined,
      hasTypescript: true,
      bundleId: BUNDLE_ID,
      hasExpoModules: false,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider: false,
      expoPackages,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    return root;
  }

  it('is off by default: no expo-package dependency, no expo autolinking wiring', () => {
    const root = scaffoldWithExpoPackages(new Set());
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('dependencies' in pkg)) {
      throw new Error('generated package.json has no "dependencies" field');
    }
    expect(pkg.dependencies).not.toHaveProperty('@symbiote-native/battery');
    expect(pkg.dependencies).not.toHaveProperty('expo');
  });

  it.each(EXPO_PACKAGE_LAYERS)(
    'selecting $id installs $symbiotePackage plus the expo autolinking wiring',
    layer => {
      const root = scaffoldWithExpoPackages(new Set([layer.id]));
      const pkg: unknown = JSON.parse(readText(root, 'package.json'));
      if (typeof pkg !== 'object' || pkg === null || !('dependencies' in pkg)) {
        throw new Error('generated package.json has no "dependencies" field');
      }
      expect(pkg.dependencies).toMatchObject({
        [layer.symbiotePackage]: expect.any(String),
        expo: expect.any(String),
        '@symbiote-native/expo-modules-link': expect.any(String),
      });
    },
  );

  it('never installs an unrelated expo-package dependency', () => {
    const root = scaffoldWithExpoPackages(new Set(['battery']));
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('dependencies' in pkg)) {
      throw new Error('generated package.json has no "dependencies" field');
    }
    expect(pkg.dependencies).not.toHaveProperty('@symbiote-native/sensors');
  });
});

describe('scaffoldApp declares @symbiote-native/android for every framework', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldDependencies(
    framework: IFramework,
    vueFlavor?: IVueFlavor,
  ): Record<string, unknown> {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework,
      vueFlavor,
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
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (
      typeof pkg !== 'object' ||
      pkg === null ||
      !('dependencies' in pkg) ||
      typeof pkg.dependencies !== 'object' ||
      pkg.dependencies === null
    ) {
      throw new Error('generated package.json has no dependencies object');
    }
    return pkg.dependencies as Record<string, unknown>;
  }

  const frameworks: ReadonlyArray<[IFramework, IVueFlavor | undefined]> = [
    ['react', undefined],
    ['vue', 'tsx'],
    ['vue', 'sfc'],
    ['angular', undefined],
    ['solid', undefined],
    ['svelte', undefined],
  ];

  it.each(frameworks)('%s (%s)', (framework, vueFlavor) => {
    const dependencies = scaffoldDependencies(framework, vueFlavor);
    expect(dependencies).toHaveProperty('@symbiote-native/android');
  });
});

// examples/expo-react's real Info.plist (the only expo-* example checked into this repo with a
// native/ios project) carries NSFaceIDUsageDescription (local-auth), NSMotionUsageDescription
// (sensors), and NSUserTrackingUsageDescription (tracking-transparency) — iOS REJECTS/crashes
// calling those modules' APIs without the matching usage-description string, App Store review
// included. The base native/ios/Canary/Info.plist has none of them (it doesn't know about
// expo-modules at all), and the expo-modules layer only ever wired the package.json fragment +
// postinstall script — the Info.plist half of "necessary native side" was never covered.
describe('scaffoldApp expo-modules option adds the iOS usage-description strings its bundled modules need', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldInfoPlist(hasExpoModules: boolean): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework: 'react',
      vueFlavor: undefined,
      hasTypescript: true,
      bundleId: BUNDLE_ID,
      hasExpoModules,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    const nativeAppName = sanitizeNativeAppName(root);
    return readText(root, 'ios', nativeAppName, 'Info.plist');
  }

  it('adds the three usage-description keys when opted in', () => {
    const plist = scaffoldInfoPlist(true);
    expect(plist).toContain('NSFaceIDUsageDescription');
    expect(plist).toContain('NSMotionUsageDescription');
    expect(plist).toContain('NSUserTrackingUsageDescription');
  });

  it('does not add them when expo-modules is off', () => {
    const plist = scaffoldInfoPlist(false);
    expect(plist).not.toContain('NSFaceIDUsageDescription');
    expect(plist).not.toContain('NSMotionUsageDescription');
    expect(plist).not.toContain('NSUserTrackingUsageDescription');
  });
});

// Same reference (examples/expo-react/android/app/src/main/AndroidManifest.xml) has an Android
// half too: 4 <uses-permission> the base template lacks (local-auth's biometric prompt, brightness's
// setSystemBrightnessAsync, cellular's carrier lookups all fail on Android without them) plus two
// <application> backup-control attributes expo-secure-store's own Android config-plugin
// (withSecureStore.ts, vendored via /vendor) writes unconditionally — verified via vendoring that
// the @xml/secure_store_* resources it points at ship INSIDE expo-secure-store's own Android
// library module (android/src/main/res/xml/), so they resolve through Gradle's cross-module
// resource merge with no local res/xml/ copy needed; the reference manifest's reference isn't
// broken. Applied as a text-splice POST-process (like applyAppIdentity) rather than a third
// AndroidManifest.xml overlay: --expo-modules renders before --splash-screen in generate.ts, and a
// third full-file overlay would have silently lost splash-screen's BootTheme swap (or vice versa)
// since renderTemplate overwrites, it doesn't merge.
describe('scaffoldApp expo-modules option adds the Android permissions/backup config its bundled modules need', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldManifest(
    hasExpoModules: boolean,
    hasSplashScreen = false,
  ): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework: 'react',
      vueFlavor: undefined,
      hasTypescript: true,
      bundleId: BUNDLE_ID,
      hasExpoModules,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen,
      hasSlider: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    return readText(root, 'android/app/src/main/AndroidManifest.xml');
  }

  it('adds the permissions and backup attributes when opted in', () => {
    const manifest = scaffoldManifest(true);
    expect(manifest).toContain('android.permission.USE_FINGERPRINT');
    expect(manifest).toContain('android.permission.USE_BIOMETRIC');
    expect(manifest).toContain('android.permission.WRITE_SETTINGS');
    expect(manifest).toContain('android.permission.READ_PHONE_STATE');
    expect(manifest).toContain(
      'android:dataExtractionRules="@xml/secure_store_data_extraction_rules"',
    );
    expect(manifest).toContain(
      'android:fullBackupContent="@xml/secure_store_backup_rules"',
    );
  });

  it('does not add them when expo-modules is off', () => {
    const manifest = scaffoldManifest(false);
    expect(manifest).not.toContain('USE_BIOMETRIC');
    expect(manifest).not.toContain('secure_store');
  });

  it('survives stacking with --splash-screen (whichever layer writes the manifest last keeps both)', () => {
    const manifest = scaffoldManifest(true, true);
    expect(manifest).toContain('android.permission.USE_BIOMETRIC');
    expect(manifest).toContain(
      'android:fullBackupContent="@xml/secure_store_backup_rules"',
    );
    expect(manifest).toContain('android:theme="@style/BootTheme"');
  });
});

// @symbiote-native/engine is a peerDependency of EVERY adapter (adapters/{react,vue,svelte,solid,
// angular}/package.json all list it identically — npm never auto-installs a peer, the consuming
// app must declare it directly, the same convention CLAUDE.md's
// <react_native_is_an_explicit_top_level_peer> already documents for react-native itself).
// vue-sfc/vue-tsx/angular/solid/svelte's js/<framework>/package.json.fragment.json all already
// declared it — only react's fragment was missing it, an isolated gap found by diffing a full
// scaffold's dependency set against examples/react's real package.json.
describe('scaffoldApp declares @symbiote-native/engine as a direct dependency for react', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  it('react', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework: 'react',
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
    const pkg: unknown = JSON.parse(readText(root, 'package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('dependencies' in pkg)) {
      throw new Error('generated package.json has no "dependencies" field');
    }
    expect(pkg.dependencies).toHaveProperty('@symbiote-native/engine');
  });
});

// A lockfile is dependency-installer OUTPUT, never scaffolder input — real bug found on-device
// 2026-09-18: a checked-in ios/Podfile.lock ships a dependency resolution (incl. the
// `ReactNativeDependencies` pod, RN 0.86's split for glog/boost/folly/etc.) frozen from WHATEVER
// environment produced it. applyAppIdentity then text-renames "Canary" -> the real app name
// INSIDE Podfile itself (it's in TEXT_FILE_EXTENSIONS's '' bucket for extension-less files),
// which changes Podfile's SHA1 that Podfile.lock's own "PODFILE CHECKSUM" line records. `pod
// install` compares them, sees a mismatch, and silently discards the shipped lock for a full
// fresh resolve — which, without RCT_USE_RN_DEP=1 in the developer's shell, resolves
// ReactNativeDependencies as build-from-source instead of the prebuilt framework the ALWAYS-USED
// prebuilt React-Core-prebuilt binary hard-links via @rpath — `dyld: Library not loaded:
// @rpath/ReactNativeDependencies.framework` at launch, no red-box, no build error. The template
// Podfile.lock was never a real fix for anything — it only ever appeared to work by accident,
// for apps whose target name happened to stay "Canary".
describe('scaffoldApp does not ship a lockfile for any package manager', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not generate ios/Podfile.lock', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-scaffold-'),
    );
    tmpDirs.push(root);
    const options: IScaffoldOptions = {
      appName: root,
      framework: 'react',
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
    expect(fs.existsSync(path.join(root, 'ios', 'Podfile.lock'))).toBe(false);
  });
});
