// A whitespace-only text node must never reach Fabric as an RCTRawText when its parent cannot
// hold raw text. Svelte collapses the gap between two siblings on separate lines to a single
// ' ' and ships it; the DOM lets CSS decide whether it paints, Fabric has no such layer.
//
// Every source here is compiled with NO preprocessor on purpose. `collapse-text-whitespace.ts`
// deletes these gaps at the source level, so with it registered this test could not fail —
// and correctness would silently depend on a consuming app registering it. The shim is the
// guarantee; the preprocessor is only an optimization that avoids building the node at all.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_741;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Own filename: Vitest runs test FILES concurrently and import() caches by path
// (.claude/rules/smoke-compiled-artifact-collisions.md).
const OUT = join(__dirname, '.smoke-compiled-stray-whitespace.mjs');

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(OUT, { force: true });
});

async function load(source: string): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    fragments: 'tree',
    css: 'external',
    filename: 'Probe.svelte',
  });
  writeFileSync(OUT, result.js.code);
  const mod: unknown = await import(`file://${OUT}?v=${Date.now()}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod))
    throw new Error('probe produced no default export');
  const component = mod.default;
  if (typeof component !== 'function')
    throw new Error('probe default export is not a component');
  return component;
}

// The LIVE tree: fabric.find() reads the creation log, which never reflects a later clone
// (symbiote-engine-core §8).
function rawTexts(): string[] {
  const out: string[] = [];
  const walk = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName.includes('RawText'))
        out.push(String(node.props.text ?? ''));
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return out;
}

describe('whitespace-only text nodes (compiled without the preprocessor)', () => {
  it('drops the gap Svelte leaves between siblings of a non-text parent', async () => {
    const Probe = await load(
      '<symbiote-view>\n' +
        '  <symbiote-text>a</symbiote-text>\n' +
        '  <symbiote-text>b</symbiote-text>\n' +
        '</symbiote-view>',
    );
    mount(ROOT_TAG, Probe, {});
    await tick();

    // Broken: ['a', ' ', 'b'] — the separator committed as a real raw text under the view.
    expect(rawTexts()).toEqual(['a', 'b']);
  });

  it('keeps the separator when the parent IS a text container', async () => {
    const Probe = await load(
      '<symbiote-text><symbiote-text>a</symbiote-text> <symbiote-text>b</symbiote-text></symbiote-text>',
    );
    mount(ROOT_TAG, Probe, {});
    await tick();

    // There the space is a real word boundary, not formatting — dropping it would be the bug.
    expect(rawTexts()).toEqual(['a', ' ', 'b']);
  });

  // why: `[ \t\r\n]` missed every one of these — each arrives as its own text node in the
  // from_tree template, so before the class widened they committed as real RCTRawText under a
  // view. U+00A0 is the realistic one (Option+Space on macOS, a paste); the rest cost the same
  // single character in the class.
  it.each([
    ['&nbsp;', ' '],
    ['&emsp;', ' '],
    ['a form feed', '\f'],
    ['a zero-width space', '​'],
  ])('drops %s between siblings of a non-text parent', async (_label, gap) => {
    const Probe = await load(
      `<symbiote-view><symbiote-text>a</symbiote-text>${gap}<symbiote-text>b</symbiote-text></symbiote-view>`,
    );
    mount(ROOT_TAG, Probe, {});
    await tick();

    expect(rawTexts()).toEqual(['a', 'b']);
  });

  // The counter-case for the WIDER class: inside a <Text> an nbsp is a character the author
  // meant, and the parent check is what protects it — not the class.
  it('keeps &nbsp; when the parent IS a text container', async () => {
    const Probe = await load(
      '<symbiote-text><symbiote-text>a</symbiote-text>&nbsp;<symbiote-text>b</symbiote-text></symbiote-text>',
    );
    mount(ROOT_TAG, Probe, {});
    await tick();

    expect(rawTexts()).toEqual(['a', ' ', 'b']);
  });

  it('leaves an {#each} text placeholder alone — same string, text parent', async () => {
    const Probe = await load(
      '<symbiote-view>{#each ["x", "y"] as v}<symbiote-text>{v}</symbiote-text>{/each}</symbiote-view>',
    );
    mount(ROOT_TAG, Probe, {});
    await tick();

    // The placeholder compiles to ['symbiote-text', null, ' '] — identical to a stray gap at
    // the string level. Its parent is a <Text>, so the rule keeps it; and even if the rule did
    // drop it, promoteAnchorToRawText() would restore it when set_text arrives. Belt and
    // braces, so this asserts the OUTCOME (both rows render) rather than which route got there.
    expect(rawTexts()).toEqual(['x', 'y']);
  });
});
