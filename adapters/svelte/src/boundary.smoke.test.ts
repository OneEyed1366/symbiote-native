// Real execution of `<svelte:boundary>` against the official custom-renderer API. Like `{#await}`,
// the construct was only ever COMPILE-verified before this file: no test in the repo had ever run
// `$.boundary` (svelte/internal/client/dom/blocks/boundary.js).
//
// Boundary is the one construct that TEARS DOWN an already-committed subtree and replaces it from
// an error handler, then can restore it via `reset()` — three tree rewrites driven from outside
// the normal render pass. Every assertion checks the EXACT committed Fabric child list: a
// half-torn-down subtree, a leftover anchor promoted to an empty RCTRawText, or a duplicated
// child set after `reset()` is precisely what this construct can produce and what a
// `toBeDefined()` assertion would miss.
//
// Harness shape is mount-pipeline.smoke.test.ts's; every compiled artifact gets its own filename
// because Node caches import() by path.
//
// `experimental.async: true` is REQUIRED here, not optional, even though nothing in this file
// actually suspends: the git-pinned compiler's `SvelteBoundary.js` visitor has a real bug in its
// NON-async, customRenderer branch (`snippet_fn.body.body.unshift(...)` at
// `compiler/phases/3-transform/client/visitors/SvelteBoundary.js:95`, throwing `Cannot read
// properties of undefined (reading 'body')`) that fires for ANY `<svelte:boundary>` carrying ANY
// snippet (`failed`, `pending`, or any other name — confirmed by compiling minimal repros of
// each) the moment `experimental.customRenderer` is set without `experimental.async`. Setting
// `async: true` alongside `customRenderer` takes the OTHER branch of that same `if` and avoids
// the crash entirely (confirmed by compiling the exact same source both ways). `should_defer_
// append()` (dom/operations.js) still only defers a REACTION_RAN-flagged re-render, never a first
// render, so this file's synchronous, single-render assertions are unaffected in practice; where
// a later update genuinely could take the offscreen-fragment path (the {#each} mutation test),
// `isSvelteBootstrapAnchor` below already filters the empty-text artifacts that path can leave
// behind.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const ROOT_TAG = 91_302;
const TMP_DIR = join(__dirname, '../build/__boundary_smoke__');
const CHILD_MODULE = 'throwing-child.mjs';

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

