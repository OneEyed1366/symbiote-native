// TouchableWithoutFeedback over REAL compiled `.svelte` output, written for the 2026-08-19 RN
// audit migration.
//
// SCOPE. The press-scheduling machine is unit-tested in core/components, the press lifecycle in
// ../pressable/pressable.smoke.test.ts. What is left, and what this file is for: RN's
// TouchableWithoutFeedback builds a FULL Pressability config — "without feedback" means no
// VISUAL, not no TIMING — and the pre-audit port spread the delay props straight into Pressable,
// which neither schedules them nor stops them reaching the host as unknown Fabric props. Both
// halves of that are asserted below, plus RN's minPressDuration: 0 override by the test that
// AWAITS NOTHING (.claude/rules/test-harness-false-greens.md §5).
//
// No Negative group: this component has no rejecting path.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  installFabric,
  waitUntil,
  type IFakeNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_203;
const TARGET = 'without-feedback-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const BASE_WIDTH = 14;
const PRESS_DELAY_MS = 30;

const COMPONENTS_DIR = join(__dirname, '..');
// `-for-without-feedback` per .claude/rules/smoke-compiled-artifact-collisions.md: Pressable is
// owned by ../pressable/pressable.smoke.test.ts and vitest runs files concurrently.
const PRESSABLE_OUT = join(
  COMPONENTS_DIR,
  'pressable',
  '.smoke-compiled-pressable-for-without-feedback.mjs',
);
const TOUCHABLE_OUT = join(__dirname, '.smoke-compiled-without-feedback.mjs');
const PARENT_OUT = join(
  __dirname,
  '.smoke-compiled-without-feedback-parent.mjs',
);

const fabric = installFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
  rewrites: ReadonlyArray<readonly [string, string]> = [],
): void {
  let code = compile(source, { ...COMPILE_OPTIONS, filename }).js.code;
  for (const [from, to] of rewrites) code = code.replace(from, to);
  writeFileSync(outPath, code);
}

async function loadParent(): Promise<Component> {
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'pressable', 'index.svelte'), 'utf8'),
    'Pressable.svelte',
    PRESSABLE_OUT,
  );
  compileToFile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    'TouchableWithoutFeedback.svelte',
    TOUCHABLE_OUT,
    [
      [
        "from '../pressable/index.svelte'",
        "from '../pressable/.smoke-compiled-pressable-for-without-feedback.mjs'",
      ],
    ],
  );
  compileToFile(
    `<script>
       import TouchableWithoutFeedback from './.smoke-compiled-without-feedback.mjs';
       let props = $props();
     </script>
     <TouchableWithoutFeedback {...props}>
       {#snippet children()}
         <symbiote-view p={{ testID: 'without-feedback-child' }} />
       {/snippet}
     </TouchableWithoutFeedback>`,
    'Parent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('Parent.svelte produced no default export');
  }
  return mod.default as Component;
}

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PRESSABLE_OUT, { force: true });
  rmSync(TOUCHABLE_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  function walk(node: IFakeNode): IFakeNode | undefined {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  return walk(fabric.appRoot());
}

function hostNode(): IFakeNode {
  const node = findCommitted(n => n.props.testID === TARGET);
  if (node === undefined) throw new Error(`no committed node testID=${TARGET}`);
  return node;
}

function responderHandle(): unknown {
  const node = fabric.find(n => n.props.testID === TARGET);
  if (node === undefined) throw new Error(`no node created testID=${TARGET}`);
  return node.instanceHandle;
}

describe('Svelte TouchableWithoutFeedback (real compiled index.svelte)', () => {
  // why: proves it is not an inert View — it still synthesizes the full press cycle — while
  // deliberately never touching backgroundColor/opacity the way its two siblings do.
  it('fires the press cycle with no visual feedback applied', async () => {
    const Parent = await loadParent();
    let presses = 0;
    let pressIns = 0;
    let pressOuts = 0;
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      style: { width: BASE_WIDTH },
      onPress: () => {
        presses += 1;
      },
      onPressIn: () => {
        pressIns += 1;
      },
      onPressOut: () => {
        pressOuts += 1;
      },
    });
    await tick();
    await tick();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await waitUntil(() => pressIns === 1, 'onPressIn after touch-start');
    expect(hostNode().props.backgroundColor).toBeUndefined();
    expect(hostNode().props.opacity).toBeUndefined();
    expect(hostNode().props.width).toBe(BASE_WIDTH);

    fabric.fireEvent(handle, TOUCH_END);
    await waitUntil(() => presses === 1, 'onPress after touch-end');
    expect(pressOuts).toBe(1);
  });

  // why: RN builds a FULL Pressability config here, delayPressIn included. The pre-audit port
  // spread it into Pressable, which owns no press-delay scheduling — silent, because the callback
  // still fires, just at the wrong moment.
  it('defers onPressIn past touch-down with delayPressIn', async () => {
    const Parent = await loadParent();
    let pressIns = 0;
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      delayPressIn: PRESS_DELAY_MS,
      onPressIn: () => {
        pressIns += 1;
      },
    });
    await tick();
    await tick();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    expect(pressIns, 'fired before the delay elapsed').toBe(0);
    await waitUntil(() => pressIns === 1, 'onPressIn after delayPressIn');
  });

  // why: RN's Touchables pass minPressDuration: 0. THIS TEST AWAITS NOTHING AFTER THE RELEASE ON
  // PURPOSE — any flush helper burns straight past a 130ms floor and the assertion passes either
  // way (.claude/rules/test-harness-false-greens.md §5).
  it('deactivates synchronously — no minPressDuration floor by default', async () => {
    const Parent = await loadParent();
    let pressOuts = 0;
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      onPressOut: () => {
        pressOuts += 1;
      },
    });
    await tick();
    await tick();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(pressOuts, 'a floor would have deferred this past the tick').toBe(1);
  });

  // why: the three delay props are CONSUMED by the shared machine, so they must not also reach the
  // host as unknown Fabric props. The pre-audit port spread all three straight through.
  it('does not forward the delay props to the host node', async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      delayPressIn: PRESS_DELAY_MS,
      delayPressOut: PRESS_DELAY_MS,
      minPressDuration: 0,
      onPress: () => {},
    });
    await tick();
    await tick();

    expect(hostNode().props.delayPressIn).toBeUndefined();
    expect(hostNode().props.delayPressOut).toBeUndefined();
    expect(hostNode().props.minPressDuration).toBeUndefined();
  });
});
