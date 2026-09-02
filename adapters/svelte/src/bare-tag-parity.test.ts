// What a PUBLIC bare tag would mean on this adapter, measured 2026-09-01 for the primitives-as-tags
// work. The question was "does a bare tag commit a payload identical to the wrapper's". Here it
// does not, and the reason is the funnel: our props do not reach the engine as props. Every lowered
// element takes ONE `p={{…}}` object and the shim's `p` setter fans it out through `routeProp`; an
// app-authored `<symbiote-view class="x" id="y">` has no bag, and Svelte's own codegen sends its
// attributes three different ways, none of which the shim implements.
//
// Measured, four arms, `bag` acting as the live control:
//
//   wrapper  <View id testID accessible>            { testID, accessible, nativeID:'ident' }
//   bag      <symbiote-view p={{…}}>                IDENTICAL  <- the parity this file asserts
//   bare     <symbiote-view id testID accessible>   NOTHING commits; the node mounts empty
//   bare + style/class                              THROWS: cannot set 'cssText' of undefined
//
// The throw is `set_style` writing `dom.style.cssText` (svelte's own elements/style.js) on a
// ShimElement that has no `.style`; `class` goes to `set_class` and everything else to
// `set_custom_element_data`, which stringifies. So on Svelte "the primitive is a tag" does not
// remove the transform — it makes the transform MANDATORY, since without it props stop reaching the
// engine and a `style` attribute crashes the mount.
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
const VIEW_OUT = join(
  __dirname,
  'components',
  '.smoke-compiled-view-for-bare-tag.mjs',
);

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
  rmSync(VIEW_OUT, { force: true });
});

describe('the wrapper and the bag commit the same payload', () => {
  it('agree key for key, with both arms shown to be live', async () => {
    writeFileSync(
      VIEW_OUT,
      compile(
        readFileSync(join(__dirname, 'components', 'View.svelte'), 'utf8'),
        { ...COMPILE_OPTIONS, filename: 'View.svelte' },
      ).js.code,
    );

    // The first mount in a process builds surface chrome the later ones reuse, so one throwaway arm
    // runs before anything is compared (test-harness-false-greens.md §18).
    await arm(
      '<symbiote-view p={{ testID: "warmup" }}></symbiote-view>',
      9_700,
      'warmup',
    );

    const wrapper = await arm(
      [
        '<script>',
        `  import View from '${VIEW_OUT}';`,
        '</script>',
        '<View id="ident" testID="wrapper" accessible={true}></View>',
      ].join('\n'),
      9_701,
      'wrapper',
    );

    const bag = await arm(
      '<symbiote-view p={{ id: "ident", testID: "bag", accessible: true }}></symbiote-view>',
      9_702,
      'bag',
    );

    // Neither arm may be empty: two arms that both commit nothing agree with each other, which is a
    // tautology rather than parity (test-harness-false-greens.md §13).
    expect(wrapper, 'wrapper arm committed').toBeDefined();
    expect(bag, 'bag arm committed').toBeDefined();
    // And the fold ran on both — `id` is the wrapper's own alias and must survive the lowered path.
    expect(wrapper?.nativeID, 'wrapper folded id').toBe('ident');
    expect(bag?.nativeID, 'bag folded id').toBe('ident');

    const strip = (props: Record<string, unknown>): Record<string, unknown> => {
      const { testID: _armLabel, ...rest } = props;
      return rest;
    };
    expect(strip(bag ?? {})).toEqual(strip(wrapper ?? {}));
  });
});

describe('children under a tag', () => {
  it('mount as markup, which a `children` key in the bag never does', async () => {
    const kid = await arm(
      [
        '<symbiote-view p={{ testID: "parent" }}>',
        '  <symbiote-text p={{ testID: "kid" }}>hi</symbiote-text>',
        '</symbiote-view>',
      ].join('\n'),
      9_705,
      'kid',
    );

    // The counterpart is measured in `preprocessor/ref-refusal.test.ts`: the same child handed over
    // as a bag KEY never mounts. So that hazard belongs to the funnel, not to the primitive — the
    // distinction the universal spread refusal rests on.
    expect(kid, 'a child written as markup commits').toBeDefined();
    expect(kid?.ellipsizeMode, 'and its Text defaults are folded').toBe('tail');
  });
});
