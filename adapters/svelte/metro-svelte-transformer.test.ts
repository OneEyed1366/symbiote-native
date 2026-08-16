// Covers compileSvelteFile's compiler-option contract with the official custom-renderer API
// (svelte-adapter-custom-renderer skill): `experimental.customRenderer` must produce output that
// imports our renderer and dispatches through it, and the generated module must import from
// 'svelte/internal/client' with zero framework-import rewriting (unlike metro-vue-transformer.cjs,
// which retargets every `from 'vue'`). The rest of the transformer (upstream delegation,
// style-file routing) is exercised by the canary build itself, mirroring
// metro-vue-transformer.test.ts's own scoping note.
import { describe, expect, it } from 'vitest';
import metroSvelteTransformer from './metro-svelte-transformer.cjs';

const {
  compileSvelteFile,
  compileSvelteModuleFile,
  transform,
}: {
  compileSvelteFile: (src: string, filename: string) => Promise<string>;
  compileSvelteModuleFile: (src: string, filename: string) => Promise<string>;
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

<symbiote-view>
  <symbiote-text>{label}</symbiote-text>
</symbiote-view>
`;

describe('compileSvelteFile', () => {
  it('imports the client runtime, never the server/SSR build', async () => {
    const code = await compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
    expect(code).toContain("from 'svelte/internal/client'");
    expect(code).not.toContain('svelte/internal/server');
  });

  it('imports our renderer and pushes it at the top of the compiled component', async () => {
    const code = await compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
    expect(code).toContain("import $renderer from '@symbiote-native/svelte/renderer'");
    expect(code).toContain('push_renderer($renderer)');
  });

  it('routes symbiote-* props through the renderer, never set_custom_element_data', async () => {
    const code = await compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
    expect(code).not.toContain('set_custom_element_data');
  });

  it('strips <script lang="ts"> types with no external file resolution', async () => {
    // Unlike @vue/compiler-sfc's compileScript, this never needs registerTS/a real `fs` for a
    // type-only import from another file — Svelte 5's compiler erases TS structurally.
    const code = await compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
    expect(code).not.toContain(': string');
    expect(code).not.toContain('$props<');
  });
});

describe('transform', () => {
  it('compiles a .svelte file end-to-end through the upstream RN babel transformer', async () => {
    const result = await transform({
      filename: 'Demo.svelte',
      src: COMPONENT_SOURCE,
      options: { dev: true, minify: false, platform: 'ios', projectRoot: process.cwd() },
    });
    expect(result).toBeDefined();
  });

  it('passes a non-.svelte file straight to the upstream transformer unchanged', async () => {
    const result = await transform({
      filename: 'plain.ts',
      src: 'export const x = 1;',
      options: { dev: true, minify: false, platform: 'ios', projectRoot: process.cwd() },
    });
    expect(result).toBeDefined();
  });
});

// Regression coverage for the previously-missing .svelte.ts/.svelte.js branch: these files
// (adapters/svelte/src/runes/*.svelte.ts and any package's own runes, e.g.
// packages/splash-screen/src/svelte/runes) carry rune syntax outside a component's markup and
// need compileModule(), not compile() — a bare $state/$effect call left uncompiled hits
// svelte/index-client.js's dev-guard export and throws `rune_outside_svelte` at runtime. Before
// this fix, filename.endsWith('.svelte') was false for these files, so they fell through to the
// plain upstream transformer and shipped uncompiled. Deliberately includes real TS syntax
// (return type, import type) — compileModule() cannot parse TypeScript at all (verified directly:
// it throws js_parse_error on a bare return-type annotation regardless of the .ts filename), so
// this also exercises the ts.transpileModule() strip step in front of it.
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

describe('compileSvelteModuleFile', () => {
  it('strips TS types and desugars $state/$effect into real svelte/internal/client calls', async () => {
    const code = await compileSvelteModuleFile(RUNE_MODULE_SOURCE, 'use-counter.svelte.ts');
    expect(code).toContain("from 'svelte/internal/client'");
    expect(code).not.toContain('$state(');
    expect(code).not.toContain('$effect(');
    expect(code).not.toContain(': number');
    expect(code).not.toContain('Ref');
  });
});

describe('transform (.svelte.ts / .svelte.js)', () => {
  it('routes a .svelte.ts rune module through compileModule, not the plain upstream transformer', async () => {
    const result = await transform({
      filename: 'use-counter.svelte.ts',
      src: RUNE_MODULE_SOURCE,
      options: { dev: true, minify: false, platform: 'ios', projectRoot: process.cwd() },
    });
    expect(result).toBeDefined();
  });
});

// The compiler itself now rejects these constructs at compile time (`experimental.
// customRenderer` — svelte-adapter-custom-renderer skill), replacing the retired
// forbid-web-only-constructs.ts preprocessor. `{@html}` is the case that made a build-time gate
// mandatory rather than nice-to-have in the old shim world: it was not inert there, it compiled
// fine and then painted nothing. Under the real API it is a hard compile error instead.
describe('transform rejects web-only constructs at build time', () => {
  const options = { dev: true, minify: false, platform: 'ios', projectRoot: process.cwd() };

  it('lets an ordinary component through', async () => {
    await expect(
      transform({ filename: 'Demo.svelte', src: COMPONENT_SOURCE, options }),
    ).resolves.toBeDefined();
  });

  it('rejects {@html} before it can compile to a silent no-op', async () => {
    await expect(
      transform({
        filename: 'Bad.svelte',
        src: `<script lang="ts">const markup = '<b>hi</b>';</script>{@html markup}`,
        options,
      }),
    ).rejects.toThrow(/@html/);
  });

  it('rejects <svelte:head>, which has no meaning on a native tree', async () => {
    await expect(
      transform({
        filename: 'Head.svelte',
        src: '<svelte:head><title>x</title></svelte:head>',
        options,
      }),
    ).rejects.toThrow(/svelte:head/);
  });

  it('rejects bind:this on a raw host tag, which the custom renderer cannot support', async () => {
    await expect(
      transform({
        filename: 'BadBind.svelte',
        src: `<script lang="ts">let hostRef = $state.raw(null);</script><symbiote-view bind:this={hostRef} />`,
        options,
      }),
    ).rejects.toThrow(/bind:/);
  });
});
