import babel from '@babel/core';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';

// Root unit/integration runner, tests are co-located with what they exercise
// `@symbiote-native/*` resolve to raw `src/*.ts`, so they are inlined. `examples/*` is out of scope

// A single `react` copy is enforced by pnpm-workspace.yaml `overrides`, else "Invalid hook call"

const INCLUDE_ALL = [
  'core/**/src/**/*.test.{ts,tsx}',
  'adapters/**/src/**/*.test.{ts,tsx}',
  // A Metro transformer is a hand-authored package-root .cjs, so its test sits at the same level
  'adapters/*/*.test.{ts,tsx}',
  'packages/**/src/**/*.test.{ts,tsx}',
  // Cross-cutting checks that read several packages' sources and assert a contract between them
  'tests/**/*.test.{ts,tsx}',
];

// Benchmarks sit next to the tests of what they time, scoped so two projects do not run them twice
const BENCH_ALL = [
  'core/**/src/**/*.bench.ts',
  'adapters/**/src/**/*.bench.ts',
  'packages/**/src/**/*.bench.ts',
];
const SVELTE_BENCH = ['adapters/svelte/**/*.bench.ts'];

// `**/e2e/**` keeps the Detox on-device suite (jest-based) out of the run
const EXCLUDE_ALL = ['**/node_modules/**', '**/build/**', '**/e2e/**'];

// Everything that mounts Svelte, including each package's `src/svelte/**` smokes
// Find new ones with `grep -rl --include='*.test.ts' svelte core packages adapters`
const SVELTE_TESTS = [
  'adapters/svelte/**/*.test.{ts,tsx}',
  'packages/**/src/svelte/**/*.test.{ts,tsx}',
];

// Everything that compiles Solid JSX, which tsc leaves as `preserve` for the app's Metro to compile
// The plugin pins the same two options as adapters/solid/babel-preset.cjs, they must not drift
const SOLID_TESTS = [
  'adapters/solid/**/*.test.{ts,tsx}',
  'packages/**/src/solid/**/*.test.{ts,tsx}',
];

// Without `dev: false` two solid-js builds load and signals never reach the renderer's effects
// `conditions: ['browser']` picks the client build, see the svelte note below
const SOLID_TRANSFORM = solidPlugin({
  dev: false,
  hot: false,
  solid: {
    moduleName: '@symbiote-native/solid/renderer',
    generate: 'universal',
  },
});

// Vitest imports Angular adapter source directly, so Oxc lowers its legacy decorators first
// The production AOT path is still ngc partial compilation

// RN's source is Flow, which Rolldown cannot parse, a test reaching it dies on `Parse failure`
// Stripping the types here is what lets a hand-written port give way to the upstream module
// Hermes' parser, not `@babel/preset-flow`, which dies on the conditional type in `flattenStyle`
const require_ = createRequire(import.meta.url);
const HERMES_SYNTAX = require_.resolve('babel-plugin-syntax-hermes-parser');
const FLOW_STRIP = require_.resolve('@babel/plugin-transform-flow-strip-types');

// RN mixes ESM `import` with a top-level `require('./X')` in one file (`PanResponder.js:15`)
// Vite leaves the require, so Node loads the next hop raw, as Flow, hence hoisting it to an import
const requireToImport = ({ types: t }: { types: typeof babel.types }) => ({
  visitor: {
    CallExpression(path: babel.NodePath<babel.types.CallExpression>, state) {
      if (!t.isIdentifier(path.node.callee, { name: 'require' })) return;
      const [arg] = path.node.arguments;
      if (!t.isStringLiteral(arg)) return;
      if (path.scope.getBinding('require')) return;
      const ns = path.scope.generateUidIdentifier('req');
      // A namespace is not callable, so a CJS target is read through `.default`
      // RN writes `require('./X').default` against its own ESM files, a second unwrap is undefined
      const callerUnwraps =
        path.parentPath.isMemberExpression({ computed: false }) &&
        t.isIdentifier(path.parentPath.node.property, { name: 'default' });
      state.file.path.unshiftContainer(
        'body',
        t.importDeclaration(
          [t.importNamespaceSpecifier(ns)],
          t.stringLiteral(arg.value),
        ),
      );
      path.replaceWith(
        callerUnwraps
          ? ns
          : t.logicalExpression(
              '??',
              t.memberExpression(ns, t.identifier('default')),
              ns,
            ),
      );
    },
  },
});

