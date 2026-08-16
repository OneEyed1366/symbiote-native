// The DEFERRED half of `{#await}` / `<svelte:boundary>` — the paths that actually allocate an
// offscreen fragment (via `renderer.ts`'s `createFragmentNode`, dispatched through
// `current_renderer.createFragment()` — `dom/operations.js`'s `create_fragment()`) and render
// OFFSCREEN before splicing the result in.
//
// Why this needs its own file: those paths are gated on Svelte's async mode.
// `should_defer_append()` (dom/operations.js) short-circuits on `async_mode_flag`, so
// `BranchManager`'s offscreen branch and `<svelte:boundary>`'s `pending` snippet
// (dom/blocks/boundary.js:272/305 — `create_fragment` + `move_effect`) are UNREACHABLE
// unless the component was compiled with `experimental: { async: true }`. The sibling
// await-block/boundary smokes compile with this repo's own svelte.config.js options, which do
// not set it, so they exercise the synchronous branch path only. That flag is turned on by a
// module side effect (`svelte/internal/flags/async`, emitted into the compiled output) and is
// process-wide with no supported way back, hence a separate file — vitest isolates each test
// file's module registry.
//
// This exercises the `IFragmentNode` design at full strength (renderer.ts, §1 of the
// svelte-adapter-custom-renderer skill): a subtree is rendered into a LIVE parent, moved into an
// offscreen fragment (tracked via `fragmentParentOf`), and spliced back later. Assertions check
// the exact committed Fabric child list, because the failure mode is a node that is present
// twice, or still present after being moved away.

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
    experimental: { async: true, customRenderer: '@symbiote-native/svelte/renderer' },
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

// Empty RCTRawText nodes always land here, unrelated to anything this file exercises: Svelte's
// own `_mount_inner` (render.js) creates `append_child(target, create_text())` as its `anchor_node`
// whenever `mount()` is called without an explicit `anchor` option (render.ts never passes one);
// the compiler wraps a component whose own top-level content has no static leading element (every
// fixture here) in `$.comment()` (dom/template.js), whose own trailing `anchor = create_text()`
// marks the end of the component's root effect range; and — specific to THIS file's async mode —
// `BranchManager`'s own offscreen-fragment anchor (`branches.js`'s `var target = create_text()`,
// gated on `should_defer_append()`) is itself an empty text node that gets spliced back in
// alongside the branch it anchors. All are real `create_text('')` calls, dispatched to our
// renderer exactly like any other text node (confirmed by reading render.js/template.js/
// branches.js directly) — `isAnchor()` only skips nodes built via `createComment`/`createAnchor`,
// not an empty raw-text node, so the engine's commit walk does NOT skip them. Filtering by an
// empty string is safe here because every fixture's OWN raw text always carries real content; a
// real empty text node is never part of this file's intended markup.
function isSvelteBootstrapAnchor(node: IFakeNode): boolean {
  return node.viewName === 'RCTRawText' && node.props.text === '';
}

function appChildren(): IFakeNode[] {
  const wrapper = fabric.appRoot().children[0];
  expect(wrapper, 'the root wrapper symbiote-view committed').toBeDefined();
  return (wrapper?.children ?? []).filter(child => !isSvelteBootstrapAnchor(child));
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
        `{#await current}<symbiote-view testID="pending"><symbiote-text>loading</symbiote-text></symbiote-view>` +
        `{:then value}<symbiote-view testID="then"><symbiote-text>{value}</symbiote-text></symbiote-view>{/await}`,
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
    // then `move_effect` rips them into a fresh offscreen fragment, and `#anchor.before(fragment)`
    // splices them back once the promise settles. `insertNode` (renderer.ts) removing a node from
    // its old parent — real or fragment — before re-inserting is what keeps this from leaving the
    // child painted the whole time and then committed twice.
    compileToFile(
      `<script>
         let { gate } = $props();
         const label = await gate.promise;
       </script>` +
        `<symbiote-view testID="child"><symbiote-text>{label}</symbiote-text></symbiote-view>`,
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
        `{#snippet pending()}<symbiote-view testID="pending"><symbiote-text>loading</symbiote-text></symbiote-view>{/snippet}` +
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
    // a fragment that has none. `insertNode`'s `removeNode(node)` call (renderer.ts) must take the
    // node OUT of the real engine tree the same way `fragment.append(liveNode)` takes it out of a
    // real DOM, or the sibling keeps painting underneath the pending snippet.
    compileToFile(
      `<script>
         let { gate } = $props();
         const label = await gate.promise;
       </script>` +
        `<symbiote-view testID="child"><symbiote-text>{label}</symbiote-text></symbiote-view>`,
      'AwaitingChild',
      AWAITING_CHILD_MODULE,
    );

    const Guarded = await compileComponent(
      `<script>
         import Child from './${AWAITING_CHILD_MODULE}';
         let { gate } = $props();
       </script>` +
        `<svelte:boundary>` +
        `<symbiote-view testID="sibling"><symbiote-text>sync</symbiote-text></symbiote-view>` +
        `<Child {gate} />` +
        `{#snippet pending()}<symbiote-view testID="pending"><symbiote-text>loading</symbiote-text></symbiote-view>{/snippet}` +
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
