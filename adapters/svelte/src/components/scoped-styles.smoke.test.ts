// Runtime proof for `<style>` support: a real `.svelte` source runs through the real
// preprocessor, `svelte/compiler` and `mount()`; assertions read the committed fake-Fabric node

// Proves what the preprocessor's unit test cannot: declarations reach the native node (Svelte's
// own CSS output is empty, see `scoped-styles.ts`). Two components each defining `.card` must
// not bleed through the flat global class registry

// Each variant gets its own filename because Node's `import()` caches by path

// Text-level rewrite (suffixing, `:global()`, kebab matching, dynamic wrap, `<script module>`
// splice, line numbers) is covered at `preprocessor/scoped-styles.test.ts`, not here

// `resolveClassName` resolution is covered at `core/engine/src/style-registry/*.test.ts`; here
// only that the `class` prop of `index.svelte` feeds a scoped token into it, static and dynamic

// Tests below: declarations land on the node, scopes stay isolated, and a dynamic clsx class
// resolves through the scope. Compound `.card.big` layers over its single-class rules in both
// forms, while a `.card`-only element stays on the single rule

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { scopedStyles } from '../preprocessor/scoped-styles';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_003;
const CARD_A_OUT = join(__dirname, '.smoke-compiled-scoped-card-a.mjs');
const CARD_B_OUT = join(__dirname, '.smoke-compiled-scoped-card-b.mjs');
const DYNAMIC_OUT = join(__dirname, '.smoke-compiled-scoped-dynamic.mjs');
const COMPOUND_OUT = join(__dirname, '.smoke-compiled-scoped-compound.mjs');
const PARTIAL_GLOBAL_OUT = join(
  __dirname,
  '.smoke-compiled-scoped-partial-global.mjs',
);
const PARENT_OUT = join(__dirname, '.smoke-compiled-scoped-parent.mjs');
const OUTPUTS = [
  CARD_A_OUT,
  CARD_B_OUT,
  DYNAMIC_OUT,
  COMPOUND_OUT,
  PARTIAL_GLOBAL_OUT,
  PARENT_OUT,
];

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;
const preprocess = scopedStyles();

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  for (const output of OUTPUTS) rmSync(output, { force: true });
});

