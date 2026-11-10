import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import babel from '@babel/core';
import ts from 'typescript';

// Kept apart from vitest.config.ts so that file stays on the projects: what the package under
// packages/reanimated needs to run its tests, and the demo screens of the examples
const require_ = createRequire(import.meta.url);

// Reanimated reads `react-native` and `react-native-worklets` at module scope, so the bare names
// move to a stub and to the worklets Jest mock while deep `react-native/...` imports stay real
export const REANIMATED_TESTS = ['packages/reanimated/**/*.test.{ts,tsx}'];

// Each framework's lifecycle files need its own plugin and conditions, so it gets a project
export const REANIMATED_SVELTE_TESTS = [
  'packages/reanimated/**/src/svelte/**/*.test.{ts,tsx}',
];
export const REANIMATED_SOLID_TESTS = [
  'packages/reanimated/**/src/solid/**/*.test.{ts,tsx}',
];

// The package source and the demo screens of the examples get the plugin an app's Metro runs,
// so a test drives them as written. Tests stay out: they build their worklets by hand
const REANIMATED_SOURCE =
  /\/(packages\/reanimated\/src|examples\/(react|solid|angular\/src)\/screens\/(reanimated|ReanimatedScreen))[/.].*\.?tsx?$/;
const WORKLETS_PLUGIN = require_.resolve('react-native-worklets/plugin');
const symbioteVueJsx = require_('./adapters/vue/babel-jsx.cjs');

type IParserPlugin = NonNullable<
  NonNullable<babel.TransformOptions['parserOpts']>['plugins']
>[number];

// The types stay in for the step of Vite that strips them after this one
const TS_SYNTAX = [
  'typescript',
  'jsx',
  'decorators-legacy',
] as const satisfies readonly IParserPlugin[];
const TSX_SYNTAX = [
  'typescript',
  'jsx',
] as const satisfies readonly IParserPlugin[];

type IBabelStep = {
  name: string;
  enforce: 'pre' | 'post';
  matches: (file: string) => boolean;
  syntax: readonly IParserPlugin[];
  plugins: unknown[];
  // A compile the file needs before babel sees it
  prepare?: (code: string, file: string) => Promise<string>;
};

// One pass of babel over a source file, with the steps an app's Metro runs on it
function babelStep({
  name,
  enforce,
  matches,
  syntax,
  plugins,
  prepare,
}: IBabelStep) {
  return {
    name,
    enforce,
    async transform(code: string, id: string) {
      const file = id.split('?')[0];
      if (!matches(file)) return null;
      const out = await babel.transformAsync(
        await (prepare?.(code, file) ?? code),
        {
          filename: file,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          parserOpts: { plugins: [...syntax] },
          plugins: [...plugins],
        },
      );
      return out?.code == null ? null : { code: out.code, map: out.map };
    },
  };
}

export const REANIMATED_WORKLETS = babelStep({
  name: 'worklets-plugin-for-reanimated-source',
  enforce: 'pre',
  matches: file => REANIMATED_SOURCE.test(file) && !/\.test\.tsx?$/.test(file),
  syntax: TS_SYNTAX,
  plugins: [WORKLETS_PLUGIN],
});

// The Svelte demo is a component, so the plugin runs on what the Svelte compiler emitted
const SVELTE_DEMO =
  /\/examples\/svelte\/screens\/(ReanimatedScreen|reanimated\/\w+)\.svelte$/;

export const REANIMATED_SVELTE_WORKLETS = babelStep({
  name: 'worklets-plugin-for-the-svelte-demo',
  enforce: 'post',
  matches: file => SVELTE_DEMO.test(file),
  syntax: [],
  plugins: [WORKLETS_PLUGIN],
});

// The Vue TSX demo needs the JSX pair its babel.config.js lists, then the worklets plugin
const VUE_TSX_DEMO =
  /\/examples\/vue-tsx\/(screens\/(ReanimatedScreen|reanimated\/\w+)|components\/ActionButton)\.tsx$/;

export const REANIMATED_VUE_TSX = babelStep({
  name: 'vue-jsx-and-worklets-for-the-vue-tsx-demo',
  enforce: 'pre',
  matches: file => VUE_TSX_DEMO.test(file),
  syntax: TSX_SYNTAX,
  plugins: [...symbioteVueJsx(), WORKLETS_PLUGIN],
});

// The Vue SFC demo goes through the compile Metro runs, then loses its types, then gets the plugin
// `.vue` is no type Vite strips, so the TypeScript step has to be this one
const VUE_SFC_DEMO =
  /\/examples\/vue-sfc\/(screens\/(ReanimatedScreen|reanimated\/\w+)|components\/ActionButton)\.vue$/;

