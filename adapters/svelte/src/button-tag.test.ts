// `button` as a TAG, through the REAL Svelte compiler — the suite that was
// `components/button.smoke.test.ts` while `button.svelte` existed. RN's Button takes no children
// (`title` is a string prop, Button.js:363) and builds a touchable > view > text subtree itself, so
// the wrapper's whole body was composition the engine behavior now owns
// (`core/components/src/behaviors/button.ts`).
//
// THE NODE COUNT IS THE REGISTRATION ORACLE HERE, unlike `touchable-native-feedback-tag.test.ts`'s,
// whose tag commits nothing whether or not a behavior is attached. An unregistered `button` commits
// ONE bare view with no children, so the subtree assertion fails on the registration alone.
//
// `button` is the first tag in this alphabet that is a real HTML element name rather than an SVG
// one — svelte2tsx owns it as `HTMLProps<'button', HTMLAttributes>` — which is why
// `intrinsic-elements.ts` now enhances `svelteHTML.HTMLAttributes` beside `SVGAttributes`. Nothing
// about the RUNTIME differs: the shim's `p` setter is found the same way either way.
//
// Labels are `id`, folded to `nativeID` — the same choice `touchable-native-feedback-tag.test.ts`
// makes: on a tag the compiler lowercases a `testID` attribute, so a `testID`-keyed locator finds
// nothing and a missing node reads as a broken fix.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the subtree and runs the press machine. An app
// reaches it through the package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-button-tag.mjs');

// Copied from `metro-svelte-transformer.cjs`. A measurement taken on a compiler's STOCK
// configuration is a fact about somebody else's build.
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

// RN Button.js's iOS label look, owned by `buttonTextStyle` in @symbiote-native/components. MARGIN,
// not padding (Button.js:409) — the label pushes the button's edges outward instead of insetting.
const DEFAULT_BLUE = '#007AFF';
const DISABLED_GREY = '#cdcdcd';
const LABEL_FONT_SIZE = 18;
const LABEL_MARGIN = 8;

// The composed TouchableOpacity fade is a real Animated.timing, and the engine's JS driver reads
// requestAnimationFrame off the HOST at call time, throwing when it is absent. A setTimeout-backed
// frame is enough: this suite asserts the subtree and the press, never the fade's own values.
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

interface ICommitted {
  readonly viewName: unknown;
  readonly props: Record<string, unknown>;
  readonly children: readonly ICommitted[];
}

function asCommitted(value: unknown): ICommitted | undefined {
  if (!isRecord(value) || !isRecord(value.props)) return undefined;
  const children = Array.isArray(value.children) ? value.children : [];
  return {
    viewName: value.viewName,
    props: value.props,
    children: children.flatMap(child => asCommitted(child) ?? []),
  };
}

function flatten(nodes: readonly ICommitted[]): ICommitted[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

/** The committed host, found by the `nativeID` its `id` folded into. */
function hostOf(label: string): ICommitted {
  const tree = fabric
    .appRoot()
    .children.flatMap(node => asCommitted(node) ?? []);
  const host = flatten(tree).find(node => node.props.nativeID === label);
  if (host === undefined) throw new Error(`no committed host ${label}`);
  return host;
}

let nextRoot = 9_960;

/** Compile a real `.svelte` source, mount it, settle. */
async function mountSource(source: string): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'ButtonTag.svelte' }).js
      .code,
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
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: `button` as a tag', () => {
  it('commits RN’s four-node iOS subtree and paints the title', async () => {
    const root = await mountSource(
      `<button p={{ id: 'btn', title: 'Save' }}></button>`,
    );

    // RN's FOUR nodes on iOS, in order and by view name — the host (TouchableOpacity's own
    // Animated.View, which the tag IS), the inner view carrying the Material look on Android and
    // nothing here, the Text, and the raw text. Three of them exist only because the behavior built
    // them, so this is what fails when `./register` is dropped.
    //
    // Android commits THREE — TouchableNativeFeedback renders no view of its own, so the inner view
    // IS the host (Button.js:281-284). Asserted in
    // `core/components/src/behaviors/button-android.test.ts`, the only place with a Platform mock;
    // the branch is the behavior's, not this adapter's.
    const host = hostOf('btn');
    expect(host.viewName).toBe('RCTView');
    expect(host.props.accessibilityRole).toBe('button');
    expect(flatten(host.children).map(node => node.viewName)).toEqual([
      'RCTView',
      'RCTText',
      'RCTRawText',
    ]);

    const [view] = host.children;
    const [text] = view.children;
    expect(text.props.color).toBe(DEFAULT_BLUE);
    expect(text.props.fontSize).toBe(LABEL_FONT_SIZE);
    expect(text.props.margin).toBe(LABEL_MARGIN);
    // RN's Text.js defaults, which a hand-written host tag inherits from nothing — without them a
    // long label clips mid-word instead of ellipsising, on device only.
    expect(text.props.ellipsizeMode).toBe('tail');
    expect(text.children[0].props.text).toBe('Save');

    unmount(root);
    await settle();
  });

  // why: `disabled` greys the label and wins over an explicit `color` (Button.js pushes the
  // disabled colour after the tint), and it lands on the a11y state so a screen reader announces
  // it. Both are the behavior's folds reaching Fabric through Svelte's own prop bag.
  it('greys the label over an explicit color and announces itself disabled', async () => {
    const root = await mountSource(
      `<button p={{ id: 'btn', title: 'Go', color: '#ff0000', disabled: true }}></button>`,
    );

    const host = hostOf('btn');
    const state = host.props.accessibilityState;
    expect(isRecord(state) && state.disabled).toBe(true);
    expect(host.children[0].children[0].props.color).toBe(DISABLED_GREY);

    unmount(root);
    await settle();
  });
});
