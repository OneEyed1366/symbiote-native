// THE HEADLINE OF THE WRAPPER DELETION, measured through the REAL Svelte compiler: a
// `<touchable-native-feedback>` wrapping one view commits ONE node, where the wrapper it replaced
// committed THREE (a `pressable`, a feedback `view`, and the app's own child). RN's TNF renders
// nothing at all — it clones onto `React.Children.only(children)`
// (TouchableNativeFeedback.js:289,339) — so the wrapper's two extra nodes were ours.
//
// Two independent consequences of one cause, deliberately
// The count alone cannot witness the registration, as the tag commits nothing either way
// The clone proves `../register` ran, and fails without `registerTouchableNativeFeedbackBehavior()`

// Labels are `id`, folded to `nativeID`, as in `bare-tag-authored.test.ts`
// The compiler lowercases `testID` on such a tag, so a `testID` locator finds nothing
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
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string
  // or it silently re-runs the previous arm's module
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
  // The clone is `foldCloneOntoChild` in C++, which this host cannot run — its `fabricProps`
  // carries no copy of the tag rules. `onLayout` is still JS: RN clones it as a LISTENER (`:386`),
  // `FORWARDED_LISTENERS` carries it, and being Fabric BOOLEAN-GATED it shows up as `true`.
  it('forwards the owner’s listener onto that one child', async () => {
    const root = await mountSource(
      [
        '<script>const noop = () => {};</script>',
        '<view id="root">',
        '  <touchable-native-feedback id="tnf" onLayout={noop}>',
        '    <view></view>',
        '  </touchable-native-feedback>',
        '</view>',
      ].join('\n'),
    );

    const [child] = subtreeOf('root');
    expect(child.payload.onLayout).toBe(true);

    unmount(root);
    await settle();
  });
});
