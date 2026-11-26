// `on:` is rejected by the compiler under `customRenderer`
// A parent listens to a child through a callback prop instead

import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';

describe('component events the custom renderer cannot drive', () => {
  describe('Negative', () => {
    it('rejects an `on:` listener on a component', () => {
      const source = `<script>
        import Child from './Child.svelte';
      </script>
      <Child on:ping={() => {}} />`;

      expect(() =>
        compile(source, {
          generate: 'client',
          fragments: 'tree',
          css: 'external',
          filename: 'Parent.svelte',
        }),
      ).toThrow(/`on:` is not compatible with `customRenderer`/);
    });
  });
});
