// `button` as a tag, through the real Svelte compiler
// RN's Button takes no children and builds a touchable, view and text subtree itself
// So the engine behavior in `core/components/src/behaviors/button.ts` owns the composition

// The node count is the registration oracle, as an unregistered `button` commits one bare view
// `touchable-native-feedback-tag.test.ts` differs, as its tag commits nothing either way

// `button` is a real HTML element name, so svelte2tsx types it `HTMLProps<'button', ...>`
// That is why `intrinsic-elements.ts` enhances `svelteHTML.HTMLAttributes` beside `SVGAttributes`
// Nothing differs at runtime, as the renderer writes `p` the same way either way

// Labels are `id`, folded to `nativeID`, as in `touchable-native-feedback-tag.test.ts`
// The compiler lowercases a `testID` attribute on a tag, so a `testID` locator finds nothing
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// Side-effect import, as the behavior builds the subtree and runs the press machine
// An app reaches it through the package barrel, a test importing the renderer does not
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// Named for this suite alone, as two suites sharing a compiled artifact race under a full run
const PROBE_OUT = join(__dirname, '.smoke-compiled-button-tag.mjs');

// Copied from `metro-svelte-transformer.cjs`, as stock compiler options are somebody else's build
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

// The composed TouchableOpacity fade is a real `Animated.timing`
// The engine's JS driver throws without a host `requestAnimationFrame`, so a timer stands in
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

/** The committed host, found by the `nativeID` its `id` folded into. */
function hostOf(label: string): ILiveNode {
  const host = live.findLive(
    live.appRoot(),
    node => node.payload.nativeID === label,
  );
  if (host === undefined) throw new Error(`no committed host ${label}`);
  return host;
}

/** Every descendant's view name, pre-order — the shape of what the behavior built. */
function descendantNames(node: ILiveNode): string[] {
  const names: string[] = [];
  for (const child of node.children) {
    live.walkLive(child.handle, one => names.push(one.viewName));
  }
  return names;
}

let nextRoot = 9_960;
const mountedRoots: number[] = [];

/** Compile a real `.svelte` source, mount it, settle. */
async function mountSource(source: string): Promise<void> {
  nextRoot += 1;
  const root = nextRoot;
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'ButtonTag.svelte' }).js
      .code,
  );
  // Node caches a dynamic import by path, so each arm needs a fresh query string
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${root}`
  )) as { default: Component };
  mount(root, Probe, {});
  mountedRoots.push(root);
  await settle();
}

beforeEach(() => {
  fabric.reset();
  pendingFrames.clear();
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const frame = pendingFrames.get(id);
        if (frame === undefined) return;
        pendingFrames.delete(id);
        frame(id * 16);
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) unmount(root);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: `button` as a tag', () => {
  it('commits RN’s four-node iOS subtree and paints the title', async () => {
    await mountSource(`<button p={{ id: 'btn', title: 'Save' }}></button>`);

    // RN's four iOS nodes by view name: the host, the inner view, the Text and the raw text
    // Three exist only because the behavior built them, so this fails when `./register` is dropped
    // Android commits three, asserted in `core/components/src/behaviors/button-android.test.ts`
    const host = hostOf('btn');
    expect(host.viewName).toBe('RCTView');
    // The role and the label style are folded in the engine (`button-*payload.itest.ts`)
    expect(descendantNames(host)).toEqual(['RCTView', 'RCTText', 'RCTRawText']);

    const [view] = host.children;
    const [text] = view.children;
    expect(text.children[0].payload.text).toBe('Save');
  });
});
