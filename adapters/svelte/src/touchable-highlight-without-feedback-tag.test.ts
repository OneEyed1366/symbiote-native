// `touchable-highlight` / `touchable-without-feedback` as TAGS, through the REAL Svelte compiler —
// the two RN-parity sweep gaps Svelte had before this file: TouchableOpacity already had deep
// coverage (`touchable-opacity/touchable-opacity.smoke.test.ts`), Highlight and WithoutFeedback had
// NONE. Both machines (underlay show/hide, the clone-onto-child fold) live on the engine node
// (`core/components/src/behaviors/touchable-{highlight,without-feedback}.ts`) and are fully
// unit-tested there; this file proves the SVELTE WIRING.
//
// Neither needs the opacity file's RAF/frame-tracking machinery: TouchableHighlight paints its
// underlay with a synchronous style swap, not Animated (RN's TouchableHighlight.js), and
// TouchableWithoutFeedback drives no visual mechanism at all.
//
// No Negative group: neither component has a throwing path.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what runs the machine. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();
const TARGET = 'touchable-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(
  __dirname,
  '.smoke-compiled-touchable-highlight-twf-tag.mjs',
);

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

// The LIVE tree, by testID — never `fabric.find()`, which reads the pre-clone `created` set and
// can hand back a node's mount-time props after a later update (`test-harness-false-greens.md`).
function committedNode(testID: string): IFakeNode {
  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const found = walk(fabric.appRoot().children);
  if (found === undefined)
    throw new Error(`no committed node testID=${testID}`);
  return found;
}

function press(node: IFakeNode): void {
  fabric.fireEvent(node.instanceHandle, TOUCH_START, {});
  fabric.fireEvent(node.instanceHandle, TOUCH_END, {});
}

let nextRoot = 9_980;

/** Compile a real `.svelte` source, mount it with the given props, settle. */
async function mountSource(
  source: string,
  props: Record<string, unknown> = {},
): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'TouchableTag.svelte' }).js
      .code,
  );
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string or it
  // silently re-runs the previous arm's module (svelte-adapter-dom-shim §15).
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${root}`
  )) as { default: Component };
  mount(root, Probe, props);
  await settle();
  return root;
}

beforeEach(() => fabric.reset());

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: `touchable-highlight` as a tag', () => {
  // why: RN splits the underlay color and the lowered opacity across the container and its child
  // (TouchableHighlight.js, confirmed against `TouchableHighlight-itest.js`'s own two-node shape)
  // — fixed at the engine level via `onChildInserted`
  // (core/components/src/behaviors/touchable-highlight.ts) 2026-09-15.
  it('paints the underlay on the container and the child opacity on the child, clears both on release', async () => {
    const CHILD = `${TARGET}-child`;
    const root = await mountSource(
      `<script>let { onPress } = $props();</script><touchable-highlight testID="${TARGET}" onPress={onPress}><view testID="${CHILD}"></view></touchable-highlight>`,
      { onPress: () => {} },
    );

    fabric.fireEvent(committedNode(TARGET).instanceHandle, TOUCH_START, {});
    await settle();
    expect(committedNode(TARGET).props.backgroundColor).toBe('black');
    expect(committedNode(TARGET).props.opacity).toBeUndefined();
    expect(committedNode(CHILD).props.opacity).toBe(0.85);

    fabric.fireEvent(committedNode(TARGET).instanceHandle, TOUCH_END, {});
    await settle();
    expect(committedNode(TARGET).props.backgroundColor).not.toBe('black');
    expect(committedNode(CHILD).props.opacity).not.toBe(0.85);

    unmount(root);
    await settle();
  });

  it('paints no underlay when no press handler is supplied', async () => {
    const root = await mountSource(
      `<touchable-highlight testID="${TARGET}"></touchable-highlight>`,
    );

    fabric.fireEvent(committedNode(TARGET).instanceHandle, TOUCH_START, {});
    await settle();
    expect(committedNode(TARGET).props.backgroundColor).toBeUndefined();

    unmount(root);
    await settle();
  });

  // why: RN-parity sweep lesson — style/underlay coverage doesn't prove `onPress` is actually
  // gated; RN's own itest fires a real touch for exactly this reason.
  it('suppresses onPress from a real touch while disabled', async () => {
    let presses = 0;
    const root = await mountSource(
      `<script>let { onPress } = $props();</script><touchable-highlight testID="${TARGET}" disabled={true} onPress={onPress}></touchable-highlight>`,
      { onPress: () => (presses += 1) },
    );

    press(committedNode(TARGET));
    await settle();
    expect(presses).toBe(0);

    unmount(root);
    await settle();
  });

  // why: RN gives Pressable a ONE-leg focusable default (Pressable.js:258) and the Touchables a
  // THREE-leg one (TouchableHighlight.js:370-374) — no adapter had this checked for Svelte before
  // this sweep, on any of the three Touchable variants.
  it('focuses only while it has an onPress and is enabled', async () => {
    const root = await mountSource(
      `<touchable-highlight testID="${TARGET}"></touchable-highlight>`,
    );
    expect(committedNode(TARGET).props.focusable).toBe(false);
    unmount(root);
    await settle();
  });

  it('refuses focus while disabled, opt-in notwithstanding', async () => {
    const root = await mountSource(
      `<script>let { onPress } = $props();</script><touchable-highlight testID="${TARGET}" onPress={onPress} disabled={true} focusable={true}></touchable-highlight>`,
      { onPress: () => {} },
    );
    expect(committedNode(TARGET).props.focusable).toBe(false);
    unmount(root);
    await settle();
  });
});

// The universal gap: React/Vue/Solid/Angular and Svelte all had ZERO bridge tests for this
// component before this sweep, despite core (`behaviors/touchable-without-feedback.ts`+test) fully
// implementing the same accessible/focusable/accessibilityState fold as TouchableHighlight.
//
// TWF renders NO view of its own (TouchableWithoutFeedback.js:229,286) — it clones its props onto
// its single child, and `testID` is only cloned WHEN SET on the owner
// (touchable-without-feedback.ts's CLONED_WHEN_SET), so `testID` goes on the OWNER tag here.
describe('Svelte: `touchable-without-feedback` as a tag', () => {
  it('fires onPress from a real touch', async () => {
    let presses = 0;
    const root = await mountSource(
      `<script>let { onPress } = $props();</script><touchable-without-feedback testID="${TARGET}" onPress={onPress}><view></view></touchable-without-feedback>`,
      { onPress: () => (presses += 1) },
    );

    press(committedNode(TARGET));
    await settle();
    expect(presses).toBe(1);

    unmount(root);
    await settle();
  });

  it('suppresses onPress from a real touch while disabled', async () => {
    let presses = 0;
    const root = await mountSource(
      `<script>let { onPress } = $props();</script><touchable-without-feedback testID="${TARGET}" disabled={true} onPress={onPress}><view></view></touchable-without-feedback>`,
      { onPress: () => (presses += 1) },
    );

    press(committedNode(TARGET));
    await settle();
    expect(presses).toBe(0);

    unmount(root);
    await settle();
  });

  it('computes focusable and accessibilityState from disabled', async () => {
    const root = await mountSource(
      `<script>let { onPress } = $props();</script><touchable-without-feedback testID="${TARGET}" disabled={true} onPress={onPress}><view></view></touchable-without-feedback>`,
      { onPress: () => {} },
    );

    expect(committedNode(TARGET).props.focusable).toBe(false);
    expect(committedNode(TARGET).props.accessibilityState).toMatchObject({
      disabled: true,
    });

    unmount(root);
    await settle();
  });
});
