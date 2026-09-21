import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IFramework } from '../types.js';

// react-native-bootsplash's native splash screen never hides itself — it stays up until JS calls
// hide(), same lifecycle-hook shape in every real example (examples/react's useEffect, .../
// vue-sfc's onMounted, .../angular's ngOnInit, .../solid's onMount, .../svelte's bare top-level
// call). --splash-screen's native/ overlay never touched the App entry, so a scaffolded app would
// freeze on the splash screen forever. Text-splice, not a js/ layer overlay, for the same reason
// apply-expo-modules-manifest.ts splices AndroidManifest.xml: --navigation's own app/<framework>
// overlay already renders the SAME App file, --styling's css-modules/stylesheet variants overlay
// it AGAIN afterward, and renderTemplate overwrites rather than merges — this must run after both,
// against whatever App file is actually on disk.
const SKIPPED_DIR_NAMES: ReadonlySet<string> = new Set([
  'ios',
  'android',
  'node_modules',
]);
const APP_COMPONENT_FILENAMES: ReadonlySet<string> = new Set([
  'App.tsx',
  'App.jsx',
  'App.ts',
  'App.vue',
  'App.svelte',
]);

function findAppComponentFile(dir: string): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
      const found = findAppComponentFile(entryPath);
      if (found !== undefined) return found;
      continue;
    }
    if (APP_COMPONENT_FILENAMES.has(entry.name)) return entryPath;
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Every base/navigation/css-modules/stylesheet App variant either already imports something
// named from `moduleSpecifier` (merge the name in) or imports nothing from it at all (fall back
// to inserting a whole new import line). `insertFallback` lets vue-sfc/svelte place that fallback
// INSIDE their <script> block instead of at the file's absolute top, which would land outside it.
function insertOrMergeNamedImport(
  source: string,
  moduleSpecifier: string,
  name: string,
  insertFallback: (source: string, importLine: string) => string = (
    src,
    line,
  ) => `${line}\n${src}`,
): string {
  const importLineRegex = new RegExp(
    `import \\{ ([^}]*) \\} from '${escapeRegExp(moduleSpecifier)}';`,
  );
  const match = source.match(importLineRegex);
  if (match?.[1] !== undefined) {
    const names = match[1];
    if (
      names
        .split(',')
        .map(n => n.trim())
        .includes(name)
    ) {
      return source;
    }
    return source.replace(
      importLineRegex,
      `import { ${names}, ${name} } from '${moduleSpecifier}';`,
    );
  }
  return insertFallback(
    source,
    `import { ${name} } from '${moduleSpecifier}';`,
  );
}

function patchReact(source: string): string {
  const withLifecycleImport = insertOrMergeNamedImport(
    source,
    'react',
    'useEffect',
  );
  const withHideImport = `import { hide } from '@symbiote-native/splash-screen/react';\n${withLifecycleImport}`;
  return withHideImport.replace(
    'export default function App() {',
    'export default function App() {\n  useEffect(() => {\n    hide();\n  }, []);\n',
  );
}

function patchSolid(source: string): string {
  const withLifecycleImport = insertOrMergeNamedImport(
    source,
    'solid-js',
    'onMount',
  );
  const withHideImport = `import { hide } from '@symbiote-native/splash-screen';\n${withLifecycleImport}`;
  return withHideImport.replace(
    'export default function App() {',
    'export default function App() {\n  onMount(() => {\n    hide();\n  });\n',
  );
}

function patchVueTsx(source: string): string {
  const withLifecycleImport = insertOrMergeNamedImport(
    source,
    '@vue/runtime-core',
    'onMounted',
  );
  const withHideImport = `import { hide } from '@symbiote-native/splash-screen/vue';\n${withLifecycleImport}`;
  return withHideImport.replace(
    'setup() {',
    'setup() {\n    onMounted(() => hide());\n',
  );
}

const SCRIPT_OPEN_TAG = /<script setup(?: lang="ts")?>/;

function patchVueSfc(source: string): string {
  const withLifecycleImport = insertOrMergeNamedImport(
    source,
    'vue',
    'onMounted',
    (src, line) => src.replace(SCRIPT_OPEN_TAG, tag => `${tag}\n${line}`),
  );
  return withLifecycleImport.replace(
    '</script>',
    `import { hide } from '@symbiote-native/splash-screen/vue';\nonMounted(() => hide());\n</script>`,
  );
}

const ANGULAR_CORE_IMPORT = /import \{ ([^}]*) \} from '@angular\/core';/;

function patchAngular(source: string): string {
  const withOnInit = source.replace(
    ANGULAR_CORE_IMPORT,
    (line, specifiers: string) =>
      specifiers.includes('OnInit')
        ? line
        : `import { ${specifiers}, OnInit } from '@angular/core';`,
  );
  const withHideImport = withOnInit.replace(
    ANGULAR_CORE_IMPORT,
    line =>
      `${line}\nimport { hide } from '@symbiote-native/splash-screen/angular';`,
  );
  return withHideImport.replace(
    'export class AppComponent {',
    'export class AppComponent implements OnInit {\n  ngOnInit(): void {\n    hide();\n  }\n',
  );
}

function patchSvelte(source: string): string {
  return source.replace(
    '</script>',
    `  import { hide } from '@symbiote-native/splash-screen/svelte';\n  hide();\n</script>`,
  );
}

export type IApplySplashScreenHideOptions = {
  readonly framework: IFramework;
};

export function applySplashScreenAppHide(
  root: string,
  options: IApplySplashScreenHideOptions,
): void {
  const appFilePath = findAppComponentFile(root);
  if (appFilePath === undefined) return;
  const source = fs.readFileSync(appFilePath, 'utf8');
  // Idempotent: `add --splash-screen --force` re-runs this layer on an app that already has it.
  if (/\bhide\(\)/.test(source)) return;
  fs.writeFileSync(appFilePath, patch(source, options.framework, appFilePath));
}

function patch(
  source: string,
  framework: IFramework,
  appFilePath: string,
): string {
  switch (framework) {
    case 'react':
      return patchReact(source);
    case 'solid':
      return patchSolid(source);
    case 'angular':
      return patchAngular(source);
    case 'svelte':
      return patchSvelte(source);
    case 'vue':
      // SFC (`App.vue`) vs. the render-function flavor (`App.tsx`) is fully determined by the
      // file's own extension — no separate flavor input needed.
      return appFilePath.endsWith('.vue')
        ? patchVueSfc(source)
        : patchVueTsx(source);
  }
}
