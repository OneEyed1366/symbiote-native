// Proves Pressable's press lifecycle over REAL compiled `index.svelte` output — the most complex
// state machine in the Pressable/Touchable/Button family, so unlike its Touchable/Button
// siblings it gets a dedicated real-execution smoke test rather than relying on the pipeline
// smoke test's generic coverage. Compiles the real index.svelte source (not a hand-written
// stand-in) through svelte/compiler, wraps it in a small parent that renders a scoped-slot child
// reading the live `pressed` state into a `testID`, and drives the responder the way native
// would (topTouchStart/topTouchEnd on the responder node's instanceHandle) against a real
// fake-Fabric recorder — same pattern as switch.smoke.test.ts.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_003;
// Co-located with the real source (not an isolated temp dir): the compiled Pressable output's
// own imports resolve relative to WHERE THE COMPILED FILE LIVES — same reasoning as
// switch.smoke.test.ts.
const PRESSABLE_OUT = join(__dirname, '.smoke-compiled-pressable.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PRESSABLE_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadMountable(): Promise<Component> {
  const pressableSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(pressableSource, 'Pressable.svelte', PRESSABLE_OUT);

  // A parent driving the three callbacks from mount() props and reading the scoped-slot
  // `pressed` state into a child testID, so the committed fabric tree proves the state machine
  // actually flips `pressed`, not just that the callbacks fire.
  compileToFile(
    `<script>
       import Pressable from './.smoke-compiled-pressable.mjs';
       let { onPress, onPressIn, onPressOut } = $props();
     </script>
     <Pressable {onPress} {onPressIn} {onPressOut}>
       {#snippet children(state)}
         <symbiote-view p={{ testID: state.pressed ? 'pressed' : 'idle' }} />
       {/snippet}
     </Pressable>`,
    'Parent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('Parent.svelte produced no default export');
  }
  return mod.default as Component;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// The responder is Pressable's own host RCTView — identified by carrying a 'press' listener
// (buildPressableListeners always registers one), not by tree position: Svelte's compiled
// output interleaves anchor/empty-text nodes among real elements, so positional indexing
// (children[0].children[0]) is fragile. Mirrors React's pressable.test.tsx `terminationGate`
// helper, which reads the same `instanceHandle.listeners` map.
function responderHandle(): unknown {
  const view = fabric.find(n => {
    if (n.viewName !== 'RCTView') return false;
    const handle = n.instanceHandle;
    return isRecord(handle) && handle.listeners instanceof Map && handle.listeners.has('press');
  });
  if (view === undefined) throw new Error('no Pressable responder RCTView found');
  return view.instanceHandle;
}

function findInTree(
  node: IFakeNode,
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const hit = findInTree(child, predicate);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

// Unlike `responderHandle` (a stable identity read once), this must read the CURRENT props —
// `fabric.find` searches the immutable `created` snapshots (each `createNode` call's ORIGINAL
// props, never updated), so it would return the node's initial 'idle' forever. Every prop
// update instead clones the node (`cloneNodeWithNewProps`) into the live committed tree, so the
// current testID has to be read by walking `fabric.appRoot()` itself.
function innerTestID(): unknown {
  const view = findInTree(
    fabric.appRoot(),
    n => n.viewName === 'RCTView' && (n.props.testID === 'pressed' || n.props.testID === 'idle'),
  );
  return view?.props.testID;
}

describe('Pressable (real compiled index.svelte)', () => {
  it('synthesizes onPress/onPressIn/onPressOut on a touch start+end cycle', async () => {
    let presses = 0;
    let pressIns = 0;
    let pressOuts = 0;
    const Parent = await loadMountable();
    mount(ROOT_TAG, Parent, {
      onPress: () => {
        presses++;
      },
      onPressIn: () => {
        pressIns++;
      },
      onPressOut: () => {
        pressOuts++;
      },
    });
    await tick();
    await tick();

    const handle = responderHandle();
    expect(handle).toBeDefined();

    fabric.fireEvent(handle, 'topTouchStart');
    await tick();
    await tick();
    expect(pressIns).toBe(1);
    expect(presses).toBe(0);
    expect(pressOuts).toBe(0);

    fabric.fireEvent(handle, 'topTouchEnd');
    await tick();
    await tick();
    expect(pressOuts).toBe(1);
    expect(presses).toBe(1);
  });

  it('flips the scoped-slot `pressed` state across the press-in/press-out cycle', async () => {
    const Parent = await loadMountable();
    mount(ROOT_TAG, Parent, { onPress: () => {}, onPressIn: () => {}, onPressOut: () => {} });
    await tick();
    await tick();

    expect(innerTestID()).toBe('idle');

    const handle = responderHandle();
    fabric.fireEvent(handle, 'topTouchStart');
    await tick();
    await tick();
    expect(innerTestID()).toBe('pressed');

    fabric.fireEvent(handle, 'topTouchEnd');
    await tick();
    await tick();
    expect(innerTestID()).toBe('idle');
  });
});
