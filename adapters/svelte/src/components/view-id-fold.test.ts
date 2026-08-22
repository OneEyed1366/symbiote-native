// Proves the id->nativeID fold added to View.svelte (mirroring React's `resolveId` in
// adapters/react/src/components.ts): a raw `id` must never reach the committed Fabric tree
// (only `nativeID` is a real Fabric prop), and `id` must win when both `id` and `nativeID`
// are passed together — same precedence React's View.js-derived fold implements. Compiles the
// REAL View.svelte source through svelte/compiler (co-located, per the switch/activity-indicator
// smoke-test pattern), mounts it through the real render pipeline, and asserts against a real
// fake-Fabric recorder — fabric.find() (creation log) is fine here since this is a one-shot
// initial-commit assertion, not a post-update live-value read.
//
// No Negative group: the `bag` fold is a pure two-branch ternary (`id === undefined ? … : …`)
// over plain string props — there is no invalid input a caller can construct without violating
// `IViewProps`'s type (banned per the no-`as`-cast rule), so every scenario below is a Positive
// completion of the fold, split by which branch it exercises.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_601;
// Node's `import()` caches by file path, so each variant this file compiles needs its OWN
// output filename — reusing one path across `it()` blocks would silently re-import the FIRST
// test's stale compiled module (svelte-adapter-dom-shim skill §15's documented gotcha).
const compiledFiles: string[] = [];

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  for (const file of compiledFiles) rmSync(file, { force: true });
  compiledFiles.length = 0;
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
  compiledFiles.push(outPath);
}

async function loadParent(
  propsSource: string,
  variant: string,
): Promise<Component> {
  const viewSource = readFileSync(join(__dirname, 'View.svelte'), 'utf8');
  const viewOut = join(
    __dirname,
    `.smoke-compiled-view-id-fold-view-${variant}.mjs`,
  );
  const parentOut = join(
    __dirname,
    `.smoke-compiled-view-id-fold-parent-${variant}.mjs`,
  );
  compileToFile(viewSource, 'View.svelte', viewOut);

  compileToFile(
    `<script>
       import View from './.smoke-compiled-view-id-fold-view-${variant}.mjs';
     </script>
     ${propsSource}`,
    'Parent.svelte',
    parentOut,
  );

  const mod: unknown = await import(`file://${parentOut}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('Parent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('View.svelte id -> nativeID fold (real compiled source)', () => {
  // why: RN's modern `id` is a W3C-named alias for `nativeID` (View.js copies it verbatim) —
  // Fabric has no `id` prop at all, so a raw `id` reaching the committed tree would be dead
  // weight at best and a foreign-prop warning at worst; only `nativeID` may ever land.
  it('folds a raw id into nativeID, dropping the raw id key', async () => {
    const Parent = await loadParent(
      `<View id="foo" testID="probe" />`,
      'plain-id',
    );
    mount(ROOT_TAG, Parent);
    await tick();
    await tick();

    const node = fabric.find(n => n.props.testID === 'probe');
    expect(node).toBeDefined();
    expect(node?.props.nativeID).toBe('foo');
    expect(node?.props.id).toBeUndefined();
  });

  // why: when an app supplies both the modern alias and the legacy prop, `id` must win — the
  // same precedence RN's own View.js-derived fold implements, so a component migrating from
  // `nativeID` to `id` doesn't silently keep the stale legacy value during the transition.
  it('lets id win over nativeID when both are passed', async () => {
    const Parent = await loadParent(
      `<View id="from-id" nativeID="from-nativeID" testID="probe" />`,
      'both',
    );
    mount(ROOT_TAG, Parent);
    await tick();
    await tick();

    const node = fabric.find(n => n.props.testID === 'probe');
    expect(node).toBeDefined();
    expect(node?.props.nativeID).toBe('from-id');
    expect(node?.props.id).toBeUndefined();
  });

  // why: the fold must be a no-op for the plain legacy caller — a View that only ever used
  // `nativeID` (the pre-existing, pre-fold contract) must keep working byte-for-byte once `id`
  // support is added.
  it('keeps an explicit nativeID when no id is passed', async () => {
    const Parent = await loadParent(
      `<View nativeID="plain" testID="probe" />`,
      'nativeid-only',
    );
    mount(ROOT_TAG, Parent);
    await tick();
    await tick();

    const node = fabric.find(n => n.props.testID === 'probe');
    expect(node).toBeDefined();
    expect(node?.props.nativeID).toBe('plain');
  });
});
