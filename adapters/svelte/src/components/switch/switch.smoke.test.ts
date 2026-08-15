// Proves the one genuinely novel, unverified-by-typecheck assumption in index.svelte: that
// `bind:this={hostShim}` on the intrinsic host tag has a populated `.engineNode` by the time
// the snap-back $effect first runs, so `dispatchViewCommand` has a live target. Compiles the
// REAL index.svelte source (not a hand-written stand-in) through svelte/compiler, wraps it in
// a small controlling parent that never updates `value` (so every native toggle is "rejected"
// and must trigger a snap-back command), and asserts against a real fake-Fabric recorder.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_002;
// Co-located with the real source (not an isolated temp dir): the compiled Switch output's
// own `import { PLATFORM } from './switch-platform'` resolves relative to WHERE THE COMPILED
// FILE LIVES, so it must sit next to the real switch-platform.ts/.ios.ts/.android.ts rather
// than being copied into isolation. .gitignore'd (`.smoke-compiled-*.mjs`); always removed in
// afterEach as belt-and-suspenders against a crash leaving one behind.
const SWITCH_OUT = join(__dirname, '.smoke-compiled-switch.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(SWITCH_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadMountable(): Promise<Component> {
  const switchSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(switchSource, 'Switch.svelte', SWITCH_OUT);

  // A controlling parent that RENDERS the fixed prop it was given and NEVER updates it in
  // onValueChange — the "parent rejects every toggle" case shouldSnapBack exists for.
  compileToFile(
    `<script>
       import Switch from './.smoke-compiled-switch.mjs';
       let { fixedValue = false } = $props();
     </script>
     <Switch value={fixedValue} onValueChange={() => {}} />`,
    'RejectingParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('RejectingParent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('Switch (real compiled index.svelte)', () => {
  it('mounts and paints the intrinsic symbiote-switch node with the fixed value', async () => {
    const RejectingParent = await loadMountable();
    mount(ROOT_TAG, RejectingParent, { fixedValue: true });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === 'Switch');
    expect(node).toBeDefined();
    expect(node?.props.value).toBe(true);
  });

  it('dispatches the iOS snap-back command when native reports a value the parent rejects', async () => {
    const RejectingParent = await loadMountable();
    mount(ROOT_TAG, RejectingParent, { fixedValue: false });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === 'Switch');
    expect(node).toBeDefined();
    if (node === undefined) return;

    // Native flips to true; the parent's onValueChange is a no-op, so `value` stays false —
    // this is exactly the case shouldSnapBack() exists to correct.
    fabric.fireEvent(node.instanceHandle, 'topChange', { value: true, eventCount: 1 });
    await tick();
    await tick();

    expect(fabric.commands).toHaveLength(1);
    expect(fabric.commands[0]?.commandName).toBe('setValue');
    expect(fabric.commands[0]?.args).toEqual([false]);
  });
});
