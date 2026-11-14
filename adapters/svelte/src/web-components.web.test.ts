// @vitest-environment happy-dom
// The real components, not intrinsic elements, run on a page and hear a person's gestures
// Svelte swaps the global `document` for the life of a root, and compiled markup reads `calls`

import './register';
import { disposeCanary, mountOnWeb } from '@symbiote-native/web/canary';
import {
  clickElement,
  elementByTestId,
  scrollElementTo,
  tapElement,
  textLeaf,
  typeInto,
} from '@symbiote-native/web/interactions';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { restoreGlobals } from './dom-shim';
import { AppRegistry } from './modules/app-registry';

// Named for this suite alone, as suites sharing a compiled artifact race under a full run
const COMPILED_PREFIX = join(__dirname, '.smoke-compiled-web-components');

// The Modal source is compiled next to itself, as its own relative imports resolve from there
const MODAL_FILE = join(
  __dirname,
  'components',
  'modal',
  '.web-components-modal.mjs',
);
const MODAL_IMPORT = './components/modal/.web-components-modal.mjs';

const compiledFiles: string[] = [];
const calls: unknown[] = [];
// A module is cached by its url, so a name is never used twice
let compiledCount = 0;

async function compiled(source: string): Promise<Component> {
  const { js } = compile(source, {
    generate: 'client',
    fragments: 'tree',
    css: 'external',
    filename: 'Screen.svelte',
  });
  compiledCount += 1;
  const file = `${COMPILED_PREFIX}-${compiledCount}.mjs`;
  compiledFiles.push(file);
  writeFileSync(file, js.code);
  const mod: unknown = await import(/* @vite-ignore */ `file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('compiled Screen.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountSource(source: string): Promise<HTMLElement> {
  const Screen = await compiled(source);
  return mountOnWeb(AppRegistry, () => Screen);
}

describe('Svelte components on the web', () => {
  beforeAll(() => {
    const source = readFileSync(
      join(__dirname, 'components', 'modal', 'index.svelte'),
      'utf8',
    );
    const { js } = compile(source, {
      generate: 'client',
      fragments: 'tree',
      css: 'external',
      filename: 'index.svelte',
    });
    writeFileSync(MODAL_FILE, js.code);
  });

  afterAll(() => rmSync(MODAL_FILE, { force: true }));

  afterEach(() => {
    disposeCanary();
    restoreGlobals();
    calls.length = 0;
    for (const file of compiledFiles.splice(0)) rmSync(file, { force: true });
  });

  Object.assign(globalThis, { webTestCalls: calls });

  it('calls onPress of a Pressable that was tapped', async () => {
    const page = await mountSource(
      `<pressable testID="go" onPress={() => webTestCalls.push('press')}><text>go</text></pressable>`,
    );

    await tapElement(elementByTestId(page, 'go'));

    expect(calls).toEqual(['press']);
  });

  it('ignores a tap on a disabled Pressable', async () => {
    const page = await mountSource(
      `<pressable testID="go" disabled={true} onPress={() => webTestCalls.push('press')}><text>go</text></pressable>`,
    );

    await tapElement(elementByTestId(page, 'go'));

    expect(calls).toEqual([]);
  });

  it('hands the typed text of a TextInput to onChangeText', async () => {
    const page = await mountSource(
      `<text-input testID="field" onChangeText={event => webTestCalls.push(event.text)}></text-input>`,
    );

    await typeInto(page, 'hi');

    expect(calls).toEqual(['hi']);
  });

  it('shows a Button as its blue title and presses it', async () => {
    const page = await mountSource(
      `<button testID="save" title="Save" onPress={() => webTestCalls.push('press')}></button>`,
    );
    const button = elementByTestId(page, 'save');

    await tapElement(button);

    expect(textLeaf(button, 'Save').style.color).toBe('#007AFF');
    expect(calls).toEqual(['press']);
  });

  it('turns a Switch on when the app takes the value it reports', async () => {
    const page = await mountSource(
      `<script>let isOn = $state(false)</script>
<switch testID="sw" value={isOn} onValueChange={event => { isOn = event.value }}></switch>`,
    );
    const control = elementByTestId(page, 'sw');

    await clickElement(control);

    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('covers the page with a visible Modal and asks to close it on Escape', async () => {
    const page = await mountSource(
      `<script>import Modal from '${MODAL_IMPORT}'</script>
<view><Modal visible={true} testID="dlg" onRequestClose={() => webTestCalls.push('close')}><text>inside</text></Modal></view>`,
    );
    const dialog = elementByTestId(page, 'dlg');

    // Svelte swaps the global `document` while a root is mounted, the page's own is the real one
    page.ownerDocument.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );

    expect([
      dialog.getAttribute('role'),
      dialog.style.position,
      dialog.textContent,
      calls,
    ]).toEqual(['dialog', 'fixed', 'inside', ['close']]);
  });

  it('paints no Modal that is not visible', async () => {
    const page = await mountSource(
      `<script>import Modal from '${MODAL_IMPORT}'</script>
<Modal visible={false} testID="dlg"><text>inside</text></Modal>`,
    );

    expect(page.querySelector('[data-testid="dlg"]')).toBeNull();
  });

  it('shows an ActivityIndicator as a turning ring', async () => {
    const page = await mountSource(
      `<activity-indicator testID="spin" size="large"></activity-indicator>`,
    );

    const ring = elementByTestId(page, 'spin');

    expect([ring.getAttribute('role'), ring.style.width]).toEqual([
      'progressbar',
      '36px',
    ]);
  });

  it('reports the offset of a ScrollView that scrolled to onScroll', async () => {
    const page = await mountSource(
      `<scroll-view testID="list" onScroll={event => webTestCalls.push(event.nativeEvent.contentOffset)}><text>row</text></scroll-view>`,
    );

    await scrollElementTo(elementByTestId(page, 'list'), 30);

    expect(calls).toEqual([{ x: 0, y: 30 }]);
  });
});