async function compileVueSfc(code: string, file: string): Promise<string> {
  const { compileSfc } = require_('./adapters/vue/metro-vue-transformer.cjs');
  const compiled: string = await compileSfc(code, file);
  return ts.transpileModule(compiled, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
}

export const REANIMATED_VUE_SFC = babelStep({
  name: 'vue-sfc-and-worklets-for-the-vue-sfc-demo',
  enforce: 'pre',
  matches: file => VUE_SFC_DEMO.test(file),
  syntax: [],
  plugins: [WORKLETS_PLUGIN],
  prepare: compileVueSfc,
});

// The demos of Angular, Svelte, Solid and Vue may have an install of their own
// A second copy of a framework splits its reactive graph, so a bare import is read from the package
const EXAMPLE_TREE = /\/examples\/(angular|svelte|solid|vue-tsx|vue-sfc)\//;
// The Vue JSX output imports `vue`, which an app's metro.config.js points at the runtime package
const VUE_ENTRY = 'vue';
const VUE_RUNTIME = '@vue/runtime-core';
const PACKAGE_ANCHOR = join(
  import.meta.dirname,
  'packages/reanimated/package.json',
);

export const EXAMPLE_IMPORTS = {
  name: 'examples-read-the-package-installs',
  enforce: 'pre' as const,
  async resolveId(
    this: { resolve: (...args: unknown[]) => Promise<unknown> },
    source: string,
    importer: string | undefined,
    options: object,
  ) {
    const isBare = !source.startsWith('.') && !source.startsWith('/');
    if (importer == null || !isBare || !EXAMPLE_TREE.test(importer))
      return null;
    const name = source === VUE_ENTRY ? VUE_RUNTIME : source;
    return this.resolve(name, PACKAGE_ANCHOR, { ...options, skipSelf: true });
  },
};

// The serializing code of worklets as it ships imports its `.native` siblings by the bare name
// Only a test that runs it as shipped reaches it; Metro picks the same siblings on a device
const WORKLETS_SERIALIZER =
  /react-native-worklets\/src\/memory\/serializable\.native\.ts$/;

export const WORKLETS_NATIVE_SIBLINGS = {
  name: 'worklets-native-siblings',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined) {
    if (importer == null || !source.startsWith('.')) return null;
    const file = importer.split('?')[0];
    if (!WORKLETS_SERIALIZER.test(file)) return null;
    const sibling = `${resolve(dirname(file), source)}.native.ts`;
    return existsSync(sibling) ? sibling : null;
  },
};

// A rune only works in a module the Svelte compiler has seen, and Metro runs these very steps
export const SVELTE_MODULES = {
  name: 'svelte-modules',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    const file = id.split('?')[0];
    const isComponent = file.endsWith('.svelte');
    if (!isComponent && !file.endsWith('.svelte.ts')) return null;
    const transformer = require_(
      './adapters/svelte/metro-svelte-transformer.cjs',
    );
    const compiled = isComponent
      ? transformer.compileSvelteFile(code, file)
      : transformer.compileSvelteModuleFile(code, file);
    return { code: compiled, map: null };
  },
};

// The demo sits in a tree that installs its own react and published packages, so its imports
// go to the workspace here, or it would render against a second react
export const REANIMATED_ALIAS = [
  { find: /^react$/, replacement: require_.resolve('react') },
  {
    find: /^@symbiote-native\/react\/jsx-runtime$/,
    replacement: require_.resolve('./adapters/react/src/jsx-runtime.ts'),
  },
  {
    find: /^@symbiote-native\/react\/jsx-dev-runtime$/,
    replacement: require_.resolve('./adapters/react/src/jsx-dev-runtime.ts'),
  },
  {
    find: /^@symbiote-native\/reanimated\/react$/,
    replacement: require_.resolve('./packages/reanimated/src/react/index.ts'),
  },
  {
    find: /^@symbiote-native\/reanimated\/angular$/,
    replacement: require_.resolve('./packages/reanimated/src/angular/index.ts'),
  },
  {
    find: /^@symbiote-native\/reanimated\/vue$/,
    replacement: require_.resolve('./packages/reanimated/src/vue/index.ts'),
  },
  {
    find: /^@symbiote-native\/reanimated\/svelte$/,
    replacement: require_.resolve('./packages/reanimated/src/svelte/index.ts'),
  },
  {
    find: /^@symbiote-native\/reanimated$/,
    replacement: require_.resolve('./packages/reanimated/src/core/index.ts'),
  },
  {
    find: /^react-native$/,
    replacement: require_.resolve(
      './packages/reanimated/test-support/react-native.ts',
    ),
  },
  {
    find: /^react-native-worklets$/,
    replacement: join(
      dirname(require_.resolve('react-native-worklets/package.json')),
      'src',
      'mock.ts',
    ),
  },
];

// The Solid demo is a standalone tree with no install of its own, so the packages it names are the
// workspace ones
export const REANIMATED_SOLID_ALIAS = [
  ...REANIMATED_ALIAS,
  {
    find: /^@symbiote-native\/solid\/renderer$/,
    replacement: require_.resolve('./adapters/solid/src/renderer.ts'),
  },
  {
    find: /^@symbiote-native\/solid\/jsx-(dev-)?runtime$/,
    replacement: require_.resolve('./adapters/solid/src/jsx-runtime.ts'),
  },
  {
    find: /^@symbiote-native\/solid$/,
    replacement: require_.resolve('./adapters/solid/src/index.ts'),
  },
  {
    find: /^@symbiote-native\/reanimated\/solid$/,
    replacement: require_.resolve('./packages/reanimated/src/solid/index.ts'),
  },
];
