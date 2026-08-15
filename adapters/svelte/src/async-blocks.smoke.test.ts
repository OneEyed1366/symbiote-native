// The DEFERRED half of `{#await}` / `<svelte:boundary>` — the paths that actually allocate
// `document.createDocumentFragment()` and render OFFSCREEN before splicing the result in.
//
// Why this needs its own file: those paths are gated on Svelte's async mode.
// `should_defer_append()` (dom/operations.js) short-circuits on `async_mode_flag`, so
// `BranchManager`'s offscreen branch and `<svelte:boundary>`'s `pending` snippet
// (dom/blocks/boundary.js:272/305 — `createDocumentFragment` + `move_effect`) are UNREACHABLE
// unless the component was compiled with `experimental: { async: true }`. The sibling
// await-block/boundary smokes compile with this repo's own svelte.config.js options, which do
// not set it, so they exercise the synchronous branch path only. That flag is turned on by a
// module side effect (`svelte/internal/flags/async`, emitted into the compiled output) and is
// process-wide with no supported way back, hence a separate file — vitest isolates each test
// file's module registry.
//
// This is the §17 shape at full strength: a subtree is rendered into a LIVE parent, moved into an
// offscreen fragment, and spliced back later. Assertions check the exact committed Fabric child
// list, because the failure mode is a node that is present twice, or still present after being
// moved away.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_303;
const TMP_DIR = join(__dirname, '../build/__async_smoke__');
const AWAITING_CHILD_MODULE = 'awaiting-child.mjs';

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

function compileToFile(source: string, name: string, fileName?: string): string {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
    experimental: { async: true },
  });
  compileCounter += 1;
  const file = join(TMP_DIR, fileName ?? `${name}-${String(compileCounter)}.mjs`);
  writeFileSync(file, result.js.code);
  return file;
}

async function compileComponent(source: string, name: string): Promise<Component> {
  const file = compileToFile(source, name);
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

function appChildren(): IFakeNode[] {
  const wrapper = fabric.appRoot().children[0];
  expect(wrapper, 'the root wrapper symbiote-view committed').toBeDefined();
  return wrapper?.children ?? [];
}

function testIds(): Array<unknown> {
  return appChildren().map(child => child.props.testID);
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

describe('deferred {#await} / <svelte:boundary pending> (svelte async mode)', () => {
  it('swaps branches through the OFFSCREEN fragment when a new promise arrives post-mount', async () => {
    const Awaiter = await compileComponent(
      `<script>
         let { control } = $props();
         let current = $state(control.initial);
         control.swap = next => { current = next; };
       </script>` +
        `{#await current}<symbiote-view p={{ testID: 'pending' }}><symbiote-text p={{}}>loading</symbiote-text></symbiote-view>` +
        `{:then value}<symbiote-view p={{ testID: 'then' }}><symbiote-text p={{}}>{value}</symbiote-text></symbiote-view>{/await}`,
      'DeferredAwaiter',
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

    first.resolve('one');
    await tick();
    await tick();
    expect(testIds()).toEqual(['then']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "one"))');

    // Back to pending, then forward again — each transition now runs inside an effect that has
    // already fired once, which is exactly the `REACTION_RAN` condition should_defer_append()
    // tests, so these two swaps take the offscreen-fragment route the first one did not.
    control.swap(second.promise);
    await tick();
    await tick();
    expect(testIds()).toEqual(['pending']);

    second.resolve('two');
    await tick();
    await tick();
    expect(testIds()).toEqual(['then']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "two"))');
  });

  it('shows a boundary pending snippet, then splices the awaited child in from its offscreen fragment', async () => {
    // A component with top-level `await` suspends to the nearest boundary carrying a `pending`
    // snippet. That drives boundary.js's `#render`: children render into the LIVE anchor first,
    // then `move_effect` rips them into a fresh DocumentFragment, and `#anchor.before(fragment)`
    // splices them back once the promise settles. A shim that detaches a node from its shim
    // parent without also detaching its engine node would leave the child painted the whole time
    // and then committed twice.
    compileToFile(
      `<script>
         let { gate } = $props();
         const label = await gate.promise;
       </script>` +
        `<symbiote-view p={{ testID: 'child' }}><symbiote-text p={{}}>{label}</symbiote-text></symbiote-view>`,
      'AwaitingChild',
      AWAITING_CHILD_MODULE,
    );

    const Guarded = await compileComponent(
      `<script>
         import Child from './${AWAITING_CHILD_MODULE}';
         let { gate } = $props();
       </script>` +
        `<svelte:boundary>` +
        `<Child {gate} />` +
        `{#snippet pending()}<symbiote-view p={{ testID: 'pending' }}><symbiote-text p={{}}>loading</symbiote-text></symbiote-view>{/snippet}` +
        `</svelte:boundary>`,
      'PendingBoundary',
    );

    const gate = deferred();
    mount(ROOT_TAG, Guarded, { gate });
    await tick();
    await tick();

    // Only the pending snippet may be committed: the child's own nodes were built, then moved
    // offscreen, and must not still be in the native tree.
    expect(testIds()).toEqual(['pending']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "loading"))');

    gate.resolve('resolved');
    await tick();
    await tick();
    await tick();

    // Exactly one child, once — not the child twice, and not pending plus child.
    expect(testIds()).toEqual(['child']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "resolved"))');
  });

  it('hides an ALREADY-PAINTED sibling that move_effect drags into the offscreen fragment', async () => {
    // The sharpest version of the previous test. Here the boundary's children include a plain
    // element that renders SYNCHRONOUSLY into the live anchor before the awaiting child bumps the
    // pending count — so `move_effect` moves a node that already has a committed engine node into
    // a fragment that has none. `fragment.append(liveNode)` in real DOM takes the node OUT of the
    // document; the shim must make the same thing true of the engine tree, or the sibling keeps
    // painting underneath the pending snippet.
    compileToFile(
      `<script>
         let { gate } = $props();
         const label = await gate.promise;
       </script>` +
        `<symbiote-view p={{ testID: 'child' }}><symbiote-text p={{}}>{label}</symbiote-text></symbiote-view>`,
      'AwaitingChild',
      AWAITING_CHILD_MODULE,
    );

    const Guarded = await compileComponent(
      `<script>
         import Child from './${AWAITING_CHILD_MODULE}';
         let { gate } = $props();
       </script>` +
        `<svelte:boundary>` +
        `<symbiote-view p={{ testID: 'sibling' }}><symbiote-text p={{}}>sync</symbiote-text></symbiote-view>` +
        `<Child {gate} />` +
        `{#snippet pending()}<symbiote-view p={{ testID: 'pending' }}><symbiote-text p={{}}>loading</symbiote-text></symbiote-view>{/snippet}` +
        `</svelte:boundary>`,
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
    expect(fabric.serialize(appChildren())).toBe(
      'RCTView(RCTText(RCTRawText "sync"))RCTView(RCTText(RCTRawText "resolved"))',
    );
  });
});
