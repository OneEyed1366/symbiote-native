// The deferred half of `{#await}` and `<svelte:boundary>`, which render offscreen into a fragment
// and splice the result in

// It needs its own file, as those paths are gated on Svelte's async mode
// Without `experimental: { async: true }` the offscreen branch is unreachable

// That flag is process-wide with no way back, and vitest isolates each file's module registry

// A subtree is rendered into a live parent, moved into an offscreen fragment and spliced back
// Assertions check the exact committed child list, as a node may be present twice or left behind

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_303;
const TMP_DIR = join(__dirname, '../build/__async_smoke__');
const AWAITING_CHILD_MODULE = 'awaiting-child.mjs';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

let compileCounter = 0;

function compileToFile(
  source: string,
  name: string,
  fileName?: string,
): string {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
    experimental: { async: true },
  });
  compileCounter += 1;
  const file = join(
    TMP_DIR,
    fileName ?? `${name}-${String(compileCounter)}.mjs`,
  );
  writeFileSync(file, result.js.code);
  return file;
}

async function compileComponent(
  source: string,
  name: string,
): Promise<Component> {
  const file = compileToFile(source, name);
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`compiled ${name}.svelte produced no default export`);
  }
  const component: unknown = mod.default;
  if (typeof component !== 'function') {
    throw new Error(
      `compiled ${name}.svelte default export is not a component`,
    );
  }
  return component;
}

function appChildren(): ILiveNode[] {
  const wrapper = live.nodeOf(live.appRoot()).children[0];
  expect(wrapper, 'the root wrapper view committed').toBeDefined();
  return wrapper?.children ?? [];
}

function testIds(): Array<unknown> {
  return appChildren().map(child => child.props.testID);
}

function serialize(nodes: readonly ILiveNode[]): string {
  return nodes.map(node => live.serialize(node.handle)).join('');
}

type IDeferred = {
  promise: Promise<string>;
  resolve: (value: string) => void;
};

function deferred(): IDeferred {
  let resolve: (value: string) => void = () => {};
  const promise = new Promise<string>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

// No Negative group, as `mount()` never throws in async mode either
describe('deferred {#await} / <svelte:boundary pending> (svelte async mode)', () => {
  // A live branch swap after the first render goes through the offscreen fragment
  // It must leave no stale or duplicate node, such as an engine node never unlinked
  it('swaps branches through the OFFSCREEN fragment when a new promise arrives post-mount', async () => {
    const Awaiter = await compileComponent(
      `<script>
         let { control } = $props();
         let current = $state(control.initial);
         control.swap = next => { current = next; };
       </script>
       {#await current}<view p={{ testID: 'pending' }}><text p={{}}>loading</text></view>
       {:then value}<view p={{ testID: 'then' }}><text p={{}}>{value}</text></view>{/await}`,
      'DeferredAwaiter',
    );

    const first = deferred();
    const control: {
      initial: Promise<string>;
      swap: (next: Promise<string>) => void;
    } = {
      initial: first.promise,
      swap: () => {},
    };

    mount(ROOT_TAG, Awaiter, { control });
    await tick();
    expect(testIds()).toEqual(['pending']);

    first.resolve('one');
    await tick();
    await tick();
    expect(testIds()).toEqual(['then']);
    expect(serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "one"))');

    // Back to pending, then forward again, inside an effect that already fired once
    // That is the `REACTION_RAN` condition of `should_defer_append()`, so the swaps go offscreen
    const second = deferred();
    control.swap(second.promise);
    await tick();
    await tick();
    expect(testIds()).toEqual(['pending']);

    second.resolve('two');
    await tick();
    await tick();
    expect(testIds()).toEqual(['then']);
    expect(serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "two"))');
  });

  // A top-level `await` in a boundary is parked offscreen while pending, then spliced back once
  // It is never visible meanwhile and never committed twice
  it('shows a boundary pending snippet, then splices the awaited child in from its offscreen fragment', async () => {
    // `move_effect` parks the children in a fresh fragment, and the boundary splices them back
    // A renderer that detaches a node without its engine node would paint the child throughout
    compileToFile(
      `<script>
         let { gate } = $props();
         const label = await gate.promise;
       </script><view p={{ testID: 'child' }}><text p={{}}>{label}</text></view>`,
      'AwaitingChild',
      AWAITING_CHILD_MODULE,
    );

    const Guarded = await compileComponent(
      `<script>
         import Child from './${AWAITING_CHILD_MODULE}';
         let { gate } = $props();
       </script>
       <svelte:boundary><Child {gate} />
       {#snippet pending()}<view p={{ testID: 'pending' }}><text p={{}}>loading</text></view>{/snippet}
       </svelte:boundary>`,
      'PendingBoundary',
    );

    const gate = deferred();
    mount(ROOT_TAG, Guarded, { gate });
    await tick();
    await tick();

    // Only the pending snippet may be committed, as the child's nodes moved offscreen
    expect(testIds()).toEqual(['pending']);
    expect(serialize(appChildren())).toBe(
      'RCTView(RCTText(RCTRawText "loading"))',
    );

    gate.resolve('resolved');
    await tick();
    await tick();
    await tick();

    // Exactly one child, once, and not pending plus child
    expect(testIds()).toEqual(['child']);
    expect(serialize(appChildren())).toBe(
      'RCTView(RCTText(RCTRawText "resolved"))',
    );
  });

  // A sibling already committed synchronously must leave the native tree too when `move_effect`
  // parks it offscreen, not just the renderer's own bookkeeping
  it('hides an ALREADY-PAINTED sibling that move_effect drags into the offscreen fragment', async () => {
    // The boundary's plain element renders into the live anchor before the awaiting child bumps
    // the pending count, so `move_effect` moves a node whose engine node is already committed
    // Appending it to a fragment takes it out of the document, and the engine tree must follow
    compileToFile(
      `<script>
         let { gate } = $props();
         const label = await gate.promise;
       </script><view p={{ testID: 'child' }}><text p={{}}>{label}</text></view>`,
      'AwaitingChild',
      AWAITING_CHILD_MODULE,
    );

    const Guarded = await compileComponent(
      `<script>
         import Child from './${AWAITING_CHILD_MODULE}';
         let { gate } = $props();
       </script>
       <svelte:boundary><view p={{ testID: 'sibling' }}><text p={{}}>sync</text></view>
       <Child {gate} />
       {#snippet pending()}<view p={{ testID: 'pending' }}><text p={{}}>loading</text></view>{/snippet}
       </svelte:boundary>`,
      'PendingBoundaryWithSibling',
    );

    const gate = deferred();
    mount(ROOT_TAG, Guarded, { gate });
    await tick();
    await tick();

    expect(testIds()).toEqual(['pending']);

    gate.resolve('resolved');
    await tick();
    await tick();
    await tick();

    expect(testIds()).toEqual(['sibling', 'child']);
    expect(serialize(appChildren())).toBe(
      'RCTView(RCTText(RCTRawText "sync"))RCTView(RCTText(RCTRawText "resolved"))',
    );
  });
});
