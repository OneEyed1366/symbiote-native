// The runtime proof for `<style>` support: a REAL `.svelte` source with a `<style>` block goes
// through the real preprocessor, the real `svelte/compiler`, this adapter's own `mount()`, and
// the assertions read the COMMITTED fake-Fabric node — not the compiled text.
//
// Two things are proven here that the preprocessor's own unit test structurally cannot:
//   1. the declarations in a `<style>` block actually land on the native node (they landed
//      nowhere at all before this feature — Svelte's own CSS output is empty by the time it
//      exists, see scoped-styles.ts's header);
//   2. scoping is REAL — two components each defining their own `.card` do not bleed into each
//      other, even though the class registry is one flat global Map.
//
// Harness shape and its three gotchas are §15 of the svelte-adapter-dom-shim skill. The compiled
// output is written NEXT TO the real source (not an isolated temp dir) because the compiled
// `View.svelte` keeps its own relative `../runes/attachments` import, and every variant gets its
// OWN filename because Node's `import()` caches by path.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { scopedStyles } from '../preprocessor/scoped-styles';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_003;
const VIEW_OUT = join(__dirname, '.smoke-compiled-scoped-view.mjs');
const CARD_A_OUT = join(__dirname, '.smoke-compiled-scoped-card-a.mjs');
const CARD_B_OUT = join(__dirname, '.smoke-compiled-scoped-card-b.mjs');
const DYNAMIC_OUT = join(__dirname, '.smoke-compiled-scoped-dynamic.mjs');
const COMPOUND_OUT = join(__dirname, '.smoke-compiled-scoped-compound.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-scoped-parent.mjs');
const OUTPUTS = [VIEW_OUT, CARD_A_OUT, CARD_B_OUT, DYNAMIC_OUT, COMPOUND_OUT, PARENT_OUT];

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;
const preprocess = scopedStyles();

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  for (const output of OUTPUTS) rmSync(output, { force: true });
});

async function compileToFile(source: string, filename: string, outPath: string): Promise<void> {
  const { code } = await preprocess.markup({ content: source, filename });
  writeFileSync(outPath, compile(code, { ...COMPILE_OPTIONS, filename }).js.code);
}

async function loadDefault(outPath: string): Promise<Component> {
  const mod: unknown = await import(`file://${outPath}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${outPath} produced no default export`);
  }
  const component = mod.default;
  if (typeof component !== 'function')
    throw new Error(`${outPath} default export is not a component`);
  return component;
}

// fabric.find() walks the CREATION log, so it can return a node that is no longer mounted and
// whose props are stale (§15). Every assertion below reads the LIVE committed tree instead.
function findLive(nativeID: string): IFakeNode | undefined {
  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const node of nodes) {
      if (node.props.nativeID === nativeID) return node;
      const found = walk(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

const VIEW_IMPORT = "import View from './.smoke-compiled-scoped-view.mjs';";

const CARD_A = `<script>
  ${VIEW_IMPORT}
</script>
<View class="card" nativeID="a" />
<style>
  .card { padding: 12px; background-color: #262626; }
</style>
`;

const CARD_B = `<script>
  ${VIEW_IMPORT}
</script>
<View class="card" nativeID="b" />
<style>
  .card { padding: 3px; }
</style>
`;

const DYNAMIC = `<script>
  ${VIEW_IMPORT}
  let { on = false } = $props();
</script>
<View class={['boxed', on && 'lit']} nativeID="d" />
<style>
  .boxed { padding: 7px; }
  .lit { color: #ffffff; }
</style>
`;

// A compound rule whose second part has NO standalone rule — the arrangement that exercises both
// halves of the compound-under-scope fix at once. `big` reaches `localNames` only through the
// `.card.big` selector's tokens, and the registered key `cardBig__<scope>` is reachable only
// because the runtime factors the shared suffix back out of `card__<scope> big__<scope>`.
const COMPOUND = `<script>
  ${VIEW_IMPORT}
  let { big = false } = $props();
</script>
<View class="card" nativeID="plain" />
<View class="card big" nativeID="compound" />
<View class={['card', big && 'big']} nativeID="dyn" />
<style>
  .card { padding: 8px; background-color: #262626; }
  .card.big { padding: 16px; }
</style>
`;

// The real `View.svelte` is compiled once next to its own source, so its relative
// `../runes/attachments` import still resolves, and every fixture imports THAT file.
async function buildFixture(source: string, name: string, outPath: string): Promise<void> {
  await compileToFile(
    readFileSync(join(__dirname, 'View.svelte'), 'utf8'),
    'View.svelte',
    VIEW_OUT,
  );
  await compileToFile(source, `${name}.svelte`, outPath);
}

async function mountBoth(): Promise<void> {
  await buildFixture(CARD_A, 'CardA', CARD_A_OUT);
  await buildFixture(CARD_B, 'CardB', CARD_B_OUT);
  await compileToFile(
    `<script>
       import CardA from './.smoke-compiled-scoped-card-a.mjs';
       import CardB from './.smoke-compiled-scoped-card-b.mjs';
     </script>
     <CardA /><CardB />`,
    'Both.svelte',
    PARENT_OUT,
  );

  mount(ROOT_TAG, await loadDefault(PARENT_OUT));
  await tick();
  await tick();
}

describe('svelte <style> block (real preprocess + compile + mount)', () => {
  it('lands the block declarations on the committed Fabric node', async () => {
    await mountBoth();

    const card = findLive('a');
    expect(card).toBeDefined();
    expect(card?.props.padding).toBe(12);
    expect(card?.props.backgroundColor).toBe('#262626');
  });

  it('does not let one component .card bleed into another component .card', async () => {
    await mountBoth();

    expect(findLive('a')?.props.padding).toBe(12);
    expect(findLive('b')?.props.padding).toBe(3);
    // The bleed that a flat, unscoped registry would produce: B's rule sets no background, so
    // A's must not be visible here (and B's padding must not have overwritten A's).
    expect(findLive('b')?.props.backgroundColor).toBeUndefined();
  });

  it('scopes a dynamic clsx class at runtime', async () => {
    await buildFixture(DYNAMIC, 'Dynamic', DYNAMIC_OUT);
    mount(ROOT_TAG, await loadDefault(DYNAMIC_OUT), { on: true });
    await tick();
    await tick();

    const node = findLive('d');
    expect(node).toBeDefined();
    expect(node?.props.padding).toBe(7);
    expect(node?.props.color).toBe('#ffffff');
  });

  describe('compound selector under scope', () => {
    beforeEach(async () => {
      await buildFixture(COMPOUND, 'Compound', COMPOUND_OUT);
      mount(ROOT_TAG, await loadDefault(COMPOUND_OUT), { big: true });
      await tick();
      await tick();
    });

    it('applies .card.big to a static class="card big"', () => {
      expect(findLive('compound')?.props.padding).toBe(16);
    });

    it('keeps the single-class declarations the compound rule does not restate', () => {
      // The cascade: `.card` still contributes its background, `.card.big` only overrides
      // padding. Returning the compound rule alone would blank the background here.
      expect(findLive('compound')?.props.backgroundColor).toBe('#262626');
    });

    it('leaves an element carrying only .card on the single rule', () => {
      expect(findLive('plain')?.props.padding).toBe(8);
    });

    it('applies .card.big to a dynamic clsx class too', () => {
      expect(findLive('dyn')?.props.padding).toBe(16);
    });
  });
});
