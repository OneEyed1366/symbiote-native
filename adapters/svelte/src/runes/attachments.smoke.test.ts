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
// KNOWN FAILING (out of this file's fix scope, root-caused, not a test-writing bug): every test
// below in the `{@attach} on a Symbiote component` describe block currently observes the
// forwarded attachment invoked TWICE on the SAME node (verified: `events[0].node ===
// events[1].node`), because View.svelte spreads `{...rest}` directly onto `<symbiote-view>` AND
// separately calls `createAttachmentsSync()`'s own `$effect(() => syncAttachments(hostRef,
// rest))` on the SAME `rest` object. Both now invoke the SAME symbol-keyed attachment: Svelte's
// own `set_attributes` (dom/elements/attributes.js) already calls `attach(element, () => n)` for
// any `ATTACHMENT_KEY`-tagged entry in a spread object — confirmed by reading that source — which
// makes `createAttachmentsSync` redundant for props that are ALSO spread as `{...rest}` onto the
// same element. Under the retired DOM-shim, spreading onto a custom element went through
// `set_custom_element_data`, which has no such automatic attachment handling, so
// `createAttachmentsSync` was load-bearing there; it is not anymore. Fixing this requires editing
// `View.svelte`/`Text.svelte`/`components/switch/index.svelte` and/or `runes/attachments.ts` —
// all explicitly out of scope for this pass (owned by a parallel component-migration effort). The
// assertions below assert the CORRECT single-fire behavior on purpose, left red as a documented,
// root-caused pointer to that fix rather than adjusted to accept the duplicate.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { createAttachmentKey } from 'svelte/attachments';
import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import { mount, unmount } from '../render';
import { pickAttachmentProps } from './attachments';

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

// The forwarding helper the list family and Animated.ScrollView rely on: those rebuild their
// child's props by name (or through a string-keyed Record), which drops symbol keys silently.
describe('pickAttachmentProps', () => {
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
});

describe('{@attach} on a Symbiote component', () => {
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

  // The delegating half of the wiring: TouchableOpacity owns no host tag of its own, it spreads
  // `...rest` onto Pressable. Symbol keys survive a component spread (spread_props' ownKeys trap
  // walks Object.getOwnPropertySymbols), so the attachment lands on Pressable's host node with no
  // per-component forwarding code — this is what makes the touchable family and Button free.
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
