// What a PUBLIC bare tag would mean on this adapter, measured 2026-09-01 for the primitives-as-tags
// work. The question was "does a bare tag commit a payload identical to the wrapper's". Here it
// does not, and the reason is the funnel: our props do not reach the engine as props. Every lowered
// element takes ONE `p={{…}}` object and the shim's `p` setter fans it out through `routeProp`; an
// app-authored `<view class="x" id="y">` has no bag, and Svelte's own codegen sends its
// attributes three different ways, none of which the shim implements.
//
// Measured, four arms, `bag` acting as the live control:
//
//   wrapper  <View id testID accessible>            { testID, accessible, nativeID:'ident' }
//   bag      <view p={{…}}>                IDENTICAL  <- the parity this file asserts
//   bare     <view id testID accessible>   NOTHING commits; the node mounts empty
//   bare + style/class                              THROWS: cannot set 'cssText' of undefined
//
// SUPERSEDED 2026-09-07 — the two bare rows above are a dated reading, kept because the CODEGEN
// half of them is still exactly right and is what the fixes had to be aimed at. The shim now
// implements all four doors (`setAttribute`, `className`, the `set_style` Symbol, and an
// `addEventListener` that normalises the event name), so a bare tag commits and does not throw;
// `bare-tag-authored.test.ts` compiles real markup with no preprocessor and pins each one. What is
// still the compiler's and not ours: a STATIC attribute name is lowercased, and a hyphenated tag
// stringifies a scalar — both properties of the tag alphabet.
//
// Only the wrapper/bag parity is asserted below. The bare-tag readings stay a dated measurement and
// NOT assertions, on purpose: pinning them would encode today's limitation as a contract, so a
// later shim that learns `className` / `style` / per-key writes would read as a regression
// (`.claude/rules/test-harness-false-greens.md` §14).
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();
// Named for this suite alone: two suites sharing a compiled artifact race
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-bare-tag-probe.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function committedProps(testID: string): Record<string, unknown> | undefined {
  const walk = (
    nodes: readonly unknown[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (!isRecord(node)) continue;
      const props = node.props;
      if (isRecord(props) && props.testID === testID) return props;
      const children = node.children;
      if (Array.isArray(children)) {
        const hit = walk(children);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

/** Mount, read, unmount — reading once several arms are live finds the wrong root. */
async function arm(
  source: string,
  rootTag: number,
  testID: string,
): Promise<Record<string, unknown> | undefined> {
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'BareTag.svelte' }).js.code,
  );
  // A fresh query string per arm: node caches a dynamic import by resolved path.
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${rootTag}`
  )) as { default: Component };
  mount(rootTag, Probe, {});
  await settle();
  const props = committedProps(testID);
  unmount(rootTag);
  await settle();
  return props;
}

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

// The wrapper-vs-bag comparison this file opened with is GONE with the wrappers. What replaced it
// is not a smaller version of it: `tag-fold-coverage.test.ts` asserts every primitive's fold
// ABSOLUTELY, against the spec, which is the half a cross-arm comparison was structurally blind to
// anyway (`test-harness-false-greens.md` §16).

describe('children under a tag', () => {
  it('mount as markup, which a `children` key in the bag never does', async () => {
    const kid = await arm(
      [
        '<view p={{ testID: "parent" }}>',
        '  <text p={{ testID: "kid" }}>hi</text>',
        '</view>',
      ].join('\n'),
      9_705,
      'kid',
    );

    // The counterpart matters more now that a bag is something an app writes by hand rather than
    // something a transform emitted: the same child handed over as a bag KEY never mounts, because
    // `routeProp` treats `children` as an ordinary prop and a Snippet is not markup there.
    expect(kid, 'a child written as markup commits').toBeDefined();
    expect(kid?.ellipsizeMode, 'and its Text defaults are folded').toBe('tail');
  });
});
