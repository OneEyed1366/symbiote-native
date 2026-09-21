import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applySplashScreenAppHide } from './apply-splash-screen-hide.js';

describe('applySplashScreenAppHide', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setupApp(
    fileName: string,
    content: string,
  ): { root: string; appPath: string } {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-splash-hide-'),
    );
    tmpDirs.push(root);
    const appPath = path.join(root, fileName);
    fs.writeFileSync(appPath, content);
    return { root, appPath };
  }

  const REACT_APP = `export default function App() {\n  return null;\n}\n`;

  // why: `add --splash-screen` re-running with --force (an already-added layer being reapplied,
  // same semantics fixed for the layer-resolution bug earlier) must not double the hide() import
  // and call — that would be a second, redundant `useEffect` wired on top of the first.
  it('is idempotent — running it twice leaves exactly one hide() call', () => {
    const { root, appPath } = setupApp('App.tsx', REACT_APP);
    applySplashScreenAppHide(root, { framework: 'react' });
    applySplashScreenAppHide(root, { framework: 'react' });
    const source = fs.readFileSync(appPath, 'utf8');
    expect(source.match(/hide\(\)/g)).toHaveLength(1);
  });

  // why: a vue app's flavor (SFC `.vue` vs. render-function `.tsx`) is fully determined by the
  // App file's own extension — no separate flavor input needed, which is what lets `add` (which
  // only ever sees a real app on disk, never a --vue-flavor flag) wire this in too.
  it('detects vue SFC from the .vue extension without an explicit flavor option', () => {
    const sfcApp = `<script setup>\n</script>\n<template>\n  <View />\n</template>\n`;
    const { root, appPath } = setupApp('App.vue', sfcApp);
    applySplashScreenAppHide(root, { framework: 'vue' });
    const source = fs.readFileSync(appPath, 'utf8');
    expect(source).toContain('@symbiote-native/splash-screen/vue');
    expect(source).toContain('onMounted(() => hide())');
  });

  it('detects vue TSX flavor from the .tsx extension without an explicit flavor option', () => {
    const tsxApp = `export default {\n  setup() {\n    return () => null;\n  },\n};\n`;
    const { root, appPath } = setupApp('App.tsx', tsxApp);
    applySplashScreenAppHide(root, { framework: 'vue' });
    const source = fs.readFileSync(appPath, 'utf8');
    expect(source).toContain('onMounted(() => hide())');
  });

  // why: Svelte's own App.svelte hides with a bare top-level `hide()` (no lifecycle wrapper) —
  // the framework's runes already re-run script-block code only once per mount, so wrapping it in
  // `onMount`/`$effect` would be redundant, not wrong-but-different.
  it('wires a bare hide() call inside the script block for svelte', () => {
    const svelteApp = `<script lang="ts">\n  let count = $state(0);\n</script>\n<template />\n`;
    const { root, appPath } = setupApp('App.svelte', svelteApp);
    applySplashScreenAppHide(root, { framework: 'svelte' });
    const source = fs.readFileSync(appPath, 'utf8');
    expect(source).toContain('@symbiote-native/splash-screen/svelte');
    expect(source).toMatch(/^\s*hide\(\);\s*$/m);
  });

  it('wires onMount() for solid', () => {
    const solidApp = `export default function App() {\n  return null;\n}\n`;
    const { root, appPath } = setupApp('App.tsx', solidApp);
    applySplashScreenAppHide(root, { framework: 'solid' });
    const source = fs.readFileSync(appPath, 'utf8');
    expect(source).toContain("@symbiote-native/splash-screen';");
    expect(source).toContain('onMount(() => {\n    hide();\n  });');
  });

  it('wires ngOnInit() for angular', () => {
    const angularApp = `import { Component } from '@angular/core';\n\n@Component({})\nexport class AppComponent {\n}\n`;
    const { root, appPath } = setupApp('App.ts', angularApp);
    applySplashScreenAppHide(root, { framework: 'angular' });
    const source = fs.readFileSync(appPath, 'utf8');
    expect(source).toContain('@symbiote-native/splash-screen/angular');
    expect(source).toContain('implements OnInit');
    expect(source).toContain('ngOnInit(): void {\n    hide();\n  }');
  });
});
