// `text-input` as a TAG, through the REAL Svelte compiler. The controlled value/text fold and the
// imperative ref surface (focus/blur/clear/isFocused) live on the engine node
// (`core/components/src/behaviors/text-input.ts`) and are fully unit-tested there; this file
// proves the SVELTE WIRING: compiled markup reaches the tag, its `value` folds to the native
// `text` prop and its native `change` event reaches `onValueChange`, and a `bind:this` host
// instance drives focus/blur/clear/isFocused through `hostInstance()` + `buildTextInputHandle` —
// the same bridge-smoke shape React's and Solid's TextInput suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: nothing here throws.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { buildTextInputHandle } from '@symbiote-native/components';

// SIDE-EFFECT IMPORT: the behavior is what runs the machine. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';
import { hostInstance } from './host-instance';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();
const SINGLELINE_VIEW = 'RCTSinglelineTextInputView';

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-text-input-tag.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function inputNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SINGLELINE_VIEW);
  if (node === undefined) throw new Error(`no ${SINGLELINE_VIEW} was created`);
  return node;
}

let nextRoot = 9_960;

/** Compile a real `.svelte` source, mount it with the given props, settle. */
async function mountSource(
  source: string,
  props: Record<string, unknown> = {},
): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'TextInputTag.svelte' }).js
      .code,
  );
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string or it
  // silently re-runs the previous arm's module (svelte-adapter-dom-shim §15).
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${root}`
  )) as { default: Component };
  mount(root, Probe, props);
  await settle();
  return root;
}

beforeEach(() => fabric.reset());

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: `text-input` as a tag', () => {
  it('folds value into the native text prop and derives onValueChange', async () => {
    let changedText: string | undefined;
    const root = await mountSource(
      `<script>let { onValueChange } = $props();</script><text-input value="hi" onValueChange={onValueChange}></text-input>`,
      {
        onValueChange: (event: { text: string }) => {
          changedText = event.text;
        },
      },
    );

    expect(inputNode().props.text).toBe('hi');

    fabric.fireEvent(inputNode().instanceHandle, 'topChange', {
      text: 'hix',
      eventCount: 1,
      selection: { start: 3, end: 3 },
    });
    await settle();
    expect(changedText).toBe('hix');

    unmount(root);
    await settle();
  });

  it('drives focus/blur/clear through a bind:this host instance', async () => {
    const root = await mountSource(
      `<script>
         let el = $state();
         $effect(() => { window.__textInputRef = el; });
       </script>
       <text-input bind:this={el} value="hello"></text-input>`,
    );

    const node = hostInstance(
      (globalThis as { __textInputRef?: unknown }).__textInputRef,
    );
    if (node === undefined)
      throw new Error('bind:this never resolved to a host instance');
    const handle = buildTextInputHandle(node);

    handle.focus();
    expect(fabric.commands.some(c => c.commandName === 'focus')).toBe(true);

    fabric.commands.length = 0;
    handle.blur();
    expect(fabric.commands.some(c => c.commandName === 'blur')).toBe(true);

    fabric.commands.length = 0;
    handle.clear();
    const setText = fabric.commands.find(
      c => c.commandName === 'setTextAndSelection',
    );
    expect(
      setText,
      'a setTextAndSelection command was dispatched',
    ).toBeDefined();
    expect(setText!.args[1]).toBe('');

    unmount(root);
    await settle();
  });

  it('tracks isFocused() from real topFocus/topBlur events', async () => {
    const root = await mountSource(
      `<script>
         let el = $state();
         $effect(() => { window.__textInputRef = el; });
       </script>
       <text-input bind:this={el}></text-input>`,
    );

    const node = hostInstance(
      (globalThis as { __textInputRef?: unknown }).__textInputRef,
    );
    if (node === undefined)
      throw new Error('bind:this never resolved to a host instance');
    const handle = buildTextInputHandle(node);

    expect(handle.isFocused()).toBe(false);
    fabric.fireEvent(inputNode().instanceHandle, 'topFocus', {});
    expect(handle.isFocused()).toBe(true);
    fabric.fireEvent(inputNode().instanceHandle, 'topBlur', {});
    expect(handle.isFocused()).toBe(false);

    unmount(root);
    await settle();
  });
});