// Not just `react-native/`: its Flow reaches into sibling `@react-native/*` packages
const RN_SOURCE =
  /\/node_modules\/(react-native|@react-native\/[^/]+)\/.*\.jsx?$/;

const REACT_NATIVE_FLOW = {
  name: 'strip-flow-from-react-native',
  enforce: 'pre' as const,
  async transform(code: string, id: string) {
    if (!RN_SOURCE.test(id.split('?')[0])) return null;
    const out = await babel.transformAsync(code, {
      filename: id,
      babelrc: false,
      configFile: false,
      sourceMaps: true,
      plugins: [
        [HERMES_SYNTAX, { parseLangTypes: 'flow' }],
        FLOW_STRIP,
        requireToImport,
      ],
    });
    return out?.code == null ? null : { code: out.code, map: out.map };
  },
};

// The `Platform.js` shim imports `./Platform`, Metro picks the platform file and Vite loops back
// The default is then undefined, so the import is pinned to `.ios.js`
const RN_PLATFORM_IOS = require_.resolve(
  'react-native/Libraries/Utilities/Platform.ios.js',
);

// `isTesting: false` stands in for a device, `true` switches animations off engine-wide
const PLATFORM_CONSTANTS = {
  forceTouchAvailable: false,
  interfaceIdiom: 'phone',
  isTesting: false,
  osVersion: '26.5',
  reactNativeVersion: { major: 0, minor: 86, patch: 0, prerelease: null },
  systemName: 'iOS',
};

// The native modules RN asks `TurboModuleRegistry` for, by name
// A name missing here is `null` for `get` and a throw for `getEnforcing`, as on a binary without it
const SIMULATOR_SCREEN = { width: 390, height: 844, scale: 3, fontScale: 1 };
type IStubbedModule = { constants?: object; returns?: Record<string, unknown> };
const STUBBED_NATIVE_MODULES: Record<string, IStubbedModule> = {
  PlatformConstants: { constants: PLATFORM_CONSTANTS },
  DeviceInfo: {
    constants: {
      Dimensions: { window: SIMULATOR_SCREEN, screen: SIMULATOR_SCREEN },
    },
  },
  I18nManager: { constants: { isRTL: false, doLeftAndRightSwapInRTL: true } },
  Appearance: { returns: { getColorScheme: 'light' } },
  AppState: { constants: { initialAppState: 'active' } },
  SettingsManager: { constants: { settings: { foo: 1 } } },
  DeviceEventManager: {},
  LinkingManager: {
    returns: {
      openURL: { $promise: undefined },
      canOpenURL: { $promise: true },
      getInitialURL: { $promise: null },
      openSettings: { $promise: undefined },
    },
  },
  AlertManager: {},
  Vibration: {},
  ToastAndroid: {
    constants: { SHORT: 0, LONG: 1, TOP: 49, BOTTOM: 81, CENTER: 17 },
  },
  ActionSheetManager: {},
  ShareModule: {},
  PermissionsAndroid: {},
  UIManager: {},
  DevSettings: {},
  StatusBarManager: { constants: { HEIGHT: 20 } },
};
const REGISTRY_ID = '\0symbiote:rn-turbo-module-registry';
const NATIVE_MODULES_ID = '\0symbiote:rn-native-modules';

// `getConstants` answers `constants`, a method in `returns` answers its value
// A `{ $promise: v }` value settles as a promise, calls land in `__symbioteNativeCalls`
const REGISTRY_SOURCE = `const modules = ${JSON.stringify(STUBBED_NATIVE_MODULES)};
const settle = value =>
  value !== null && typeof value === 'object' && '$promise' in value
    ? Promise.resolve(value.$promise)
    : value;
function stub(name) {
  const { constants = {}, returns = {} } = modules[name];
  return new Proxy({ getConstants: () => constants }, {
    get(target, key) {
      if (key in target || typeof key !== 'string' || key === 'then') return target[key];
      return (...args) => {
        (globalThis.__symbioteNativeCalls ??= []).push({ module: name, method: key, args });
        return settle(returns[key]);
      };
    },
  });
}
export function get(name) {
  return name in modules ? stub(name) : null;
}
export function getEnforcing(name) {
  if (name in modules) return stub(name);
  throw new Error("TurboModuleRegistry.getEnforcing(...): '" + name + "' could not be found.");
}
export default { get, getEnforcing };`;

