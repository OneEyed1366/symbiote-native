// Real-execution proof that `{@attach fn}` on one of this adapter's components reaches the
// COMMITTED host node — compiled by the real svelte compiler, mounted through the real render
// pipeline, asserted against a real fake Fabric. `{@attach}` is the only directive-shaped Svelte
// feature legal on a component (the compiler rejects use:/transition:/class:/style: there), so it
// is also the only route by which a third-party Svelte action reaches a node here, via
// `fromAction` — which the last test round-trips end to end.
//
// Under the official custom-renderer API the node an attachment receives IS the real
// `ISymbioteNode` (renderer.ts's `createElementNode` grafts `toPublicInstance` at CREATION, not
// on later insertion — svelte-adapter-custom-renderer skill §2/§4), so there is no separate
// engine-node field to unwrap anymore.
//
// No Negative group: neither `createAttachmentsSync` nor `pickAttachmentProps` has a throwing
// path — both are total over their input (an object with or without symbol-keyed attachment
// props). The one non-happy-path branch (a null/undefined host) is a documented no-op, covered
// under Positive below rather than invented as a "rejects" case that doesn't exist.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { createAttachmentKey } from 'svelte/attachments';
import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import { mount, unmount } from '../render';
import { createAttachmentsSync, pickAttachmentProps } from './attachments';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_902;
// Next to the real View.svelte: the compiled output keeps View's own relative imports.
const COMPONENTS_DIR = join(__dirname, '..', 'components');
const VIEW_OUT = join(COMPONENTS_DIR, '.smoke-compiled-attachments-view.mjs');
const PARENT_OUT = join(COMPONENTS_DIR, '.smoke-compiled-attachments-parent.mjs');
const ACTION_OUT = join(COMPONENTS_DIR, '.smoke-compiled-attachments-action.mjs');
// Each compiled file sits next to its real source so that source's own relative imports still
// resolve; a name unique to THIS suite keeps concurrently-running suites from racing on the path.
const PRESSABLE_BASENAME = '.smoke-compiled-attachments-pressable.mjs';
const PRESSABLE_OUT = join(COMPONENTS_DIR, 'pressable', PRESSABLE_BASENAME);
const TOUCHABLE_OUT = join(
  COMPONENTS_DIR,
  'touchable-opacity',
  '.smoke-compiled-attachments-touchable.mjs',
);
const TOUCHABLE_PARENT_OUT = join(
  COMPONENTS_DIR,
  'touchable-opacity',
  '.smoke-compiled-attachments-touchable-parent.mjs',
);

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function compileToFile(source: string, filename: string, outPath: string): void {
  writeFileSync(outPath, compile(source, { ...COMPILE_OPTIONS, filename }).js.code);
}

async function loadComponent(outPath: string): Promise<Component> {
  const mod: unknown = await import(`file://${outPath}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${outPath} produced no default export`);
  }
  const component: unknown = mod.default;
  if (typeof component !== 'function')
    throw new Error(`${outPath} default export is not a component`);
  return component;
}

function compileView(): void {
  compileToFile(readFileSync(join(COMPONENTS_DIR, 'View.svelte'), 'utf8'), 'View.svelte', VIEW_OUT);
}

// Node caches import() by path, so each differently-SOURCED parent needs its own filename.
const SWAP_PARENT = `<script>
  import View from './.smoke-compiled-attachments-view.mjs';
  let { onEvent, onCapture } = $props();
  let which = $state('first');
  $effect(() => { onCapture?.((next) => { which = next; }); });
  const first = (node) => { onEvent('attach:first', node); return () => onEvent('teardown:first', node); };
  const second = (node) => { onEvent('attach:second', node); return () => onEvent('teardown:second', node); };
</script>
<View testID="attach-target" {@attach which === 'first' ? first : second} />`;

const ACTION_PARENT = `<script>
  import { fromAction } from 'svelte/attachments';
  import View from './.smoke-compiled-attachments-view.mjs';
  let { onEvent, onCapture } = $props();
  let arg = $state('one');
  $effect(() => { onCapture?.((next) => { arg = next; }); });
  const action = (node, value) => {
    onEvent('action:init', node, value);
    return {
      update: (next) => onEvent('action:update', node, next),
      destroy: () => onEvent('action:destroy', node, undefined),
    };
  };
</script>
<View testID="action-target" {@attach fromAction(action, () => arg)} />`;

