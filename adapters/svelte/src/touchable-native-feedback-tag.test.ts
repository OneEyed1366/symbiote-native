// THE HEADLINE OF THE WRAPPER DELETION, measured through the REAL Svelte compiler: a
// `<touchable-native-feedback>` wrapping one view commits ONE node, where the wrapper it replaced
// committed THREE (a `pressable`, a feedback `view`, and the app's own child). RN's TNF renders
// nothing at all — it clones onto `React.Children.only(children)`
// (TouchableNativeFeedback.js:289,339) — so the wrapper's two extra nodes were ours.
//
// TWO INDEPENDENT CONSEQUENCES OF ONE CAUSE, and that is deliberate
// (`.claude/rules/test-harness-false-greens.md` §14): the COUNT alone cannot witness the
// registration, because the tag resolves to the engine's anchor and commits nothing whether or not
// a behavior is attached. The CLONE is what proves `../register` ran. Break-tested by dropping
// `registerTouchableNativeFeedbackBehavior()` from `./register`: the count stays 1 and the clone
// case fails on `nativeID`/`accessibilityLabel`.
//
// Labels are `id`, folded to `nativeID` — the same choice `bare-tag-authored.test.ts` makes and for
// the same reason: on a tag that is not also an SVG element name the compiler lowercases the
// attribute, so a `testID`-keyed locator silently finds nothing and a missing node reads as a
// broken fix.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what clones the owner's props onto the child. An app reaches
// it through the package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-tnf-tag.mjs');

// Copied from `metro-svelte-transformer.cjs`. A measurement taken on a compiler's STOCK
// configuration is a fact about somebody else's build.
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

/** Everything committed under the labelled root, the root itself excluded. */
function subtreeOf(label: string): ILiveNode[] {
  const root = live.findLive(
    live.appRoot(),
    node => node.payload.nativeID === label,
  );
  if (root === undefined) throw new Error(`no committed root ${label}`);
  const nodes: ILiveNode[] = [];
  for (const child of root.children) {
    live.walkLive(child.handle, one => nodes.push(one));
  }
  return nodes;
}

let nextRoot = 9_934;

/** Compile a real `.svelte` source, mount it, settle. */
async function mountSource(source: string): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'TnfTag.svelte' }).js.code,
  );
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string or it
  // silently re-runs the previous arm's module (svelte-adapter-dom-shim §15).
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${root}`
  )) as { default: Component };
  mount(root, Probe, {});
  await settle();
  return root;
}

beforeEach(() => fabric.reset());

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('touchable-native-feedback as a tag', () => {
  it('commits NO node of its own: one child in, one node out', async () => {
    const root = await mountSource(
      [
        '<view id="root">',
        '  <touchable-native-feedback id="tnf" accessibilityLabel="Save">',
        '    <view></view>',
        '  </touchable-native-feedback>',
        '</view>',
      ].join('\n'),
    );

    expect(subtreeOf('root').map(node => node.viewName)).toEqual(['RCTView']);
    unmount(root);
    await settle();
  });

  // why: the count above is satisfied by an unregistered tag too — an anchor commits nothing on its
  // own. This is the arm that fails when the registration is missing.
  it('clones the owner’s props onto that one child', async () => {
    const root = await mountSource(
      [
        '<view id="root">',
        '  <touchable-native-feedback id="tnf" accessibilityLabel="Save">',
        '    <view id="kid"></view>',
        '  </touchable-native-feedback>',
        '</view>',
      ].join('\n'),
    );

    const [child] = subtreeOf('root');
    expect(child.payload.accessibilityLabel).toBe('Save');
    // :373 — the owner's `id` wins, overwriting the child's own.
    expect(child.payload.nativeID).toBe('tnf');

    unmount(root);
    await settle();
  });
});
