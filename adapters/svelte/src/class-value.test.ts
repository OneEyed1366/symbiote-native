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

// Both describe blocks below are Positive-only: `normalizeSvelteClass` and `resolveSvelteClass`
// are total over IClassEntry / ISvelteClassValue — every value in that type either flattens to a
// clsx string or passes through as a style, and neither branch throws. The one shape that would
// need a throw to reject (`{ card: someString }` — a class-map key with a non-boolean value) is
// already excluded at compile time by IClassMap's value type (class-value.ts's own header
// comment), so there is nothing left for a runtime guard to catch — no Negative group, and no `as`
// cast is used anywhere here to force such a value past the type checker.
describe('normalizeSvelteClass', () => {
  // why: `class="card"` is the common case — a literal string most consumers pass — and it must
  // reach routeProp byte-for-byte unchanged; wrapping every class value in this function must not
  // touch the majority path that was never clsx-shaped to begin with.
  it('passes a plain string through untouched', () => {
    expect(normalizeSvelteClass('card')).toBe('card');
    expect(normalizeSvelteClass(undefined)).toBeUndefined();
  });

  // why: `{ active: isOn }` is Svelte's idiomatic clsx map on a COMPONENT prop, and Svelte itself
  // only normalizes clsx shapes on element tags (skill §22b) — a component prop is handed over
  // verbatim, so without this the map reaches resolveClassName's "already a resolved style"
  // branch and silently merges as an inline style instead of painting a class.
  it('flattens a clsx map to the truthy keys, in declaration order', () => {
    expect(normalizeSvelteClass({ card: true, active: false, wide: true })).toBe('card wide');
  });

  // why: a clsx map's value is routinely the result of `cond && x` or an optional read, so
  // null/undefined must read as a plain "off" — not a crash and not a stray literal class token.
  it('treats null/undefined map values as "does not apply"', () => {
    expect(normalizeSvelteClass({ card: true, active: null, wide: undefined })).toBe('card');
  });

  // why: `['card', cond && 'card-on']` is the array-form clsx idiom; `cond && 'x'` evaluates to
  // `false` when off, and that hole must never become the literal string `"false"` in the class
  // list — it must disappear the same way it does for `{ active: false }`.
  it('flattens an array, dropping the falsy holes a `cond && name` expression leaves', () => {
    expect(normalizeSvelteClass(['card', false, 'card-on', null, undefined])).toBe('card card-on');
  });

  // why: real clsx (the library Svelte's own `set_class` delegates to) accepts arbitrarily nested
  // arrays and maps, e.g. `['card', ['wide', { active }]]` — app authors coming from that
  // convention expect the adapter's normalization to match it, not just the flat cases.
  it('recurses through nested arrays and maps, matching clsx', () => {
    expect(normalizeSvelteClass(['card', ['wide', { active: true, off: false }]])).toBe(
      'card wide active',
    );
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
    registerStyles({ card: { padding: 8 }, cardOn: { opacity: 1 } });
  });

  // why: normalizing a clsx map to a string is only half the job — the host node needs the actual
  // resolved style object, so resolveSvelteClass must carry the flattened string on through the
  // style registry rather than stopping at normalizeSvelteClass's output.
  it('resolves a clsx map through the registry', () => {
    expect(resolveSvelteClass({ card: true, missing: false })).toEqual({ padding: 8 });
  });

  // why: pins the disambiguation boundary at the RESOLVE step too, not just normalize — an
  // already-resolved style must not be re-interpreted or corrupted on its way through
  // resolveSvelteClass, matching the components (ScrollView, VirtualizedList) that call this
  // directly on a value they cannot pre-classify as clsx-shaped or not.
  it('still returns a resolved style object as-is', () => {
    expect(resolveSvelteClass({ color: 'red' })).toEqual({ color: 'red' });
  });
});

const ROOT_TAG = 91_811;
// Written NEXT TO the real View.svelte, not into src/: the compiled output keeps View's own
// relative imports ('../runes/attachments'), which only resolve from that directory.
const VIEW_OUT = join(__dirname, 'components', '.smoke-compiled-class-value-view.mjs');
const PARENT_OUT = join(__dirname, 'components', '.smoke-compiled-class-value-parent.mjs');
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;

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

// Positive-only, same reason as above: nothing in the ShimElement `set p` -> normalizeBagClasses
// -> class-value.ts chain throws on a well-typed ISvelteClassValue.
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

  // why: proves the whole path end-to-end through the ADAPTER boundary, not just the pure
  // function — a real compiled `<View class={{...}}>` must land the resolved style fields as
  // ACTUAL props on the committed native node. A unit test of normalizeSvelteClass alone would
  // not catch a wiring break at ShimElement's `set p` (class-value.ts is only reached because
  // `normalizeBagClasses` calls it there — element.ts:132-142).
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
