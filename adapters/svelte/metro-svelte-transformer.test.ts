// Covers compileSvelteFile's compiler-option contract with the DOM shim (svelte-adapter-dom-shim
// skill §2/§10): fragments:'tree' must produce from_tree(), never from_html(), and the generated
// module must import from 'svelte/internal/client' with zero framework-import rewriting (unlike
// metro-vue-transformer.cjs, which retargets every `from 'vue'`). Standalone style-file routing
// (isStyleFile/compileCssFile) is intentionally out of scope here — it is core/css-parser's own
// unit and the canary build exercises it end-to-end, mirroring metro-vue-transformer.test.ts's
// identical scoping (that file likewise never drives its transformer's standalone-CSS branch).
import { describe, expect, it } from 'vitest';
import metroSvelteTransformer from './metro-svelte-transformer.cjs';

const {
  compileSvelteFile,
  compileSvelteModuleFile,
  transform,
}: {
  compileSvelteFile: (src: string, filename: string) => string;
  compileSvelteModuleFile: (src: string, filename: string) => string;
  transform: (params: {
    filename: string;
    src: string;
    options: Record<string, unknown>;
  }) => Promise<unknown>;
} = metroSvelteTransformer;

const COMPONENT_SOURCE = `
<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<symbiote-view p={{}}>
  <symbiote-text p={{}}>{label}</symbiote-text>
</symbiote-view>
`;

const TRANSFORM_OPTIONS = { dev: true, minify: false, platform: 'ios', projectRoot: process.cwd() };

// No Negative group: compileSvelteFile has no guard of its own, it always compiles what it is
// given. The build-time reject path lives one layer up, inside transform() — see below.
describe('compileSvelteFile', () => {
  describe('Positive', () => {
    it('imports the client runtime, never the server/SSR build', () => {
      // why: svelte's package.json export map splits '.' on a `browser` condition — resolving
      // the SSR build would crash mount() at runtime with lifecycle_function_unavailable
      // (svelte-adapter-dom-shim skill §15). That split is a property of the compiled OUTPUT,
      // not of module resolution, so it has to be asserted on the generated code directly.
      const code = compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
      expect(code).toContain("from 'svelte/internal/client'");
      expect(code).not.toContain('svelte/internal/server');
    });

    it('emits from_tree (fragments: "tree"), never from_html', () => {
      // why: from_html assigns innerHTML on a <template>, which the shim implements no HTML
      // parser for; from_tree builds element-by-element via document.createElement, the only
      // path the shim supports (skill §2/§3d). Losing this option ships a component that
      // throws on its very first mount.
      const code = compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
      expect(code).toContain('from_tree(');
      expect(code).not.toContain('from_html(');
    });

    it('routes symbiote-* custom-element props through set_custom_element_data', () => {
      // why: every symbiote-* tag is hyphenated, so Svelte's compiler takes the custom-element
      // codegen path (skill §3g) instead of plain set_attribute — losing this would stringify
      // the object prop bag instead of setting it as a real property.
      const code = compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
      expect(code).toContain("set_custom_element_data(symbiote_view, 'p'");
      expect(code).toContain("set_custom_element_data(symbiote_text, 'p'");
    });

    it('strips <script lang="ts"> types with no external file resolution', () => {
      // why: unlike @vue/compiler-sfc's compileScript, this transformer needs no registerTS/a
      // real `fs` for a type-only import from another file — Svelte 5 erases TS structurally,
      // so no TypeScript/filesystem wiring belongs here the way metro-vue-transformer.cjs needs.
      const code = compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
      expect(code).not.toContain(': string');
      expect(code).not.toContain('$props<');
    });
  });
});

// Regression coverage for the previously-missing .svelte.ts/.svelte.js branch: these files
// (adapters/svelte/src/runes/*.svelte.ts and any package's own runes, e.g.
// packages/splash-screen/src/svelte/runes) carry rune syntax outside a component's markup and
// need compileModule(), not compile() — a bare $state/$effect call left uncompiled hits
// svelte/index-client.js's dev-guard export and throws `rune_outside_svelte` at runtime. Before
// this fix, filename.endsWith('.svelte') was false for these files, so they fell through to the
// plain upstream transformer and shipped uncompiled. Deliberately includes real TS syntax
// (return type, import type) — compileModule() cannot parse TypeScript at all (verified directly
// against svelte@5.56.8: it throws js_parse_error on a bare return-type annotation regardless of
// the .ts filename), so this also exercises the ts.transpileModule() strip step in front of it.
const RUNE_MODULE_SOURCE = `
import type { Ref } from './types';
export function useCounter(): number {
  let count: number = $state(0);
  $effect(() => {
    count = count;
  });
  return count;
}
`;