async function loadComponent(file: string, name: string): Promise<Component> {
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

async function compileComponent(source: string, name: string): Promise<Component> {
  return loadComponent(compileToFile(source, name), name);
}

// render.ts's mount() inserts an unlabeled `symbiote-view` wrapper between the box-none
// AppContainer and the mounted component. Reading children off `fabric.appRoot()` rather than
// `fabric.find()` is deliberate: find() walks the creation log and would still report a subtree
// the boundary has since torn down.
//
// Two EMPTY RCTRawText nodes always land here too, unrelated to anything this file exercises:
// Svelte's own `_mount_inner` (render.js) creates `append_child(target, create_text())` as its
// `anchor_node` whenever `mount()` is called without an explicit `anchor` option (render.ts never
// passes one), and — when the compiled component's own top-level content has no static leading
// element, as every fixture here doesn't — the compiler wraps it in `$.comment()`
// (dom/template.js), whose own trailing `anchor = create_text()` marks the end of the component's
// root effect range. Both are real `create_text('')` calls, dispatched to our renderer exactly
// like any other text node (confirmed by reading render.js/template.js directly) — `isAnchor()`
// only skips nodes built via `createComment`/`createAnchor`, not an empty raw-text node, so the
// engine's commit walk does NOT skip them. Filtering by an empty string is safe here because every
// fixture's OWN raw text always carries real content; a real empty text node is never part of this
// file's intended markup.
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

type IThrowControl = {
  shouldThrow: boolean;
  reset: () => void;
  /**
   * Captures the `reset` the failed snippet was handed, and returns the attributes to spread onto
   * the marker node. Routing the capture through this SPREAD expression rather than a `{@const}`
   * is deliberate: `{@const}` compiles to a lazy `$.derived`, so a const nothing reads is never
   * evaluated and the capture silently never happens (verified by reading the compiled output). A
   * spread attribute is always evaluated, because `attribute_effect` consumes it.
   */
  failedBag: (reset: () => void) => Record<string, unknown>;
  onError: (error: unknown, reset: () => void) => void;
};

function throwControl(): IThrowControl {
  const control: IThrowControl = {
    shouldThrow: true,
    reset: () => {},
    failedBag: reset => {
      control.reset = reset;
      return { testID: 'failed' };
    },
    onError: () => {},
  };
  return control;
}

// A child COMPONENT rather than an inline throw: an error thrown from a child's own init is the
// shape a boundary exists to catch in real app code, and it forces the boundary to unwind a
// subtree that has already begun rendering.
const THROWING_CHILD_SOURCE =
  `<script>
     let { control } = $props();
     if (control.shouldThrow) throw new Error('child exploded');
   </script>` + `<symbiote-view testID="child"><symbiote-text>ok</symbiote-text></symbiote-view>`;

describe('<svelte:boundary> (real compiled output, real fake-Fabric)', () => {
  it('is transparent when nothing throws — children commit, the failed snippet does not', async () => {
    const Guarded = await compileComponent(
      `<svelte:boundary>` +
        `<symbiote-view testID="child"><symbiote-text>ok</symbiote-text></symbiote-view>` +
        `{#snippet failed(error, reset)}<symbiote-view testID="failed"></symbiote-view>{/snippet}` +
        `</svelte:boundary>`,
      'Transparent',
    );

    mount(ROOT_TAG, Guarded);
    await tick();
    await tick();

    // Exactly one child: the boundary itself must contribute NO native node of its own, and its
    // anchor must stay an engine anchor the commit walk skips.
    expect(testIds()).toEqual(['child']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "ok"))');
  });

  it('renders the failed snippet and fires onerror when a child throws during render', async () => {
    compileToFile(THROWING_CHILD_SOURCE, 'ThrowingChild', CHILD_MODULE);
    const Guarded = await compileComponent(
      `<script>
         import Child from './${CHILD_MODULE}';
         let { control } = $props();
       </script>` +
        `<svelte:boundary onerror={control.onError}>` +
        `<Child {control} />` +
        `{#snippet failed(error, reset)}` +
        `<symbiote-view testID="failed"><symbiote-text>{error.message}</symbiote-text></symbiote-view>` +
        `{/snippet}` +
        `</svelte:boundary>`,
      'CatchingBoundary',
    );

    const control = throwControl();
    const onError = vi.fn();
    control.onError = onError;

    mount(ROOT_TAG, Guarded, { control });
    await tick();
    await tick();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);

    // The child's own subtree must be fully gone, not merely hidden behind the failed snippet.
    expect(testIds()).toEqual(['failed']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "child exploded"))');
  });

  it('restores the children when reset() is called from the failed snippet', async () => {
    compileToFile(THROWING_CHILD_SOURCE, 'ThrowingChild', CHILD_MODULE);
    // The reset really does travel out of the failed snippet (see IThrowControl.failedBag),
    // exactly as an app would wire it to a retry button.
    const Guarded = await compileComponent(
      `<script>
         import Child from './${CHILD_MODULE}';
         let { control } = $props();
       </script>` +
        `<svelte:boundary>` +
        `<Child {control} />` +
        `{#snippet failed(error, reset)}` +
        `<symbiote-view {...control.failedBag(reset)}><symbiote-text>{error.message}</symbiote-text></symbiote-view>` +
        `{/snippet}` +
        `</svelte:boundary>`,
      'ResettableBoundary',
    );

    const control = throwControl();
    mount(ROOT_TAG, Guarded, { control });
    await tick();
    await tick();
    expect(testIds()).toEqual(['failed']);

    control.shouldThrow = false;
    control.reset();
    await tick();
    await tick();

    // Back to exactly the child — the failed subtree must be torn down, and re-rendering the
    // children must not leave a second copy behind.
    expect(testIds()).toEqual(['child']);
    expect(fabric.serialize(appChildren())).toBe('RCTView(RCTText(RCTRawText "ok"))');
  });

  it('wraps a real {#each} list, keeping exact child order across a list mutation', async () => {
    const Guarded = await compileComponent(
      `<script>
         let { control } = $props();
         let rows = $state(control.rows);
         control.setRows = next => { rows = next; };
       </script>` +
        `<symbiote-view testID="list">` +
        `<svelte:boundary>` +
        `{#each rows as row (row)}<symbiote-view testID={row}><symbiote-text>{row}</symbiote-text></symbiote-view>{/each}` +
        `{#snippet failed(error, reset)}<symbiote-view testID="failed"></symbiote-view>{/snippet}` +
        `</svelte:boundary>` +
        `</symbiote-view>`,
      'BoundaryList',
    );

    const control: { rows: string[]; setRows: (next: string[]) => void } = {
      rows: ['a', 'b', 'c'],
      setRows: () => {},
    };
    mount(ROOT_TAG, Guarded, { control });
    await tick();
    await tick();

    // Filtered for the same reason `appChildren()` is: a keyed {#each} re-render can take the
    // async-mode offscreen-fragment path too, which leaves its own empty-text anchor behind.
    const listChildren = (): IFakeNode[] =>
      (appChildren()[0]?.children ?? []).filter(child => !isSvelteBootstrapAnchor(child));
    expect(listChildren().map(child => child.props.testID)).toEqual(['a', 'b', 'c']);

    // Reorder + grow + shrink in one update: the each-block's keyed diff moves nodes around the
    // boundary's own anchor, which is where a mis-managed anchor would surface as a wrong order.
    control.setRows(['c', 'd', 'a']);
    await tick();
    await tick();

    expect(listChildren().map(child => child.props.testID)).toEqual(['c', 'd', 'a']);
    expect(fabric.serialize(listChildren())).toBe(
      'RCTView(RCTText(RCTRawText "c"))RCTView(RCTText(RCTRawText "d"))RCTView(RCTText(RCTRawText "a"))',
    );
  });
});
