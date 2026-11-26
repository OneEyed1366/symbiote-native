// Real execution of `{#await}` through the renderer, which was only compile-verified before
// Nothing ran `$.await_block` (svelte/internal/client/dom/blocks/await.js) until this file

// `{#await}` renders one branch, then swaps it after mount through a `BranchManager`
// So every assertion checks the exact committed Fabric child list: a stray anchor, a leftover
// branch or a duplicated subtree is the failure shape this construct can produce

// Harness as in `mount-pipeline.smoke.test.ts`: compile real source to a uniquely-named file
// under build/ and dynamic-import it, as Node caches `import()` by path

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

// RN sets both before any app code runs (setUpGlobals.js / setUpNavigator.js); a bare vitest
// sandbox has neither, and svelte's init_operations() reads both at first mount.
if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_301;
const TMP_DIR = join(__dirname, '../build/__await_smoke__');

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

async function compileComponent(
  source: string,
  name: string,
): Promise<Component> {
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
    throw new Error(
      `compiled ${name}.svelte default export is not a component`,
    );
  }
  return component;
}

// `root-element.ts` inserts an unlabeled `view` between the AppContainer and the component
// So the component's top-level nodes are the wrapper's children, read off `fabric.appRoot()`
// as `fabric.find()` walks the creation log and would still report a swapped-out branch
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

// Marks a branch with a unique `testID` and a Text child, so a leftover branch shows up as an
// extra `testIds()` entry and as an extra subtree
// Packed edge-to-edge, as whitespace between sibling tags becomes a real `RCTRawText`
function branchMarkup(id: string, label: string): string {
  return `<view p={{ testID: '${id}' }}><text p={{}}>${label}</text></view>`;
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
  // No Negative group: `mount()` never throws here, as `{#await}` catches a rejection itself
  // and renders `{:catch}`, which is grouped separately below as "Recovers"
  describe('Positive (resolves successfully)', () => {
    // why: the core await contract — pending renders first, then swaps to the resolved value once
    // the promise settles, with the pending subtree fully gone rather than left alongside it.
    it('paints pending, then swaps to then when the promise resolves AFTER mount', async () => {
      const Awaiter = await compileComponent(
        `<script>let { promise } = $props();</script>` +
          `{#await promise}${branchMarkup('pending', 'loading')}` +
          `{:then value}<view p={{ testID: 'then' }}><text p={{}}>{value}</text></view>` +
          `{:catch error}${branchMarkup('catch', 'boom')}{/await}`,
        'Awaiter',
      );

      const gate = deferred();
      mount(ROOT_TAG, Awaiter, { promise: gate.promise });
      await tick();

      // Exactly the pending branch — not pending PLUS an anchor-turned-RCTRawText, and not both
      // branches at once.
      expect(testIds()).toEqual(['pending']);
      expect(serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "loading"))',
      );

      gate.resolve('ready');
      await tick();
      await tick();

      // The pending subtree must be GONE, not merely followed by the then subtree.
      expect(testIds()).toEqual(['then']);
      expect(serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "ready"))',
      );
    });

    // The short form has no pending snippet, so the block must contribute a real engine anchor
    // and not an empty `RCTRawText` while unresolved
    it('renders nothing until resolution in the `{#await expr then value}` short form', async () => {
      const Awaiter = await compileComponent(
        `<script>let { promise } = $props();</script>` +
          `{#await promise then value}<view p={{ testID: 'then' }}><text p={{}}>{value}</text></view>{/await}`,
        'AwaiterShort',
      );

      const gate = deferred();
      mount(ROOT_TAG, Awaiter, { promise: gate.promise });
      await tick();

      // No pending branch exists, so the block contributes no native node: its anchor is an
      // engine anchor the commit walk skips, never an empty `RCTRawText`
      expect(appChildren()).toHaveLength(0);

      gate.resolve('late');
      await tick();
      await tick();

      expect(testIds()).toEqual(['then']);
      expect(serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "late"))',
      );
    });

    // Re-entrancy: a replaced promise's `.then` still fires, and the `destroyed` guard of
    // await.js must keep it from installing a stale branch
    it('handles a NEW promise swapped in while the first is still pending', async () => {
      // The component publishes its setter onto the props object so the test can drive the swap
      // through the same reactive path app code would.
      const Awaiter = await compileComponent(
        `<script>
         let { control } = $props();
         let current = $state(control.initial);
         control.swap = next => { current = next; };
       </script>` +
          `{#await current}${branchMarkup('pending', 'loading')}` +
          `{:then value}<view p={{ testID: 'then' }}><text p={{}}>{value}</text></view>` +
          `{:catch error}${branchMarkup('catch', 'boom')}{/await}`,
        'AwaiterSwap',
      );

      const first = deferred();
      const second = deferred();
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
      expect(serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "fresh"))',
      );
    });

    // Three sibling `{#await}` blocks in one keyed `{#each}`, resolving out of order
    // A mis-ordered insertion shows up as a permuted child list, a leaked anchor as an extra child
    // The single-block tests above cannot exercise anchor identity across several await instances
    it('interleaves block anchors correctly when nested inside {#each}', async () => {
      const List = await compileComponent(
        `<script>let { rows } = $props();</script>` +
          `<view p={{ testID: 'list' }}>` +
          `{#each rows as row (row.key)}` +
          `{#await row.promise}<view p={{ testID: row.key + '-pending' }}></view>` +
          `{:then value}<view p={{ testID: row.key + '-then' }}><text p={{}}>{value}</text></view>{/await}` +
          `{/each}` +
          `</view>`,
        'AwaitInEach',
      );

      const gates = [deferred(), deferred(), deferred()];
      const rows = gates.map((gate, index) => ({
        key: `r${String(index)}`,
        promise: gate.promise,
      }));
      mount(ROOT_TAG, List, { rows });
      await tick();

      const listChildren = (): ILiveNode[] => appChildren()[0]?.children ?? [];
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
      expect(serialize(listChildren())).toBe(
        'RCTView(RCTText(RCTRawText "zero"))RCTView(RCTText(RCTRawText "one"))RCTView(RCTText(RCTRawText "two"))',
      );
    });
  });

  describe("Recovers (rejected promise — {#await}'s job is to catch it, not propagate it)", () => {
    // why: {:catch} exists specifically to turn a rejection into a rendered fallback instead of
    // an uncaught rejection reaching the app — this pins that the error's own message actually
    // reaches the catch snippet, not just that SOMETHING renders.
    it('paints the catch branch when the promise rejects after mount', async () => {
      const Awaiter = await compileComponent(
        `<script>let { promise } = $props();</script>` +
          `{#await promise}${branchMarkup('pending', 'loading')}` +
          `{:then value}${branchMarkup('then', 'ok')}` +
          `{:catch error}<view p={{ testID: 'catch' }}><text p={{}}>{error.message}</text></view>{/await}`,
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
      expect(serialize(appChildren())).toBe(
        'RCTView(RCTText(RCTRawText "nope"))',
      );
    });
  });
});
