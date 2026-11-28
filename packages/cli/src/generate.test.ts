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
import { isJsonObject, type IJsonObject } from './utils/json.js';
import { sanitizeNativeAppName } from './utils/native-identity.js';
import { isValidPackageName } from './utils/package-name.js';

const BUNDLE_ID = 'com.example.app';
// `applyAppIdentity` moves the Android package dirs and renames `ios/Canary`
// A read through the template paths would miss the scaffolded file
const ANDROID_PACKAGE_PATH = BUNDLE_ID.split('.').join('/');

function readText(root: string, ...segments: string[]): string {
  return fs.readFileSync(path.join(root, ...segments), 'utf8');
}

function readPackageJson(root: string): IJsonObject {
  const pkg: unknown = JSON.parse(readText(root, 'package.json'));
  if (!isJsonObject(pkg)) {
    throw new Error('generated package.json is not a JSON object');
  }
  return pkg;
}

function readPackageSection(root: string, section: string): IJsonObject {
  const value = readPackageJson(root)[section];
  if (!isJsonObject(value)) {
    throw new Error(`generated package.json has no "${section}" object`);
  }
  return value;
}

function readPackageName(root: string): string {
  const { name } = readPackageJson(root);
  if (typeof name !== 'string') {
    throw new Error('generated package.json has no string "name" field');
  }
  return name;
}

// Only `--splash-screen` may wire `react-native-bootsplash` into the native template
// Without the package, its import or a `Theme.BootSplash` parent breaks the Android build
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
      hasReanimated: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    return root;
  }

  it('is off by default: no splash-screen dependency, plain theme, no native wiring', () => {
    const root = scaffold(false);
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

    const nativeAppName = sanitizeNativeAppName(root);
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
    // The layer file is a full copy of the "Canary" template
    // The identity pass runs after the layer, so it must reach this file too
    expect(mainActivity).not.toContain('Canary');
    const nativeAppName = sanitizeNativeAppName(root);
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

  // The `native/` overlay never touches `js/<framework>`, and the tests above cover only react
  // So the wiring is proven for every `--framework`
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
        hasReanimated: false,
        styling: 'css',
        packageManager: 'npm',
      };
      scaffoldApp(options);

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

      const nativeAppName = sanitizeNativeAppName(root);
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

// `react-native-bootsplash` keeps the splash screen up until JS calls `hide()`
// So `--splash-screen` also has to splice that call into each framework's App entry
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
        hasReanimated: false,
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
        hasReanimated: false,
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
      hasReanimated: false,
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
        hasReanimated: false,
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
        hasReanimated: false,
        styling,
        packageManager: 'npm',
      });
      const source = fs.readFileSync(findAppFile(root), 'utf8');
      expect(source).toContain('splash-screen');
      expect(source).toContain('hide(');
    },
  );
});

// `useStackNavigation()`'s return type differs per framework: Vue alone returns a ComputedRef.
// vue-sfc's template auto-unwraps a top-level ref, so `navigation.push(...)` compiles there;
// vue-tsx's plain JSX render function isn't touched by Vue's compiler, leaving no `.push`/`.pop`.
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
        hasReanimated: false,
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

// `require('./assets/x.png')`'s numeric-asset-id path has no working precedent in this project
// for Svelte — every other Svelte image use, examples/svelte included, is a plain `{uri}` object.
// The templates use inline data-URI `{uri}` sources instead, the one shape proven to work.
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
        hasReanimated: false,
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

// A root `types` entry must resolve with no optional layer, `jest` ships with `--testing` only
// `e2e/` is its own tsconfig project, so every root tsconfig excludes it
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
      hasReanimated: false,
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

  // The adapter declares its tags globally, and a fresh `App.svelte` imports nothing from it
  // Unloaded, svelte-check reads `<image resizeMode>` as the SVG tag and fails the new app
  it('svelte: loads the adapter tag types without an import from the app', () => {
    const options = compilerOptions(scaffoldTsconfig('svelte'));
    expect(options.types).toContain('@symbiote-native/svelte');
  });
});

// A legal directory name ("My Cool App") can be an illegal npm package name
// Written as is, it fails only at `npm install`, see `utils/package-name.ts`
describe("scaffoldApp sanitizes package.json's name", () => {
  const tmpDirs: string[] = [];
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  // The `appName` string is under test here, so it can't be an absolute tmp path as elsewhere
  // It scaffolds from inside a real tmp cwd, as the CLI does
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
      hasReanimated: false,
      styling: 'css',
      packageManager: 'npm',
    };
    return scaffoldApp(options);
  }

  it('writes an already-valid app name through unchanged', () => {
    const root = scaffoldWithAppName('my-cool-app');
    expect(readPackageName(root)).toBe('my-cool-app');
  });

  it('sanitizes a filesystem-legal but npm-illegal app name ("My Cool App")', () => {
    const name = readPackageName(scaffoldWithAppName('My Cool App'));
    expect(isValidPackageName(name)).toBe(true);
    expect(name).toBe('my-cool-app');
  });

  // `new .` scaffolds into the cwd, and `toValidPackageName('.')` leaves an empty name
  // An empty "name" fails `npm install`, so the directory name stands in
  it('derives a real package name from the directory when appName is "."', () => {
    const root = scaffoldWithAppName('.');
    const name = readPackageName(root);
    expect(isValidPackageName(name)).toBe(true);
    expect(name).toBe(path.basename(root).toLowerCase());
  });
});

