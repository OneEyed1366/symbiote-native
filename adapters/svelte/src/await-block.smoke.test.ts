// Real execution of `{#await}` against the DOM shim — until this file existed the construct was
// only ever COMPILE-verified (the preprocessor allows it, `tsc --build` sees nothing), and nothing
// in the repo had ever run `$.await_block` (svelte/internal/client/dom/blocks/await.js).
//
// It matters because `{#await}` is by construction "render one branch, then swap it after mount":
// the pending branch is scheduled in a microtask and each later branch is installed by a
// `BranchManager` — the same offscreen-fragment/detached-anchor machinery §17 of the
// svelte-adapter-dom-shim skill records a hard crash in. So every assertion here checks the EXACT
// committed Fabric child list, not just "something rendered": a stray anchor, a leftover branch,
// or a duplicated subtree is exactly the failure shape this construct can produce.
//
// Harness shape is mount-pipeline.smoke.test.ts's (compile real Svelte source to a uniquely-named
// file under build/, dynamic-import it) — the unique name is mandatory, Node caches import() by
// path (skill §15).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

// RN sets both before any app code runs (setUpGlobals.js / setUpNavigator.js); a bare vitest
// sandbox has neither, and svelte's init_operations() reads both at first mount.
if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_301;
const TMP_DIR = join(__dirname, '../build/__await_smoke__');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

let compileCounter = 0;

async function compileComponent(source: string, name: string): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
  });
  compileCounter += 1;
  const file = join(TMP_DIR, `${name}-${String(compileCounter)}.mjs`);
  writeFileSync(file, result.js.code);
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`compiled ${name}.svelte produced no default export`);
  }
  const component: unknown = mod.default;
  if (typeof component !== 'function') {
    throw new Error(`compiled ${name}.svelte default export is not a component`);
  }
  return component;
}

// root-element.ts inserts an unlabeled `symbiote-view` between the box-none AppContainer and the
// mounted component (skill §15), so the component's own top-level nodes are the WRAPPER's
// children. Reading them off `fabric.appRoot()` (which re-reads the latest child set) rather than
// `fabric.find()` is deliberate: find() walks the creation log and would still report a branch
// that has since been swapped out.
function appChildren(): IFakeNode[] {
  const wrapper = fabric.appRoot().children[0];
  expect(wrapper, 'the root wrapper symbiote-view committed').toBeDefined();
  return wrapper?.children ?? [];
}

function testIds(): Array<unknown> {
  return appChildren().map(child => child.props.testID);
}

// Marks a branch with a unique testID AND a Text child, so a leftover branch shows up both as an
// extra entry in testIds() and as an extra subtree — a bare marker view would hide a duplicated
// child set. Packed edge-to-edge: whitespace between sibling symbiote-* tags becomes a real
// RCTRawText node (skill §16).
function branchMarkup(id: string, label: string): string {
  return `<symbiote-view p={{ testID: '${id}' }}><symbiote-text p={{}}>${label}</symbiote-text></symbiote-view>`;
}

type IDeferred = {
  promise: Promise<string>;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
};

