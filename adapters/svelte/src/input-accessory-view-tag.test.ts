// `input-accessory-view` as a TAG, through the REAL Svelte compiler. The fold itself
// (nativeID/backgroundColor/style forwarding, passthrough merge, no structural children of its
// own) is framework-agnostic and unit-tested in core
// (`core/components/src/behaviors/input-accessory-view.test.ts`); this file proves the SVELTE
// WIRING: compiled markup reaches a real Fabric node, Svelte nests its own children under it, and
// the nativeID <-> inputAccessoryViewID docking pair (a shared-string-id RN convention, no
// runtime linking code) survives Svelte's own prop routing — the same bridge-smoke shape
// React's and Solid's InputAccessoryView suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: every prop is optional and every path resolves to some descriptor —
// nothing here rejects an input (React's and Solid's twins reach the same conclusion).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what runs the fold. An app reaches it through the package
// barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();
const ACCESSORY_VIEW = 'RCTInputAccessoryView';
const NATIVE_ID = 'accessory-1';
const BACKGROUND_COLOR = '#eeeeee';

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(
  __dirname,
  '.smoke-compiled-input-accessory-view-tag.mjs',
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

function accessoryNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === ACCESSORY_VIEW);
  if (node === undefined) throw new Error(`no ${ACCESSORY_VIEW} was created`);
  return node;
}

let nextRoot = 9_970;

/** Compile a real `.svelte` source, mount it, settle. */
async function mountSource(
  source: string,
  props: Record<string, unknown> = {},
): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, {
      ...COMPILE_OPTIONS,
      filename: 'InputAccessoryViewTag.svelte',
    }).js.code,
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

describe('Svelte: `input-accessory-view` as a tag', () => {
  it('mounts a real RCTInputAccessoryView carrying nativeID, backgroundColor, and flattened style', async () => {
    const root = await mountSource(
      `<input-accessory-view nativeID="${NATIVE_ID}" backgroundColor="${BACKGROUND_COLOR}" style={{ flex: 1 }}></input-accessory-view>`,
    );

    const props = accessoryNode().props;
    expect(props.nativeID).toBe(NATIVE_ID);
    expect(props.backgroundColor).toBe(BACKGROUND_COLOR);
    expect(props.flex).toBe(1);

    unmount(root);
    await settle();
  });

  it('nests Svelte-rendered children directly under the host', async () => {
    const root = await mountSource(
      `<input-accessory-view nativeID="${NATIVE_ID}"><text>Done</text></input-accessory-view>`,
    );

    const children = accessoryNode().children;
    expect(children).toHaveLength(1);
    expect(children[0].viewName).toBe('RCTText');

    unmount(root);
    await settle();
  });

  it('keeps the nativeID <-> inputAccessoryViewID docking pair intact across both', async () => {
    const root = await mountSource(
      `<view><text-input inputAccessoryViewID="${NATIVE_ID}"></text-input><input-accessory-view nativeID="${NATIVE_ID}"></input-accessory-view></view>`,
    );

    const input = fabric.find(n => n.viewName === 'RCTSinglelineTextInputView');
    expect(input, 'a TextInput was created').toBeDefined();
    expect(input!.props.inputAccessoryViewID).toBe(
      accessoryNode().props.nativeID,
    );

    unmount(root);
    await settle();
  });
});