// Same shape as compileSvelteFile: no Negative group, compileSvelteModuleFile validates nothing
// of its own.
describe('compileSvelteModuleFile', () => {
  describe('Positive', () => {
    it('strips TS types and desugars $state/$effect into real svelte/internal/client calls', () => {
      // why: this is the exact branch transform() must route rune-only files through instead
      // of the plain upstream transformer — proves the desugar itself happens, not just that
      // transform() picked the right function to call.
      const code = compileSvelteModuleFile(RUNE_MODULE_SOURCE, 'use-counter.svelte.ts');
      expect(code).toContain("from 'svelte/internal/client'");
      expect(code).not.toContain('$state(');
      expect(code).not.toContain('$effect(');
      expect(code).not.toContain(': number');
      expect(code).not.toContain('Ref');
    });
  });
});

describe('transform', () => {
  describe('Positive', () => {
    it('compiles a .svelte file end-to-end through the upstream RN babel transformer', async () => {
      // why: this is the actual Metro entry point a consuming app's bundler calls — proves the
      // whole chain (guard -> style preprocess -> compile -> upstream RN transform) resolves
      // together, not just compile() in isolation.
      const result = await transform({
        filename: 'Demo.svelte',
        src: COMPONENT_SOURCE,
        options: TRANSFORM_OPTIONS,
      });
      expect(result).toBeDefined();
    });

    it('passes a non-.svelte file straight to the upstream transformer unchanged', async () => {
      // why: this transformer sits in front of EVERY file Metro compiles in a Svelte app, not
      // just .svelte ones — an ordinary .ts module must reach RN's own transformer untouched,
      // with no Svelte-specific step in its way.
      const result = await transform({
        filename: 'plain.ts',
        src: 'export const x = 1;',
        options: TRANSFORM_OPTIONS,
      });
      expect(result).toBeDefined();
    });

    it('routes a .svelte.ts rune module through compileModule, not the plain upstream transformer', async () => {
      // why: the regression this file exists to pin (see RUNE_MODULE_SOURCE's own comment) — a
      // rune module falling through to the plain transformer ships a literal `$state(...)`
      // call that throws `rune_outside_svelte` on a real device.
      const result = await transform({
        filename: 'use-counter.svelte.ts',
        src: RUNE_MODULE_SOURCE,
        options: TRANSFORM_OPTIONS,
      });
      expect(result).toBeDefined();
    });
  });

  // The web-only-construct guard is registered in svelte.config.js's `preprocess` too, but that
  // only reaches tooling that reads svelte.config.js — svelte-check, the language server. A
  // consuming app bundles through THIS function, so the gate has to hold here or an app whose own
  // config never registers the preprocessor ships a screen that renders nothing. `{@html}` is the
  // case that made this mandatory rather than nice-to-have: it is not inert, it compiles fine and
  // then paints nothing (svelte-adapter-dom-shim skill §22d). The ordinary-component baseline is
  // already proven above ('compiles a .svelte file end-to-end...'), so this group is Negative only.
  describe('Negative — rejects web-only constructs at build time', () => {
    it('rejects {@html} before it can compile to a silent no-op', async () => {
      // why: {@html} compiles cleanly and then paints nothing (it assigns an innerHTML the
      // shim does not implement) — a silent no-op on device is worse than a build failure, so
      // the guard must reject before compile() ever runs.
      await expect(
        transform({
          filename: 'Bad.svelte',
          src: `<script lang="ts">const markup = '<b>hi</b>';</script>{@html markup}`,
          options: TRANSFORM_OPTIONS,
        }),
      ).rejects.toThrow(/@html/);
    });

    it('rejects <svelte:head>, which has no meaning on a native tree', async () => {
      // why: <svelte:head> targets a document.head RN has no equivalent for; letting it
      // compile would ship a component whose head content silently reaches nowhere.
      await expect(
        transform({
          filename: 'Head.svelte',
          src: '<svelte:head><title>x</title></svelte:head>',
          options: TRANSFORM_OPTIONS,
        }),
      ).rejects.toThrow(/svelte:head/);
    });
  });
});
