import { describe, expect, it } from 'vitest';
import metroVueTransformer from './metro-vue-transformer.cjs';

const {
  compileSfc,
}: { compileSfc: (src: string, filename: string) => Promise<string> } =
  metroVueTransformer;

const TEMPLATE_ONLY_SFC = `
<template>
  <view class="card"><text>hello</text></view>
</template>
`;

describe('metro-vue-transformer compileSfc template-only SFC', () => {
  it('compiles a file with no script block into a component', async () => {
    const code = await compileSfc(TEMPLATE_ONLY_SFC, 'Plain.vue');
    expect(code).toContain('export default');
    expect(code).toContain('"view"');
  });

  it('keeps the vue import rewritten to the runtime-helpers shim', async () => {
    const code = await compileSfc(TEMPLATE_ONLY_SFC, 'Plain.vue');
    expect(code).toContain('@symbiote-native/vue/runtime-helpers');
    expect(code).not.toMatch(/from\s*['"]vue['"]/);
  });

  it('still rejects a file with no template and no script', async () => {
    await expect(
      compileSfc('<style>.a { color: red }</style>', 'Empty.vue'),
    ).rejects.toThrow('Empty.vue');
  });
});