// Each template's `metro.config.js` and `babel.config.js` hard-require these two packages
// A fragment that omits one breaks the app before Metro boots
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
      hasReanimated: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    return readPackageSection(root, 'devDependencies');
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

// Every framework wires `eslint .`, and flat config does not run without `eslint.config.js`
// `templates/native` ships the base one, some `templates/js/<framework>` override it
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
      hasReanimated: false,
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

// `rxjs` is a required peer of `@angular/core`, and our adapter peers `@angular/forms`
// `zone.js` is the optional one and stays out
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
      hasReanimated: false,
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

// Every framework gets `pretypecheck` (`css-dts`) and `typecheck` with its own checker
// The scripts need that checker declared, as `vue-tsc` or `svelte-check`
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
      hasReanimated: false,
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

// `babel-jsx` of our adapter adds `isCustomElement` to the Vue JSX plugin
// With the bare plugin each `<view>` compiles to a Vue component instance
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
      hasReanimated: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    const babelConfig = readText(root, 'babel.config.js');
    expect(babelConfig).toContain("require('@symbiote-native/vue/babel-jsx')");
    // The bare name may appear in a comment, but never inside the `plugins` array
    expect(babelConfig).not.toMatch(
      /plugins:\s*\[[^\]]*'@vue\/babel-plugin-jsx'/,
    );
    expect(babelConfig).toMatch(/plugins:\s*\[\.\.\.symbioteVueJsx\(\)/);
  });
});

// Without the postinstall hook the `expo-modules-link` linker never runs on Android
// The app then compiles and throws "Cannot find native module" at runtime
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
      hasReanimated: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    return root;
  }

  it('adds the postinstall script when expo-modules is on', () => {
    const root = scaffoldWithExpoModules(true);
    expect(readPackageSection(root, 'scripts')).toMatchObject({
      postinstall: 'symbiote-expo-link',
    });
  });

  it('does not add it when expo-modules is off', () => {
    const root = scaffoldWithExpoModules(false);
    expect(readPackageSection(root, 'scripts')).not.toHaveProperty(
      'postinstall',
    );
  });
});

// `slider` needs no `native/` files, as React Native autolinking finds it in the package
// So the dependency line is all the scaffolder adds, see `packages/slider/README.md`
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
      hasReanimated: false,
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

// Each `EXPO_PACKAGE_LAYERS` entry is selectable alone and off by default
// Picking one implies the `--expo-modules` wiring, derived in `generate.ts`
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
      hasReanimated: false,
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
      hasReanimated: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    return readPackageSection(root, 'dependencies');
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

// iOS crashes `local-auth`, `sensors` and `tracking-transparency` without a usage string
// The base `Info.plist` has none, so the `--expo-modules` layer adds them
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
      hasReanimated: false,
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

// `local-auth`, `brightness` and `cellular` fail on Android without these manifest entries
// They are spliced as text, as one more full overlay would undo the `--splash-screen` one
describe('scaffoldApp expo-modules option adds the Android permissions/backup config its bundled modules need', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffoldManifest({
    hasExpoModules,
    hasSplashScreen = false,
  }: {
    hasExpoModules: boolean;
    hasSplashScreen?: boolean;
  }): string {
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
      hasReanimated: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    return readText(root, 'android/app/src/main/AndroidManifest.xml');
  }

  it('adds the permissions and backup attributes when opted in', () => {
    const manifest = scaffoldManifest({ hasExpoModules: true });
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
    const manifest = scaffoldManifest({ hasExpoModules: false });
    expect(manifest).not.toContain('USE_BIOMETRIC');
    expect(manifest).not.toContain('secure_store');
  });

  it('survives stacking with --splash-screen (whichever layer writes the manifest last keeps both)', () => {
    const manifest = scaffoldManifest({
      hasExpoModules: true,
      hasSplashScreen: true,
    });
    expect(manifest).toContain('android.permission.USE_BIOMETRIC');
    expect(manifest).toContain(
      'android:fullBackupContent="@xml/secure_store_backup_rules"',
    );
    expect(manifest).toContain('android:theme="@style/BootTheme"');
  });
});

// Every adapter peers `@symbiote-native/engine`, so the app has to declare it itself
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
      hasReanimated: false,
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

// The identity pass renames "Canary" in `Podfile`, which breaks a shipped lock's checksum
// `pod install` would then drop the lock and could resolve the wrong linkage
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
      hasReanimated: false,
      styling: 'css',
      packageManager: 'npm',
    };
    scaffoldApp(options);
    expect(fs.existsSync(path.join(root, 'ios', 'Podfile.lock'))).toBe(false);
  });
});
