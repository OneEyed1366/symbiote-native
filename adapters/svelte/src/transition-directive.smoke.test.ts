// `transition:` and `animate:` are rejected by the compiler under `customRenderer`
// Motion goes through a style or an Animated value instead

import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';

function compileSource(source: string): void {
  compile(source, {
    generate: 'client',
    fragments: 'tree',
    css: 'external',
    filename: 'Probe.svelte',
  });
}

describe('directives the custom renderer cannot drive', () => {
  describe('Negative', () => {
    it('rejects `transition:` on an element', () => {
      const source = `<script>
        import { fade } from 'svelte/transition';
      </script>
      <view p={{}} transition:fade />`;

      expect(() => compileSource(source)).toThrow(
        /`transition:` is not compatible with `customRenderer`/,
      );
    });

    it('rejects `animate:` on a keyed each item', () => {
      const source = `<script>
        import { flip } from 'svelte/animate';
        let items = [1, 2];
      </script>
      {#each items as item (item)}
        <view p={{}} animate:flip />
      {/each}`;

      expect(() => compileSource(source)).toThrow(
        /`animate:` is not compatible with `customRenderer`/,
      );
    });
  });
});
