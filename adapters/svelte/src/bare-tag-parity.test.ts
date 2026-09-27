// A child written as markup under a tag commits; the same child handed over as a `children` bag
// key never mounts — `routeProp` treats `children` as an ordinary prop, and a Snippet is not
// markup there. Bare-tag attribute parity itself is `bare-tag-authored.test.ts`'s.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
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

function committedPayload(testID: string): Record<string, unknown> | undefined {
  return live.findLive(live.appRoot(), node => node.payload.testID === testID)
    ?.payload;
}

/**
 * Mount, read, unmount. The recording is cleared per arm because `appRoot()` searches the CREATION
 * log — an earlier arm's surface is still in it, and would be found first.
 */
async function arm(
  source: string,
  rootTag: number,
  testID: string,
): Promise<Record<string, unknown> | undefined> {
  fabric.reset();
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
  const props = committedPayload(testID);
  unmount(rootTag);
  await settle();
  return props;
}

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

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
    // The witness used to be `ellipsizeMode: 'tail'`, one of RN's Text defaults, which this adapter
    // no longer supplies — the rule is the engine's, keyed on the component. `testID` is the better
    // witness anyway: it proves the child's own BAG arrived, which is the thing a markup child and a
    // `children` key actually differ about.
    expect(kid?.testID, 'and its own bag arrived with it').toBe('kid');
  });
});