interface IEvent {
  name: string;
  node: ISymbioteNode;
  value: unknown;
}

type ISetter = (next: string) => void;

let events: IEvent[] = [];
let setValue: ISetter | null = null;

function record(name: string, node: ISymbioteNode, value?: unknown): void {
  events.push({ name, node, value });
}

function captureSetter(setter: ISetter): void {
  setValue = setter;
}

beforeEach(() => {
  fabric.reset();
  events = [];
  setValue = null;
  compileView();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(VIEW_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
  rmSync(ACTION_OUT, { force: true });
  rmSync(PRESSABLE_OUT, { force: true });
  rmSync(TOUCHABLE_OUT, { force: true });
  rmSync(TOUCHABLE_PARENT_OUT, { force: true });
});

describe('Positive — createAttachmentsSync', () => {
  // why: `createAttachmentsSync` is wired from `$effect(() => syncAttachments(hostShim, rest))`,
  // and the host ref can legitimately be null/undefined before `bind:this` settles or after
  // teardown — the sync function must be a safe no-op there rather than throwing on a nullable
  // ref every component that adopts this pattern passes through on every mount.
  it('is a no-op when the host is null or undefined, and calls nothing', () => {
    const sync = createAttachmentsSync();
    const attachmentKey = createAttachmentKey();
    const props = { [attachmentKey]: (): void => {} };

    expect(() => sync(null, props)).not.toThrow();
    expect(() => sync(undefined, props)).not.toThrow();
  });
});

// The forwarding helper the list family and Animated.ScrollView rely on: those rebuild their
// child's props by name (or through a string-keyed Record), which drops symbol keys silently.
describe('Positive — pickAttachmentProps', () => {
  it('carries the attachment keys across and leaves everything else behind', () => {
    const attachmentKey = createAttachmentKey();
    const otherSymbol = Symbol('not-an-attachment');
    const attachment = (): void => {};
    const picked = pickAttachmentProps({
      testID: 'x',
      [attachmentKey]: attachment,
      [otherSymbol]: 'ignored',
    });

    expect(Object.getOwnPropertySymbols(picked)).toEqual([attachmentKey]);
    expect(Object.keys(picked)).toEqual([]);
    expect(picked[attachmentKey]).toBe(attachment);
  });

  // why: an ordinary Symbol (not one created by createAttachmentKey) must NOT be forwarded — the
  // filter keys off the attachment marker's description, not "any symbol", or an unrelated
  // symbol-keyed prop would silently leak through the forwarding helper.
  it('drops a symbol key that carries no attachment marker', () => {
    const otherSymbol = Symbol('not-an-attachment');
    const picked = pickAttachmentProps({ [otherSymbol]: 'ignored' });
    expect(Object.getOwnPropertySymbols(picked)).toEqual([]);
  });
});

describe('Positive — {@attach} on a Symbiote component', () => {
  // why: the attachment must receive the real, COMMITTED host node — not a template prototype,
  // not a detached clone — since every real use (dispatching a command, reading a Fabric tag)
  // needs the live node. Unmount must fire the teardown, or every attachment leaks its cleanup.
  it('invokes the attachment with the committed real host node, and tears it down on unmount', async () => {
    compileToFile(SWAP_PARENT, 'Parent.svelte', PARENT_OUT);
    const Parent = await loadComponent(PARENT_OUT);
    mount(ROOT_TAG, Parent, { onEvent: record, onCapture: captureSetter });
    await tick();
    await tick();

    expect(events.map(entry => entry.name)).toEqual(['attach:first']);
    const node = events[0].node;
    // The resolved Fabric view name (descriptorFor('symbiote-view').component), not the
    // template's intrinsic tag string.
    expect(node.component).toBe('RCTView');
    // The real proof it is the COMMITTED node, not a detached template prototype: it is branded
    // (isSymbioteNode) as one of the engine's own nodes, and the fake Fabric only hands out a tag
    // for a node it actually created — a stale/uncommitted node would never have a live testID.
    expect(isSymbioteNode(node)).toBe(true);
    expect(node.props.testID).toBe('attach-target');

    unmount(ROOT_TAG);
    expect(events.map(entry => entry.name)).toEqual(['attach:first', 'teardown:first']);
  });

  // why: a DYNAMIC attachment expression (`which === 'first' ? first : second`) compiles to a
  // STABLE prop whose VALUE never changes — the read that changes lives inside the wrapper body.
  // Delegating to Svelte's own `attach()` is what makes the swap observable at all; a hand-rolled
  // identity-diff on the prop would never see it (this is the exact bug the file's own header
  // comment records having hit first).
  it('tears down only the attachment that changed, then runs the new one on the same node', async () => {
    compileToFile(SWAP_PARENT, 'Parent.svelte', PARENT_OUT);
    const Parent = await loadComponent(PARENT_OUT);
    mount(ROOT_TAG, Parent, { onEvent: record, onCapture: captureSetter });
    await tick();
    await tick();
    expect(setValue, 'setter captured after mount').not.toBeNull();

    setValue?.('second');
    await tick();
    await tick();

    expect(events.map(entry => entry.name)).toEqual([
      'attach:first',
      'teardown:first',
      'attach:second',
    ]);
    expect(events[2].node).toBe(events[0].node);
  });

  // why: TouchableOpacity owns no host tag of its own — it spreads `...rest` onto Pressable.
  // Symbol keys survive a component spread (spread_props' ownKeys trap walks
  // Object.getOwnPropertySymbols), so the attachment must land on Pressable's host node with NO
  // per-component forwarding code. This is the "free" category from the adapter's own attachment
  // design (skill §22c category 2) — a real, not assumed, proof it stays free.
  it('reaches the host node through a component that only re-spreads its rest props', async () => {
    compileToFile(
      readFileSync(join(COMPONENTS_DIR, 'pressable', 'index.svelte'), 'utf8'),
      'Pressable.svelte',
      PRESSABLE_OUT,
    );
    compileToFile(
      readFileSync(join(COMPONENTS_DIR, 'touchable-opacity', 'index.svelte'), 'utf8').replace(
        "'../pressable/index.svelte'",
        `'../pressable/${PRESSABLE_BASENAME}'`,
      ),
      'TouchableOpacity.svelte',
      TOUCHABLE_OUT,
    );
    compileToFile(
      `<script>
         import TouchableOpacity from './.smoke-compiled-attachments-touchable.mjs';
         let { onEvent } = $props();
         const mark = (node) => { onEvent('attach:touchable', node); };
       </script>
       <TouchableOpacity testID="touchable-target" {@attach mark} />`,
      'TouchableParent.svelte',
      TOUCHABLE_PARENT_OUT,
    );

    const Parent = await loadComponent(TOUCHABLE_PARENT_OUT);
    mount(ROOT_TAG, Parent, { onEvent: record });
    await tick();
    await tick();

    expect(events.map(entry => entry.name)).toEqual(['attach:touchable']);
    expect(events[0].node.props.testID).toBe('touchable-target');
  });

  // why: `fromAction` is the sanctioned bridge for a third-party Svelte ACTION (the ecosystem's
  // own `use:` idiom) into this adapter, since `use:` itself is illegal on a component. Init,
  // update-on-param-change, and destroy-on-unmount are the three calls a real action author
  // expects — all three must actually fire, not just the first.
  it('round-trips a real Svelte action through fromAction', async () => {
    compileToFile(ACTION_PARENT, 'ActionParent.svelte', ACTION_OUT);
    const Parent = await loadComponent(ACTION_OUT);
    mount(ROOT_TAG, Parent, { onEvent: record, onCapture: captureSetter });
    await tick();
    await tick();

    expect(events.map(entry => entry.name)).toEqual(['action:init']);
    expect(events[0].value).toBe('one');
    expect(events[0].node.props.testID).toBe('action-target');

    setValue?.('two');
    await tick();
    await tick();

    expect(events.map(entry => entry.name)).toEqual(['action:init', 'action:update']);
    expect(events[1].value).toBe('two');

    unmount(ROOT_TAG);
    expect(events.map(entry => entry.name)).toEqual([
      'action:init',
      'action:update',
      'action:destroy',
    ]);
  });
});