function deferred(): IDeferred {
  let resolve: (value: string) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('{#await} (real compiled output, real fake-Fabric)', () => {
  it('paints pending, then swaps to then when the promise resolves AFTER mount', async () => {
    const Awaiter = await compileComponent(
      `<script>let { promise } = $props();</script>` +
        `{#await promise}${branchMarkup('pending', 'loading')}` +
        `{:then value}<symbiote-view p={{ testID: 'then' }}><symbiote-text p={{}}>{value}</symbiote-text></symbiote-view>` +
        `{:catch error}${branchMarkup('catch', 'boom')}{/await}`,
      'Awaiter',
    );

    const gate = deferred();
    mount(ROOT_TAG, Awaiter, { promise: gate.promise });
    await tick();

    // Exactly the pending branch — not pending PLUS an anchor-turned-RCTRawText, and not both
    // branches at once.
    expect(testIds()).toEqual(['pending']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "loading"))');

    gate.resolve('ready');
    await tick();
    await tick();

    // The pending subtree must be GONE, not merely followed by the then subtree.
    expect(testIds()).toEqual(['then']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "ready"))');
  });

  it('paints the catch branch when the promise rejects after mount', async () => {
    const Awaiter = await compileComponent(
      `<script>let { promise } = $props();</script>` +
        `{#await promise}${branchMarkup('pending', 'loading')}` +
        `{:then value}${branchMarkup('then', 'ok')}` +
        `{:catch error}<symbiote-view p={{ testID: 'catch' }}><symbiote-text p={{}}>{error.message}</symbiote-text></symbiote-view>{/await}`,
      'AwaiterReject',
    );

    const gate = deferred();
    mount(ROOT_TAG, Awaiter, { promise: gate.promise });
    await tick();
    expect(testIds()).toEqual(['pending']);

    gate.reject(new Error('nope'));
    await tick();
    await tick();

    expect(testIds()).toEqual(['catch']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "nope"))');
  });

  it('renders nothing until resolution in the `{#await expr then value}` short form', async () => {
    const Awaiter = await compileComponent(
      `<script>let { promise } = $props();</script>` +
        `{#await promise then value}<symbiote-view p={{ testID: 'then' }}><symbiote-text p={{}}>{value}</symbiote-text></symbiote-view>{/await}`,
      'AwaiterShort',
    );

    const gate = deferred();
    mount(ROOT_TAG, Awaiter, { promise: gate.promise });
    await tick();

    // No pending branch exists, so the block contributes NO native node — its anchor must be a
    // real engine anchor the commit walk skips, never an empty RCTRawText (dom-shim/text.ts's
    // "an empty text node is an anchor" rule). A stray node here would be a genuine paint bug.
    expect(appChildren()).toHaveLength(0);

    gate.resolve('late');
    await tick();
    await tick();

    expect(testIds()).toEqual(['then']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "late"))');
  });

  it('handles a NEW promise swapped in while the first is still pending', async () => {
    // The re-entrancy case: the first promise's `.then` still fires after it was replaced, and
    // await.js's own `destroyed` guard is what must keep it from re-installing a stale branch.
    // The component publishes its setter onto the props object so the test can drive the swap
    // through the same reactive path app code would.
    const Awaiter = await compileComponent(
      `<script>
         let { control } = $props();
         let current = $state(control.initial);
         control.swap = next => { current = next; };
       </script>` +
        `{#await current}${branchMarkup('pending', 'loading')}` +
        `{:then value}<symbiote-view p={{ testID: 'then' }}><symbiote-text p={{}}>{value}</symbiote-text></symbiote-view>` +
        `{:catch error}${branchMarkup('catch', 'boom')}{/await}`,
      'AwaiterSwap',
    );

    const first = deferred();
    const second = deferred();
    const control: { initial: Promise<string>; swap: (next: Promise<string>) => void } = {
      initial: first.promise,
      swap: () => {},
    };

    mount(ROOT_TAG, Awaiter, { control });
    await tick();
    expect(testIds()).toEqual(['pending']);

    control.swap(second.promise);
    await tick();
    expect(testIds()).toEqual(['pending']);

    // The abandoned promise resolves first — its branch must never appear.
    first.resolve('stale');
    await tick();
    await tick();
    expect(testIds()).toEqual(['pending']);

    second.resolve('fresh');
    await tick();
    await tick();
    expect(testIds()).toEqual(['then']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "fresh"))');
  });

  it('interleaves block anchors correctly when nested inside {#each}', async () => {
    // Three sibling {#await} blocks inside one keyed {#each}, resolving OUT of order. Each block
    // owns its own anchor inside the shared each-block parent, so a mis-ordered insertion (the
    // ShimNode.insertBefore/anchor path) shows up as a permuted child list, and a leaked anchor
    // shows up as an extra child.
    const List = await compileComponent(
      `<script>let { rows } = $props();</script>` +
        `<symbiote-view p={{ testID: 'list' }}>` +
        `{#each rows as row (row.key)}` +
        `{#await row.promise}<symbiote-view p={{ testID: row.key + '-pending' }}></symbiote-view>` +
        `{:then value}<symbiote-view p={{ testID: row.key + '-then' }}><symbiote-text p={{}}>{value}</symbiote-text></symbiote-view>{/await}` +
        `{/each}` +
        `</symbiote-view>`,
      'AwaitInEach',
    );

    const gates = [deferred(), deferred(), deferred()];
    const rows = gates.map((gate, index) => ({ key: `r${String(index)}`, promise: gate.promise }));
    mount(ROOT_TAG, List, { rows });
    await tick();

    const listChildren = (): IFakeNode[] => appChildren()[0]?.children ?? [];
    expect(listChildren().map(child => child.props.testID)).toEqual([
      'r0-pending',
      'r1-pending',
      'r2-pending',
    ]);

    // Middle first, then last, then first — every insertion lands between live siblings.
    gates[1]?.resolve('one');
    await tick();
    await tick();
    expect(listChildren().map(child => child.props.testID)).toEqual([
      'r0-pending',
      'r1-then',
      'r2-pending',
    ]);

    gates[2]?.resolve('two');
    gates[0]?.resolve('zero');
    await tick();
    await tick();
    expect(listChildren().map(child => child.props.testID)).toEqual([
      'r0-then',
      'r1-then',
      'r2-then',
    ]);
    expect(fabric.serialize(listChildren())).toBe(
      'RCTView(RCTText(RCTRawText "zero"))RCTView(RCTText(RCTRawText "one"))RCTView(RCTText(RCTRawText "two"))',
    );
  });
});