// Metro picks `X.ios.js` for `./X`, so RN's own files get the same pin as `Platform`
function iosVariantOf(source: string, importer: string): string | null {
  if (!source.startsWith('.')) return null;
  const variant = resolve(dirname(importer.split('?')[0]), `${source}.ios.js`);
  return existsSync(variant) ? variant : null;
}

const REACT_NATIVE_PLATFORM = {
  name: 'react-native-platform-ios',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined) {
    if (source === REGISTRY_ID || source === NATIVE_MODULES_ID) return source;
    if (importer == null) return null;
    if (!RN_SOURCE.test(importer.split('?')[0])) return null;
    if (/(^|\/)TurboModuleRegistry$/.test(source)) return REGISTRY_ID;
    if (/(^|\/)BatchedBridge\/NativeModules$/.test(source)) {
      return NATIVE_MODULES_ID;
    }
    if (/(^|\/)Platform(\.js)?$/.test(source)) return RN_PLATFORM_IOS;
    return iosVariantOf(source, importer);
  },
  load(id: string) {
    if (id === REGISTRY_ID) return REGISTRY_SOURCE;
    return id === NATIVE_MODULES_ID ? 'export default {};' : null;
  },
};

const SHARED = {
  oxc: { decorator: { legacy: true } },
  plugins: [REACT_NATIVE_FLOW, REACT_NATIVE_PLATFORM],
  test: {
    environment: 'node' as const,
    // `vitest.setup.ts` defines `__DEV__`, which react-native's own source reads bare
    setupFiles: ['./vitest.setup.ts', './vitest.rn-host.setup.ts'],
    server: { deps: { inline: [/@symbiote-native\//, /react-native/] } },
  },
};

// svelte's "." export splits on a `browser` condition, the SSR runtime throws in `mount()`
// Vitest reads `ssr.resolve.conditions`, so both `resolve` and `ssr.resolve` set it
// Metro needs the equivalent `conditionNames` fix, see the svelte-adapter-dom-shim skill

// Scoped to the svelte project: `less`/`sass`/`stylus` list a `browser` key first in their exports
// A global condition would resolve them to browser bundles that fail under Node
const BROWSER_CONDITIONS = {
  resolve: { conditions: ['browser'] },
  ssr: { resolve: { conditions: ['browser'] } },
};

export default defineConfig({
  ...SHARED,
  test: {
    ...SHARED.test,
    projects: [
      {
        ...SHARED,
        ...BROWSER_CONDITIONS,
        test: {
          ...SHARED.test,
          name: 'svelte',
          include: SVELTE_TESTS,
          exclude: EXCLUDE_ALL,
          benchmark: { include: SVELTE_BENCH, exclude: EXCLUDE_ALL },
        },
      },
      {
        ...SHARED,
        ...BROWSER_CONDITIONS,
        // `plugins` is replaced, not merged, so every react-native plugin is restated here
        plugins: [REACT_NATIVE_FLOW, REACT_NATIVE_PLATFORM, SOLID_TRANSFORM],
        test: {
          ...SHARED.test,
          name: 'solid',
          include: SOLID_TESTS,
          exclude: EXCLUDE_ALL,
        },
      },
      {
        ...SHARED,
        test: {
          ...SHARED.test,
          name: 'default',
          include: INCLUDE_ALL,
          exclude: [...EXCLUDE_ALL, ...SVELTE_TESTS, ...SOLID_TESTS],
          benchmark: {
            include: BENCH_ALL,
            exclude: [...EXCLUDE_ALL, ...SVELTE_BENCH],
          },
        },
      },
    ],
  },
});
