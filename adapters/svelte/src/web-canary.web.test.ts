// @vitest-environment happy-dom
// Канареечный экран на Svelte оставляет на странице те же факты, что и на остальных адаптерах
// Svelte подменяет глобальные `document`, `Node` и `Element` на время жизни корня

import {
  CANARY_BOLD_STYLE,
  CANARY_BOX_STYLE,
  CANARY_FACTS,
  disposeCanary,
  renderCanaryOnWeb,
} from '@symbiote-native/web/canary';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRegistry } from './modules/app-registry';

// Named for this suite alone, as suites sharing a compiled artifact race under a full run
const COMPILED_OUT = join(__dirname, '.smoke-compiled-web-canary.mjs');

const SOURCE = `<script>
  const box = ${JSON.stringify(CANARY_BOX_STYLE)};
  const bold = ${JSON.stringify(CANARY_BOLD_STYLE)};
</script>
<view testID="app" style={box}>
  <text testID="greeting">hello <text testID="bold" style={bold}>web</text></text>
</view>`;

async function compiledCanary(): Promise<Component> {
  const { js } = compile(SOURCE, {
    generate: 'client',
    fragments: 'tree',
    css: 'external',
    filename: 'Canary.svelte',
  });
  writeFileSync(COMPILED_OUT, js.code);
  const mod: unknown = await import(`file://${COMPILED_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('compiled Canary.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('Svelte canary on the web', () => {
  afterEach(() => {
    disposeCanary();
    rmSync(COMPILED_OUT, { force: true });
  });

  it('leaves the canary facts on the page', async () => {
    const Canary = await compiledCanary();

    const facts = await renderCanaryOnWeb(AppRegistry, () => Canary);

    expect(facts).toEqual(CANARY_FACTS);
  });
});
