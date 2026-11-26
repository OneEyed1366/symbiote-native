// Covers BOTH shapes the disambiguation rule has to tell apart (class-value.ts's header):
// `{ active: true }` is a clsx map and must resolve through the style registry, `{ color: 'red' }`
// is an already-resolved style and must reach the engine untouched. The pure cases are asserted
// directly; the last block proves the same through a REAL compiled `<view>` mount, since the whole
// point is what lands on the native node.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { normalizeSvelteClass, resolveSvelteClass } from './class-value';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

// Both describe blocks below are Positive-only, as both functions are total over their types
// Every value either flattens to a clsx string or passes through as a style, and neither throws
// The one shape that would need a throw, a class-map key with a non-boolean value, is a type error
describe('normalizeSvelteClass', () => {
  // why: `class="card"` is the common case — a literal string most consumers pass — and it must
  // reach routeProp byte-for-byte unchanged; wrapping every class value in this function must not
  // touch the majority path that was never clsx-shaped to begin with.
  it('passes a plain string through untouched', () => {
    expect(normalizeSvelteClass('card')).toBe('card');
    expect(normalizeSvelteClass(undefined)).toBeUndefined();
  });

  // `{ active: isOn }` is Svelte's clsx map on a component prop, which Svelte hands over verbatim
  // Unflattened, it would reach `resolveClassName` as a resolved style and merge as inline style
  it('flattens a clsx map to the truthy keys, in declaration order', () => {
    expect(
      normalizeSvelteClass({ card: true, active: false, wide: true }),
    ).toBe('card wide');
  });

  // why: a clsx map's value is routinely the result of `cond && x` or an optional read, so
  // null/undefined must read as a plain "off" — not a crash and not a stray literal class token.
  it('treats null/undefined map values as "does not apply"', () => {
    expect(
      normalizeSvelteClass({ card: true, active: null, wide: undefined }),
    ).toBe('card');
  });

  // why: `['card', cond && 'card-on']` is the array-form clsx idiom; `cond && 'x'` evaluates to
  // `false` when off, and that hole must never become the literal string `"false"` in the class
  // list — it must disappear the same way it does for `{ active: false }`.
  it('flattens an array, dropping the falsy holes a `cond && name` expression leaves', () => {
    expect(
      normalizeSvelteClass(['card', false, 'card-on', null, undefined]),
    ).toBe('card card-on');
  });

  // why: real clsx (the library Svelte's own `set_class` delegates to) accepts arbitrarily nested
  // arrays and maps, e.g. `['card', ['wide', { active }]]` — app authors coming from that
  // convention expect the adapter's normalization to match it, not just the flat cases.
  it('recurses through nested arrays and maps, matching clsx', () => {
    expect(
      normalizeSvelteClass(['card', ['wide', { active: true, off: false }]]),
    ).toBe('card wide active');
  });

  // why: the whole disambiguation rule (skill §22b) hinges on this case — a style object's values
  // are colors/numbers, never booleans, so this is the one shape that must NOT be flattened, or
  // an ordinary `style={{color:'red'}}` silently loses its content.
  it('leaves a resolved style object alone — its values are not booleans', () => {
    const style = { color: 'red', flex: 1 };
    expect(normalizeSvelteClass(style)).toBe(style);
  });

  // why: if ANY entry of a mixed array is a resolved style, the WHOLE array must fall through
  // untouched — `class={['card', {color:'red'}]}` must keep taking exactly the path it took
  // before this function existed, not a corrupted partial flatten.
  it('leaves an array containing a resolved style alone, so the engine still merges it', () => {
    const value = ['card', { color: 'red' }];
    expect(normalizeSvelteClass(value)).toBe(value);
  });

  // why: both readings of `{}` contribute nothing, so the cheaper non-allocating style-passthrough
  // branch is the correct one — a static `class={{}}` must not allocate a class string on every
  // render for zero effect.
  it('treats an empty object as a (no-op) style, not a clsx map', () => {
    const empty = {};
    expect(normalizeSvelteClass(empty)).toBe(empty);
  });
});

describe('resolveSvelteClass', () => {
  beforeEach(() => {
    clearGlobalStyles();
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 8 },
      },
      {
        tokens: ['cardOn'],
        specificity: [0, 1, 0],
        order: 1,
        style: { opacity: 1 },
      },
    ]);
  });

  // The host node needs the resolved style object, so the flattened string goes on to the registry
  it('resolves a clsx map through the registry', () => {
    expect(resolveSvelteClass({ card: true, missing: false })).toEqual({
      padding: 8,
    });
  });

  // The disambiguation holds at the resolve step too, for components that call it on any value
  // ScrollView and VirtualizedList cannot tell a clsx shape from a resolved style up front
  it('still returns a resolved style object as-is', () => {
    expect(resolveSvelteClass({ color: 'red' })).toEqual({ color: 'red' });
  });
});

const ROOT_TAG = 91_811;
const PARENT_OUT = join(__dirname, '.smoke-compiled-class-value-parent.mjs');
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): void {
  writeFileSync(
    outPath,
    compile(source, { ...COMPILE_OPTIONS, filename }).js.code,
  );
}

async function loadParent(): Promise<Component> {
  compileToFile(
    `<script>
       let { on } = $props();
     </script>
     <view testID="clsx-target" class={{ card: on, cardOn: on }} style={{ margin: 2 }}></view>`,
    'Parent.svelte',
    PARENT_OUT,
  );
  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('Parent.svelte produced no default export');
  }
  const component: unknown = mod.default;
  if (typeof component !== 'function')
    throw new Error('default export is not a component');
  return component;
}

// Positive-only, same reason as above: nothing in the bag write, `normalizeBagClasses` and
// `class-value.ts` chain throws on a well-typed `ISvelteClassValue`
describe('a clsx `class` on a real compiled View', () => {
  beforeEach(() => {
    fabric.reset();
    clearGlobalStyles();
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 8 },
      },
      {
        tokens: ['cardOn'],
        specificity: [0, 1, 0],
        order: 1,
        style: { opacity: 1 },
      },
    ]);
  });

  afterEach(() => {
    unmount(ROOT_TAG);
    rmSync(PARENT_OUT, { force: true });
  });

  // A compiled `<view class={{...}}>` must land the resolved style fields on the committed node
  // A unit test of `normalizeSvelteClass` alone would miss a break in the bag write that calls it
  it('resolves each truthy key through the registry and keeps the explicit style winning', async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, { on: true });
    await tick();
    await tick();

    const target = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'clsx-target',
    );
    expect(target).toBeDefined();
    // `card` and `cardOn` are two independent single-token rules, so both land; `style` is the
    // author's explicit half and wins the flatten. The style slot is flattened on the way into the
    // payload, which is why the fields read as top-level keys there rather than under `style`.
    expect(target?.payload.padding).toBe(8);
    expect(target?.payload.opacity).toBe(1);
    expect(target?.payload.margin).toBe(2);
  });
});
