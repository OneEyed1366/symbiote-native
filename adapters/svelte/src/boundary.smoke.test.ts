// Real execution of `<svelte:boundary>` against the DOM shim. Like `{#await}`, the construct was
// only ever COMPILE-verified before this file: the preprocessor permits it and `tsc --build` sees
// nothing, but no test in the repo had ever run `$.boundary`
// (svelte/internal/client/dom/blocks/boundary.js).
//
// Boundary is the one construct that TEARS DOWN an already-committed subtree and replaces it from
// an error handler, then can restore it via `reset()` — three tree rewrites driven from outside
// the normal render pass. Every assertion checks the EXACT committed Fabric child list: a
// half-torn-down subtree, a leftover anchor promoted to an empty RCTRawText, or a duplicated
// child set after `reset()` is precisely what this construct can produce and what a
// `toBeDefined()` assertion would miss.
//
// Harness shape is mount-pipeline.smoke.test.ts's; every compiled artifact gets its own filename
// because Node caches import() by path (skill §15).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

// RN sets both before any app code runs (setUpGlobals.js / setUpNavigator.js); a bare vitest
// sandbox has neither, and svelte's init_operations() reads both at first mount.
if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_302;
const TMP_DIR = join(__dirname, '../build/__boundary_smoke__');
const CHILD_MODULE = 'throwing-child.mjs';

const fabric = installFabric();
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
  });
  compileCounter += 1;
  const file = join(
    TMP_DIR,
    fileName ?? `${name}-${String(compileCounter)}.mjs`,
  );
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
    throw new Error(
      `compiled ${name}.svelte default export is not a component`,
    );
  }
  return component;
}

async function compileComponent(
  source: string,
  name: string,
): Promise<Component> {
  return loadComponent(compileToFile(source, name), name);
}

// root-element.ts inserts an unlabeled `symbiote-view` between the box-none AppContainer and the
// mounted component (skill §15). Reading children off `fabric.appRoot()` rather than
// `fabric.find()` is deliberate: find() walks the creation log and would still report a subtree
// the boundary has since torn down.
function appChildren(): IFakeNode[] {
  const wrapper = fabric.appRoot().children[0];
  expect(wrapper, 'the root wrapper symbiote-view committed').toBeDefined();
  return wrapper?.children ?? [];
}

function testIds(): Array<unknown> {
  return appChildren().map(child => child.props.testID);
}

type IThrowControl = {
  shouldThrow: boolean;
  reset: () => void;
  /**
   * Captures the `reset` the failed snippet was handed, and returns the prop bag for the marker
   * node. Routing the capture through the BAG expression rather than a `{@const}` is deliberate:
   * `{@const}` compiles to a lazy `$.derived`, so a const nothing reads is never evaluated and
   * the capture silently never happens (verified by reading the compiled output). A prop bag is
   * always evaluated, because `set_custom_element_data` consumes it.
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
   </script>` +
  `<symbiote-view p={{ testID: 'child' }}><symbiote-text p={{}}>ok</symbiote-text></symbiote-view>`;

describe('<svelte:boundary> (real compiled output, real fake-Fabric)', () => {
  // No true Negative group: `mount()` itself never throws in any of these scenarios — a child
  // throwing during render is exactly the case `<svelte:boundary>` exists to catch, so the two
  // "a child throws" scenarios below are grouped as "Recovers" (the correct handling of an error
  // that DID happen), distinct from a Negative scenario asserting mount() itself must reject.
  describe('Positive (renders and updates without any child throwing)', () => {
    // why: the boundary must contribute NO native node of its own on the happy path — only the
    // wrapped children commit, and the `failed` snippet must not also render alongside them.
    it('is transparent when nothing throws — children commit, the failed snippet does not', async () => {
      const Guarded = await compileComponent(
        `<svelte:boundary>` +
          `<symbiote-view p={{ testID: 'child' }}><symbiote-text p={{}}>ok</symbiote-text></symbiote-view>` +
          `{#snippet failed(error, reset)}<symbiote-view p={{ testID: 'failed' }}></symbiote-view>{/snippet}` +
          `</svelte:boundary>`,
        'Transparent',
      );

      mount(ROOT_TAG, Guarded);
      await tick();
      await tick();

      // Exactly one child: the boundary itself must contribute NO native node of its own, and its
      // anchor must stay an engine anchor the commit walk skips.
      expect(testIds()).toEqual(['child']);
      expect(fabric.serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "ok"))',
      );
    });

    // why: a boundary wrapping a live `{#each}` must let the each-block's own keyed diff run
    // normally underneath it — the boundary's presence must not pin child identity or otherwise
    // interfere with an ordinary reorder+grow+shrink update.
    it('wraps a real {#each} list, keeping exact child order across a list mutation', async () => {
      const Guarded = await compileComponent(
        `<script>
         let { control } = $props();
         let rows = $state(control.rows);
         control.setRows = next => { rows = next; };
       </script>` +
          `<symbiote-view p={{ testID: 'list' }}>` +
          `<svelte:boundary>` +
          `{#each rows as row (row)}<symbiote-view p={{ testID: row }}><symbiote-text p={{}}>{row}</symbiote-text></symbiote-view>{/each}` +
          `{#snippet failed(error, reset)}<symbiote-view p={{ testID: 'failed' }}></symbiote-view>{/snippet}` +
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

      const listChildren = (): IFakeNode[] => appChildren()[0]?.children ?? [];
      expect(listChildren().map(child => child.props.testID)).toEqual([
        'a',
        'b',
        'c',
      ]);

      // Reorder + grow + shrink in one update: the each-block's keyed diff moves nodes around the
      // boundary's own anchor, which is where a mis-managed anchor would surface as a wrong order.
      control.setRows(['c', 'd', 'a']);
      await tick();
      await tick();

      expect(listChildren().map(child => child.props.testID)).toEqual([
        'c',
        'd',
        'a',
      ]);
      expect(fabric.serialize(listChildren())).toBe(
        'RCTView(RCTText(RCTRawText "c"))RCTView(RCTText(RCTRawText "d"))RCTView(RCTText(RCTRawText "a"))',
      );
    });
  });

  describe('Recovers (a child throws during render — the boundary catches it, not propagates it)', () => {
    // why: an error thrown from a child's own init is the shape a boundary exists to catch in
    // real app code, and recovery is only real if the thrown subtree is FULLY torn down (not
    // merely hidden behind the failed snippet) and `onerror` actually receives the real Error.
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
          `<symbiote-view p={{ testID: 'failed' }}><symbiote-text p={{}}>{error.message}</symbiote-text></symbiote-view>` +
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
      expect(fabric.serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "child exploded"))',
      );
    });

    // why: `reset()` is the boundary's own retry mechanism — a real app wires it to a "try again"
    // button, and recovery must be exact: the failed subtree torn down, the children rebuilt
    // once, never left duplicated alongside the failed snippet.
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
          `<symbiote-view p={control.failedBag(reset)}><symbiote-text p={{}}>{error.message}</symbiote-text></symbiote-view>` +
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
      expect(fabric.serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "ok"))',
      );
    });
  });
});
