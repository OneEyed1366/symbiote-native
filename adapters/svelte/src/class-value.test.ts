// Covers BOTH shapes the disambiguation rule has to tell apart (class-value.ts's header):
// `{ active: true }` is a clsx map and must resolve through the style registry, `{ color: 'red' }`
// is an already-resolved style and must reach the engine untouched. The pure cases are asserted
// directly; the last block proves the same through a REAL compiled View mount, since the whole
// point is what lands on the native node.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import type { IFakeNode } from '@symbiote-native/test-utils';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { normalizeSvelteClass, resolveSvelteClass } from './class-value';
import { mount, unmount } from './render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

describe('normalizeSvelteClass', () => {
  it('passes a plain string through untouched', () => {
    expect(normalizeSvelteClass('card')).toBe('card');
    expect(normalizeSvelteClass(undefined)).toBeUndefined();
  });

  it('flattens a clsx map to the truthy keys, in declaration order', () => {
    expect(normalizeSvelteClass({ card: true, active: false, wide: true })).toBe('card wide');
  });

  it('treats null/undefined map values as "does not apply"', () => {
    expect(normalizeSvelteClass({ card: true, active: null, wide: undefined })).toBe('card');
  });

  it('flattens an array, dropping the falsy holes a `cond && name` expression leaves', () => {
    expect(normalizeSvelteClass(['card', false, 'card-on', null, undefined])).toBe('card card-on');
  });

  it('recurses through nested arrays and maps, matching clsx', () => {
    expect(normalizeSvelteClass(['card', ['wide', { active: true, off: false }]])).toBe(
      'card wide active',
    );
  });

  it('leaves a resolved style object alone — its values are not booleans', () => {
    const style = { color: 'red', flex: 1 };
    expect(normalizeSvelteClass(style)).toBe(style);
  });

  it('leaves an array containing a resolved style alone, so the engine still merges it', () => {
    const value = ['card', { color: 'red' }];
    expect(normalizeSvelteClass(value)).toBe(value);
  });

  it('treats an empty object as a (no-op) style, not a clsx map', () => {
    const empty = {};
    expect(normalizeSvelteClass(empty)).toBe(empty);
  });
});

describe('resolveSvelteClass', () => {
  beforeEach(() => {
    clearGlobalStyles();
    registerStyles({ card: { padding: 8 }, cardOn: { opacity: 1 } });
  });

  it('resolves a clsx map through the registry', () => {
    expect(resolveSvelteClass({ card: true, missing: false })).toEqual({ padding: 8 });
  });

  it('still returns a resolved style object as-is', () => {
    expect(resolveSvelteClass({ color: 'red' })).toEqual({ color: 'red' });
  });
});

const ROOT_TAG = 91_811;
// Written NEXT TO the real View.svelte, not into src/: the compiled output keeps View's own
// relative imports ('../runes/attachments'), which only resolve from that directory.
const VIEW_OUT = join(__dirname, 'components', '.smoke-compiled-class-value-view.mjs');
const PARENT_OUT = join(__dirname, 'components', '.smoke-compiled-class-value-parent.mjs');
const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function compileToFile(source: string, filename: string, outPath: string): void {
  writeFileSync(outPath, compile(source, { ...COMPILE_OPTIONS, filename }).js.code);
}

function findLive(node: IFakeNode, predicate: (n: IFakeNode) => boolean): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findLive(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

async function loadParent(): Promise<Component> {
  compileToFile(
    readFileSync(join(__dirname, 'components', 'View.svelte'), 'utf8'),
    'View.svelte',
    VIEW_OUT,
  );
  compileToFile(
    `<script>
       import View from './.smoke-compiled-class-value-view.mjs';
       let { on } = $props();
     </script>
     <View testID="clsx-target" class={{ card: on, cardOn: on }} style={{ margin: 2 }} />`,
    'Parent.svelte',
    PARENT_OUT,
  );
  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('Parent.svelte produced no default export');
  }
  const component: unknown = mod.default;
  if (typeof component !== 'function') throw new Error('default export is not a component');
  return component;
}

describe('a clsx `class` on a real compiled View', () => {
  beforeEach(() => {
    fabric.reset();
    clearGlobalStyles();
    registerStyles({ card: { padding: 8 }, cardOn: { opacity: 1 } });
  });

  afterEach(() => {
    unmount(ROOT_TAG);
    rmSync(VIEW_OUT, { force: true });
    rmSync(PARENT_OUT, { force: true });
  });

  it('resolves each truthy key through the registry and keeps the explicit style winning', async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, { on: true });
    await tick();
    await tick();

    const target = findLive(fabric.appRoot(), node => node.props.testID === 'clsx-target');
    expect(target).toBeDefined();
    // `card cardOn` has no compound entry registered, so the per-class merge runs and both
    // halves land; `style` is the explicit half and wins the flatten (the fake Fabric spreads
    // the flattened style onto the node's props, so the fields read off `props` directly).
    expect(target?.props.padding).toBe(8);
    expect(target?.props.opacity).toBe(1);
    expect(target?.props.margin).toBe(2);
  });
});
