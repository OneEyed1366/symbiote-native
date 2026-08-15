// Runtime proof for the deepest composition chain in this family — Button -> TouchableOpacity ->
// Pressable, three real compiled `.svelte` files nested through spread props and snippet-as-prop
// wiring (`{...accessibilityRest} {...nativeForward}` onto TouchableOpacity, `{#snippet
// children()}` passed through two more layers to Pressable) — a shape pure `svelte/compiler`
// syntax-checking cannot catch (it does not execute the compiled output). Compiles all three real
// sources, mounts them nested, and drives a press through the whole chain against a real
// fake-Fabric recorder.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_004;
const PRESSABLE_OUT = join(__dirname, 'pressable', '.smoke-compiled-pressable.mjs');
const TOUCHABLE_OPACITY_OUT = join(
  __dirname,
  'touchable-opacity',
  '.smoke-compiled-touchable-opacity.mjs',
);
const BUTTON_OUT = join(__dirname, '.smoke-compiled-button.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PRESSABLE_OUT, { force: true });
  rmSync(TOUCHABLE_OPACITY_OUT, { force: true });
  rmSync(BUTTON_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadButton(): Promise<Component> {
  // Compile Pressable and TouchableOpacity co-located with their own real siblings first (each
  // has its own relative imports — switch-platform-style resolution — that must resolve next to
  // the compiled file, not in an isolated temp dir), THEN Button, whose own `./touchable-opacity/
  // index.svelte` import is rewritten to point at the compiled TouchableOpacity output.
  compileToFile(
    readFileSync(join(__dirname, 'pressable', 'index.svelte'), 'utf8'),
    'Pressable.svelte',
    PRESSABLE_OUT,
  );
  const touchableOpacitySource = readFileSync(
    join(__dirname, 'touchable-opacity', 'index.svelte'),
    'utf8',
  ).replace("'../pressable/index.svelte'", "'../pressable/.smoke-compiled-pressable.mjs'");
  compileToFile(touchableOpacitySource, 'TouchableOpacity.svelte', TOUCHABLE_OPACITY_OUT);

  const buttonSource = readFileSync(join(__dirname, 'button.svelte'), 'utf8').replace(
    "'./touchable-opacity/index.svelte'",
    "'./touchable-opacity/.smoke-compiled-touchable-opacity.mjs'",
  );
  compileToFile(buttonSource, 'Button.svelte', BUTTON_OUT);

  const mod: unknown = await import(`file://${BUTTON_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('button.svelte produced no default export');
  }
  return mod.default as Component;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function responderHandle(): unknown {
  const view = fabric.find(n => {
    if (n.viewName !== 'RCTView') return false;
    const handle = n.instanceHandle;
    return isRecord(handle) && handle.listeners instanceof Map && handle.listeners.has('press');
  });
  if (view === undefined) throw new Error('no Button responder RCTView found');
  return view.instanceHandle;
}

describe('Button (real compiled button.svelte -> TouchableOpacity -> Pressable)', () => {
  it('mounts the full chain, paints the title, and fires onPress through it', async () => {
    let presses = 0;
    const Button = await loadButton();
    mount(ROOT_TAG, Button, {
      title: 'OK',
      onPress: () => {
        presses++;
      },
    });
    await tick();
    await tick();

    const tree = fabric.serialize([fabric.appRoot()]);
    expect(tree).toContain('RCTText');
    expect(tree).toContain('RCTRawText "OK"');

    const handle = responderHandle();
    fabric.fireEvent(handle, 'topTouchStart');
    fabric.fireEvent(handle, 'topTouchEnd');
    await tick();
    await tick();

    expect(presses).toBe(1);
  });

  it('gives the responder role=button, accessible, and a disabled a11y state', async () => {
    const Button = await loadButton();
    mount(ROOT_TAG, Button, { title: 'Go', disabled: true, onPress: () => {} });
    await tick();
    await tick();

    // A disabled Pressable suppresses its listeners entirely (shouldSuppressPress), so this
    // reads the role/accessible/accessibilityState fold straight off the committed view by its
    // fixed accessibilityRole instead of the 'press'-listener lookup responderHandle() uses.
    const view = fabric.find(
      n => n.viewName === 'RCTView' && n.props.accessibilityRole === 'button',
    );
    expect(view).toBeDefined();
    expect(view?.props.accessible).toBe(true);
    const state = view?.props.accessibilityState;
    expect(isRecord(state) && state.disabled).toBe(true);
  });
});