async function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): Promise<void> {
  const { code } = await preprocess.markup({ content: source, filename });
  writeFileSync(
    outPath,
    compile(code, { ...COMPILE_OPTIONS, filename }).js.code,
  );
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

// `fabric.find()` walks the creation log and can return an unmounted node with stale props, so
// assertions read the live committed tree. Style declarations show only in the flattened payload
function findLive(nativeID: string) {
  return live.findLive(
    live.appRoot(),
    node => node.payload.nativeID === nativeID,
  );
}

const CARD_A = `<view class="card" nativeID="a"></view>
<style>
  .card { padding: 12px; background-color: #262626; }
</style>
`;

const CARD_B = `<view class="card" nativeID="b"></view>
<style>
  .card { padding: 3px; }
</style>
`;

const DYNAMIC = `<script>
  let { on = false } = $props();
</script>
<view class={['boxed', on && 'lit']} nativeID="d"></view>
<style>
  .boxed { padding: 7px; }
  .lit { color: #ffffff; }
</style>
`;

// A compound rule whose second part has no standalone rule, so both halves of the fix run:
// `big` reaches `localNames` only via `.card.big` tokens, and `cardBig__<scope>` is found only
// because the runtime factors the suffix back out of `card__<scope> big__<scope>`
const COMPOUND = `<script>
  let { big = false } = $props();
</script>
<view class="card" nativeID="plain"></view>
<view class="card big" nativeID="compound"></view>
<view class={['card', big && 'big']} nativeID="dyn"></view>
<style>
  .card { padding: 8px; background-color: #262626; }
  .card.big { padding: 16px; }
</style>
`;

// A partial `:global()`: the file owns `.card` but reaches `.legacy` in markup it does not.
// The two halves are suffixed differently on purpose — the registered key `cardLegacy__<scope>`
// as a whole, the markup token `legacy` not at all — so this is the arrangement that proves the
// build-time exemption and the runtime lookup still meet.
const PARTIAL_GLOBAL = `<view class="card legacy" nativeID="partial"></view>
<view class="card" nativeID="own"></view>
<style>
  .card { padding: 8px; background-color: #262626; }
  .card :global(.legacy) { margin: 4px; }
</style>
`;

async function buildFixture(
  source: string,
  name: string,
  outPath: string,
): Promise<void> {
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
  // No Negative group: the build-time guard `forbidWebOnlyConstructs` owns the throwing contract
  // and has its own test file. A `<style>` block has no runtime rejection path, a rule either
  // resolves to a native style field or is dropped with a warning
  describe('Positive (scoped declarations reach the committed native node)', () => {
    // Svelte's own CSS output is empty for a component tag, so without this feature a `<style>`
    // block's declarations land nowhere. This is the basic product claim of the feature
    it('lands the block declarations on the committed Fabric node', async () => {
      await mountBoth();

      const card = findLive('a');
      expect(card).toBeDefined();
      expect(card?.payload.padding).toBe(12);
      expect(card?.payload.backgroundColor).toBe('#262626');
    });

    // The class registry is one flat global Map, so scoping must be real or two components each
    // authoring `.card` would collide once both are mounted in the same app
    it('does not let one component .card bleed into another component .card', async () => {
      await mountBoth();

      expect(findLive('a')?.payload.padding).toBe(12);
      expect(findLive('b')?.payload.padding).toBe(3);
      // The bleed that a flat, unscoped registry would produce: B's rule sets no background, so
      // A's must not be visible here (and B's padding must not have overwritten A's).
      expect(findLive('b')?.payload.backgroundColor).toBeUndefined();
    });

    // A scoped `<style>` block must compose with the adapter's own clsx `class` value, not just a
    // literal string: two independent features, and this is the seam where they could stop meeting
    it('scopes a dynamic clsx class at runtime', async () => {
      await buildFixture(DYNAMIC, 'Dynamic', DYNAMIC_OUT);
      mount(ROOT_TAG, await loadDefault(DYNAMIC_OUT), { on: true });
      await tick();
      await tick();

      const node = findLive('d');
      expect(node).toBeDefined();
      expect(node?.payload.padding).toBe(7);
      expect(node?.payload.color).toBe('#fff');
    });

    // A compound selector (`.card.big`) must layer over its single-class rules, not replace them:
    // a naive suffix-per-token scheme could lose declarations the compound rule does not restate
    describe('compound selector under scope', () => {
      beforeEach(async () => {
        await buildFixture(COMPOUND, 'Compound', COMPOUND_OUT);
        mount(ROOT_TAG, await loadDefault(COMPOUND_OUT), { big: true });
        await tick();
        await tick();
      });

      it('applies .card.big to a static class="card big"', () => {
        expect(findLive('compound')?.payload.padding).toBe(16);
      });

      it('keeps the single-class declarations the compound rule does not restate', () => {
        // The cascade: `.card` still contributes its background, `.card.big` only overrides
        // padding. Returning the compound rule alone would blank the background here.
        expect(findLive('compound')?.payload.backgroundColor).toBe('#262626');
      });

      it('leaves an element carrying only .card on the single rule', () => {
        expect(findLive('plain')?.payload.padding).toBe(8);
      });

      it('applies .card.big to a dynamic clsx class too', () => {
        expect(findLive('dyn')?.payload.padding).toBe(16);
      });
    });

    // `:global()` around part of a selector styles markup this file does not own, and its halves
    // are suffixed by different rules (key as a whole, markup token not at all). Only a mount
    // proves they meet at the registry; the preprocessor suite checks each half in text
    describe('partial :global() under scope', () => {
      beforeEach(async () => {
        await buildFixture(PARTIAL_GLOBAL, 'PartialGlobal', PARTIAL_GLOBAL_OUT);
        mount(ROOT_TAG, await loadDefault(PARTIAL_GLOBAL_OUT));
        await tick();
        await tick();
      });

      it('applies the :global() rule to an element carrying the unsuffixed token', () => {
        expect(findLive('partial')?.payload.margin).toBe(4);
      });

      it('keeps the scoped half of the same element resolving as usual', () => {
        expect(findLive('partial')?.payload.padding).toBe(8);
        expect(findLive('partial')?.payload.backgroundColor).toBe('#262626');
      });

      it('leaves an element without the global token on the single rule', () => {
        expect(findLive('own')?.payload.margin).toBeUndefined();
        expect(findLive('own')?.payload.padding).toBe(8);
      });
    });
  });
});
