// Real execution of `<svelte:boundary>` against the renderer, which runs `$.boundary`
// The preprocessor permits it and `tsc --build` sees nothing, so nothing else ever ran it

// A boundary tears down a committed subtree from an error handler, then can restore it by `reset()`
// Every assertion checks the exact committed child list, as `toBeDefined()` misses a half-torn-down
// subtree, a leftover anchor promoted to an empty `RCTRawText`, or a duplicated set after `reset()`

// The harness is `mount-pipeline.smoke.test.ts`'s, and each compiled file has its own name
// because Node caches `import()` by path

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// `root-element.ts` inserts an unlabeled `view` between the AppContainer and the mounted component
// Children are read off the live root, as `fabric.find()` walks the creation log
// and would still report a subtree the boundary has since torn down
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

type IThrowControl = {
  shouldThrow: boolean;
  reset: () => void;
  /**
   * Captures the `reset` the failed snippet was handed, and returns the marker's prop bag
   * The capture rides the bag, as a `{@const}` compiles to a lazy `$.derived` nothing reads
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

// A child component, not an inline throw, so the boundary unwinds a subtree that began rendering
const THROWING_CHILD_SOURCE = `<script>
     let { control } = $props();
     if (control.shouldThrow) throw new Error('child exploded');
   </script><view p={{ testID: 'child' }}><text p={{}}>ok</text></view>`;

describe('<svelte:boundary> (real compiled output, real fake-Fabric)', () => {
  // No Negative group, as `mount()` never throws here
  // A child throwing is what a boundary catches, so those scenarios sit under "Recovers"
  describe('Positive (renders and updates without any child throwing)', () => {
    // On the happy path only the wrapped children commit, never the `failed` snippet beside them
    it('is transparent when nothing throws — children commit, the failed snippet does not', async () => {
      const Guarded = await compileComponent(
        `<svelte:boundary><view p={{ testID: 'child' }}><text p={{}}>ok</text></view>
         {#snippet failed(error, reset)}<view p={{ testID: 'failed' }}></view>{/snippet}
         </svelte:boundary>`,
        'Transparent',
      );

      mount(ROOT_TAG, Guarded);
      await tick();
      await tick();

      // Exactly one child, as the boundary's anchor stays an engine anchor the commit skips
      expect(testIds()).toEqual(['child']);
      expect(serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "ok"))',
      );
    });

    // A boundary around a live `{#each}` must not pin child identity or disturb its keyed diff
    it('wraps a real {#each} list, keeping exact child order across a list mutation', async () => {
      const Guarded = await compileComponent(
        `<script>
         let { control } = $props();
         let rows = $state(control.rows);
         control.setRows = next => { rows = next; };
       </script>
       <view p={{ testID: 'list' }}><svelte:boundary>
       {#each rows as row (row)}<view p={{ testID: row }}><text p={{}}>{row}</text></view>{/each}
       {#snippet failed(error, reset)}<view p={{ testID: 'failed' }}></view>{/snippet}
       </svelte:boundary></view>`,
        'BoundaryList',
      );

      const control: { rows: string[]; setRows: (next: string[]) => void } = {
        rows: ['a', 'b', 'c'],
        setRows: () => {},
      };
      mount(ROOT_TAG, Guarded, { control });
      await tick();
      await tick();

      const listChildren = (): ILiveNode[] => appChildren()[0]?.children ?? [];
      expect(listChildren().map(child => child.props.testID)).toEqual([
        'a',
        'b',
        'c',
      ]);

      // Reorder, grow and shrink in one update moves nodes around the boundary's anchor
      // A mis-managed anchor would surface here as a wrong order
      control.setRows(['c', 'd', 'a']);
      await tick();
      await tick();

      expect(listChildren().map(child => child.props.testID)).toEqual([
        'c',
        'd',
        'a',
      ]);
      expect(serialize(listChildren())).toBe(
        'RCTView(RCTText(RCTRawText "c"))RCTView(RCTText(RCTRawText "d"))RCTView(RCTText(RCTRawText "a"))',
      );
    });
  });

  describe('Recovers (a child throws during render — the boundary catches it, not propagates it)', () => {
    // Recovery is real only if the thrown subtree is fully torn down
    // and `onerror` receives the real Error
    it('renders the failed snippet and fires onerror when a child throws during render', async () => {
      compileToFile(THROWING_CHILD_SOURCE, 'ThrowingChild', CHILD_MODULE);
      const Guarded = await compileComponent(
        `<script>
         import Child from './${CHILD_MODULE}';
         let { control } = $props();
       </script>
       <svelte:boundary onerror={control.onError}><Child {control} />
       {#snippet failed(error, reset)}
       <view p={{ testID: 'failed' }}><text p={{}}>{error.message}</text></view>
       {/snippet}</svelte:boundary>`,
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

      // The child's subtree must be gone, not merely hidden behind the failed snippet
      expect(testIds()).toEqual(['failed']);
      expect(serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "child exploded"))',
      );
    });

    // `reset()` is the retry an app wires to a button
    // The children must be rebuilt exactly once, never duplicated beside the failed snippet
    it('restores the children when reset() is called from the failed snippet', async () => {
      compileToFile(THROWING_CHILD_SOURCE, 'ThrowingChild', CHILD_MODULE);
      // The reset travels out of the failed snippet through `IThrowControl.failedBag`
      const Guarded = await compileComponent(
        `<script>
         import Child from './${CHILD_MODULE}';
         let { control } = $props();
       </script>
       <svelte:boundary><Child {control} />
       {#snippet failed(error, reset)}
       <view p={control.failedBag(reset)}><text p={{}}>{error.message}</text></view>
       {/snippet}</svelte:boundary>`,
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

      // Back to exactly the child, with the failed subtree gone and no second copy left
      expect(testIds()).toEqual(['child']);
      expect(serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "ok"))',
      );
    });
  });
});
