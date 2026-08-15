// Proves the two genuinely novel, unverified-by-typecheck assumptions in index.svelte, the
// TextInput twin of switch.smoke.test.ts: (1) the controlled-value snap-back — a parent that
// rejects every native change (never updates `value`) must see a real `setTextAndSelection`
// command echoing the acknowledged event count and the parent's own (unchanged) value; (2) the
// imperative handle exported as plain instance-script functions is genuinely callable off a
// parent's `bind:this` target and drives real view commands through the `$state.raw`-held shim
// element. Compiles the REAL index.svelte source (not a hand-written stand-in) through
// svelte/compiler and asserts against a real fake-Fabric recorder.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import type { ITextInputHandle } from '@symbiote-native/components';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_003;
const SINGLELINE = 'RCTSinglelineTextInputView';
const MULTILINE = 'RCTMultilineTextInputView';
const ACK_COUNT = 7;
// Co-located with the real source (not an isolated temp dir): the compiled TextInput output's
// own relative imports (e.g. into shared engine/components packages) resolve relative to WHERE
// THE COMPILED FILE LIVES, matching switch.smoke.test.ts's rationale. .gitignore'd
// (`.smoke-compiled-*.mjs`); always removed in afterEach as belt-and-suspenders against a crash
// leaving one behind.
const TEXT_INPUT_OUT = join(__dirname, '.smoke-compiled-text-input.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TEXT_INPUT_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

// A capturing parent: renders TextInput with a FIXED value and an onValueChange that never
// updates it (so every native change is "rejected", exactly the case shouldCommandText exists to
// correct), and hands the imperative handle out through a plain callback prop once bind:this
// resolves — no shared-module trick needed, since the callback closes over whatever the TEST
// passed in as a `mount()` prop (proven safe by the same pattern switch.smoke.test.ts uses for
// onValueChange).
async function loadMountable(): Promise<Component> {
  const textInputSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(textInputSource, 'TextInput.svelte', TEXT_INPUT_OUT);

  compileToFile(
    `<script>
       import TextInput from './.smoke-compiled-text-input.mjs';
       let { fixedValue = '', multiline = false, onCapture } = $props();
       let handle = $state.raw(null);
       $effect(() => {
         if (handle !== null) onCapture?.(handle);
       });
     </script>
     <TextInput
       value={fixedValue}
       multiline={multiline}
       onValueChange={() => {}}
       bind:this={handle}
     />`,
    'CapturingParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('CapturingParent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('TextInput (real compiled index.svelte)', () => {
  it('mounts and paints the singleline intrinsic with the seeded controlled value', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: 'hi' });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    expect(node?.props.text).toBe('hi');
    expect(typeof node?.props.mostRecentEventCount).toBe('number');
  });

  it('selects the multiline intrinsic when multiline is set', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: 'x', multiline: true });
    await tick();
    await tick();

    expect(fabric.find(n => n.viewName === MULTILINE)).toBeDefined();
    expect(fabric.find(n => n.viewName === SINGLELINE)).toBeUndefined();
  });

  it('commands setTextAndSelection with the acked count when the parent rejects a native change', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: '' });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    if (node === undefined) return;

    // Native reports "ab" at ACK_COUNT; the parent's onValueChange is a no-op, so `value` stays
    // "" — this is exactly the divergence shouldCommandText() exists to correct.
    fabric.fireEvent(node.instanceHandle, 'topChange', {
      text: 'ab',
      eventCount: ACK_COUNT,
      selection: { start: 2, end: 2 },
    });
    await tick();
    await tick();

    const setText = fabric.commands.find(c => c.commandName === 'setTextAndSelection');
    expect(setText, 'a setTextAndSelection command was dispatched').toBeDefined();
    expect(setText?.args).toEqual([ACK_COUNT, '', -1, -1]);
  });

  it('issues no controlled-write command on mount (value equals the seed)', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: 'seed' });
    await tick();
    await tick();

    expect(fabric.commands.some(c => c.commandName === 'setTextAndSelection')).toBe(false);
  });

  it('lands focus/blur/clear as view commands through the exported imperative handle', async () => {
    let captured: ITextInputHandle | null = null;
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, {
      fixedValue: 'hi',
      onCapture: (handle: ITextInputHandle) => {
        captured = handle;
      },
    });
    await tick();
    await tick();

    expect(captured, 'imperative handle captured after mount').not.toBeNull();
    // The engine node is held by IDENTITY ($state.raw), so the engine mirror resolves it and the
    // commands land; $state() would deep-proxy the shim element and every command would silently
    // no-op instead.
    captured?.focus();
    captured?.blur();
    await tick();

    expect(fabric.commands.some(c => c.commandName === 'focus')).toBe(true);
    expect(fabric.commands.some(c => c.commandName === 'blur')).toBe(true);

    captured?.clear();
    await tick();

    const clearCommand = fabric.commands.find(
      c => c.commandName === 'setTextAndSelection' && c.args[1] === '' && c.args[2] === 0,
    );
    expect(clearCommand, 'clear() dispatched setTextAndSelection([count, "", 0, 0])').toBeDefined();
  });

  it('reflects focus/blur events through isFocused', async () => {
    let captured: ITextInputHandle | null = null;
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, {
      fixedValue: 'hi',
      onCapture: (handle: ITextInputHandle) => {
        captured = handle;
      },
    });
    await tick();
    await tick();

    expect(captured).not.toBeNull();
    if (captured === null) return;
    expect(captured.isFocused()).toBe(false);

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    if (node === undefined) return;

    fabric.fireEvent(node.instanceHandle, 'topFocus', {});
    await tick();
    expect(captured.isFocused()).toBe(true);

    fabric.fireEvent(node.instanceHandle, 'topBlur', {});
    await tick();
    expect(captured.isFocused()).toBe(false);
  });
});
