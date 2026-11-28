// Монтируем `.svelte` с `experimental.customRenderer` напрямую

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 91_201;
const RENDERER_MODULE = join(__dirname, 'symbiote-renderer.ts');
const TMP_DIR = join(__dirname, '../build/__smoke__/symbiote-renderer');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function currentAppRoot(): ReturnType<typeof live.appRoot> {
  const last = fabric
    .findAll(node => node.props.pointerEvents === 'box-none')
    .at(-1);
  if (last === undefined) throw new Error('no app root was created');
  return last.handle;
}

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

let compileCounter = 0;

async function compileComponent(
  source: string,
  name: string,
): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
    experimental: { customRenderer: RENDERER_MODULE },
  });
  compileCounter += 1;
  const file = join(TMP_DIR, `${name}-${String(compileCounter)}.mjs`);
  writeFileSync(file, result.js.code);
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`compiled ${name}.svelte produced no default export`);
  }
  return mod.default as Component;
}

describe('mount through svelte/renderer (real compiled output, fake Fabric)', () => {
  describe('Positive', () => {
    it('static text lands in the committed native tree', async () => {
      const Hello = await compileComponent('<text>hello</text>', 'Hello');

      mount(ROOT_TAG, Hello);
      await tick();

      const serialized = live.serialize(currentAppRoot());
      expect(serialized).toContain('RCTText');
      expect(serialized).toContain('RCTRawText "hello"');
    });

    it('a $state change re-commits the text', async () => {
      const Counter = await compileComponent(
        `<script>
           let count = $state(0);
           $effect(() => { if (count < 1) count = count + 1; });
         </script>
         <text>count {count}</text>`,
        'Counter',
      );

      mount(ROOT_TAG, Counter);
      await tick();
      await tick();

      expect(live.serialize(currentAppRoot())).toContain(
        'RCTRawText "count 1"',
      );
    });

    it('a keyed {#each} keeps the author order after an item is appended', async () => {
      const List = await compileComponent(
        `<script>
           let items = $state(['a', 'b']);
           $effect(() => { if (items.length < 3) items = [...items, 'c']; });
         </script>
         <view>{#each items as item (item)}<text>{item}</text>{/each}</view>`,
        'List',
      );

      mount(ROOT_TAG, List);
      await tick();
      await tick();

      const serialized = live.serialize(currentAppRoot());
      const order = ['"a"', '"b"', '"c"'].map(token =>
        serialized.indexOf(token),
      );
      expect(order.every(index => index >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((left, right) => left - right));
    });

    it('an {#if} that turns false removes its node from the committed tree', async () => {
      const Toggle = await compileComponent(
        `<script>
           let shown = $state(true);
           $effect(() => { shown = false; });
         </script>
         <view>{#if shown}<text>gone</text>{/if}<text>stays</text></view>`,
        'Toggle',
      );

      mount(ROOT_TAG, Toggle);
      await tick();
      await tick();

      const serialized = live.serialize(currentAppRoot());
      expect(serialized).not.toContain('"gone"');
      expect(serialized).toContain('"stays"');
    });

    it('a keyed {#each} reorder moves the rows into the new author order', async () => {
      const Reversed = await compileComponent(
        `<script>
           let items = $state(['a', 'b', 'c']);
           $effect(() => { items = ['c', 'b', 'a']; });
         </script>
         <view>{#each items as item (item)}<text>{item}</text>{/each}</view>`,
        'Reversed',
      );

      mount(ROOT_TAG, Reversed);
      await tick();
      await tick();

      expect(live.texts(currentAppRoot())).toEqual(['c', 'b', 'a']);
    });

    it('a keyed {#each} inside a scroll-view follows a reorder and an insert', async () => {
      const Scrolled = await compileComponent(
        `<script>
           const steps = [['a', 'b', 'c'], ['d', 'c', 'x', 'a', 'b'], ['b', 'x', 'a', 'd', 'c']];
           let step = $state(0);
           let items = $derived(steps[step]);
           $effect(() => { if (step < 2) step += 1; });
         </script>
         <scroll-view>{#each items as item (item)}<text>{item}</text><text>-</text>{/each}</scroll-view>`,
        'Scrolled',
      );

      mount(ROOT_TAG, Scrolled);
      await tick();
      await tick();
      await tick();

      expect(live.texts(currentAppRoot()).join('')).toBe('b-x-a-d-c-');
    });

    it('an attribute on a tag reaches the engine prop bag', async () => {
      const Styled = await compileComponent('<view testID="box" />', 'Styled');

      mount(ROOT_TAG, Styled);
      await tick();

      expect(fabric.findAll(node => node.props.testID === 'box')).toHaveLength(
        1,
      );
    });
  });
});
