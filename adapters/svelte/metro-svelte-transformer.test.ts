// Compiler-option contract of `compileSvelteFile`, `fragments: 'tree'` plus `customRenderer`
// Standalone style-file routing is the css-parser's own unit, so it is not covered here
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

<view p={{}}>
  <text p={{}}>{label}</text>
</view>
`;

const TRANSFORM_OPTIONS = {
  dev: true,
  minify: false,
  platform: 'ios',
  projectRoot: process.cwd(),
};

// No Negative group, `compileSvelteFile` has no guard of its own, the reject path is in `transform`
describe('compileSvelteFile', () => {
  describe('Positive', () => {
    it('imports the client runtime, never the server build', () => {
      const code = compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
      expect(code).toContain("from 'svelte/internal/client'");
      expect(code).not.toContain('svelte/internal/server');
    });

    it('emits from_tree (fragments: "tree"), never from_html', () => {
      const code = compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
      expect(code).toContain('from_tree(');
      expect(code).not.toContain('from_html(');
    });

    it('binds the component to the symbiote renderer module', () => {
      const code = compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
      expect(code).toContain('@symbiote-native/svelte/renderer');
    });

    it('passes the prop bag as an OBJECT through set_attribute', () => {
      const code = compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
      expect(code).toContain("set_attribute(view, 'p', {");
      expect(code).toContain("set_attribute(text, 'p', {");
    });

    it('strips <script lang="ts"> types with no file resolution', () => {
      const code = compileSvelteFile(COMPONENT_SOURCE, 'Demo.svelte');
      expect(code).not.toContain(': string');
      expect(code).not.toContain('$props<');
    });
  });
});

// A rune outside markup needs `compileModule()`, or `$state(...)` throws `rune_outside_svelte`
// It does not parse TypeScript, so this source also exercises the `ts.transpileModule()` strip
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

// No Negative group, `compileSvelteModuleFile` validates nothing of its own
describe('compileSvelteModuleFile', () => {
  describe('Positive', () => {
    it('strips TS types and desugars $state/$effect into svelte/internal/client calls', () => {
      const code = compileSvelteModuleFile(
        RUNE_MODULE_SOURCE,
        'use-counter.svelte.ts',
      );
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
      const result = await transform({
        filename: 'Demo.svelte',
        src: COMPONENT_SOURCE,
        options: TRANSFORM_OPTIONS,
      });
      expect(result).toBeDefined();
    });

    it('passes a non-.svelte file straight to the upstream transformer', async () => {
      const result = await transform({
        filename: 'plain.ts',
        src: 'export const x = 1;',
        options: TRANSFORM_OPTIONS,
      });
      expect(result).toBeDefined();
    });

    it('routes a .svelte.ts rune module through compileModule', async () => {
      const result = await transform({
        filename: 'use-counter.svelte.ts',
        src: RUNE_MODULE_SOURCE,
        options: TRANSFORM_OPTIONS,
      });
      expect(result).toBeDefined();
    });
  });

  // The guard also sits in `svelte.config.js`, which only editor tooling reads
  // An app bundles through `transform`, so the gate has to hold here too
  describe('Negative - rejects constructs the custom renderer cannot drive', () => {
    it('rejects {@html} before it compiles to a silent no-op', async () => {
      await expect(
        transform({
          filename: 'Bad.svelte',
          src: `<script lang="ts">const markup = '<b>hi</b>';</script>{@html markup}`,
          options: TRANSFORM_OPTIONS,
        }),
      ).rejects.toThrow(/@html/);
    });

    it('rejects <svelte:head>, which has no meaning on a native tree', async () => {
      await expect(
        transform({
          filename: 'Head.svelte',
          src: '<svelte:head><title>x</title></svelte:head>',
          options: TRANSFORM_OPTIONS,
        }),
      ).rejects.toThrow(/svelte:head/);
    });

    it('rejects bind:this on an element, which the compiler refuses', async () => {
      await expect(
        transform({
          filename: 'Bound.svelte',
          src: `<script lang="ts">let host = $state(null);</script><view p={{}} bind:this={host} />`,
          options: TRANSFORM_OPTIONS,
        }),
      ).rejects.toThrow(/bind:/);
    });
  });
});
