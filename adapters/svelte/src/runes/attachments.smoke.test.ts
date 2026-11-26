// Proves `{@attach fn}` on a component of this adapter reaches the COMMITTED host node
// Third-party actions come in by `fromAction`, since `{@attach}` is the only directive legal there

// No Negative group: both helpers are total over their input, and a null host is a no-op

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { propOf, type ISymbioteNode } from '@symbiote-native/engine';
import { createAttachmentKey } from 'svelte/attachments';
import { mount, unmount } from '../render';
import { createAttachmentsSync, pickAttachmentProps } from './attachments';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_902;
// Compiled next to the adapter's own components so the fixture's `../runes/attachments` import
// resolves the way a real component's does
const COMPONENTS_DIR = join(__dirname, '..', 'components');
const HOST_OUT = join(COMPONENTS_DIR, '.smoke-compiled-attachments-view.mjs');
const PARENT_OUT = join(
  COMPONENTS_DIR,
  '.smoke-compiled-attachments-parent.mjs',
);
const ACTION_OUT = join(
  COMPONENTS_DIR,
  '.smoke-compiled-attachments-action.mjs',
);
// Each file sits next to its real source so that source's relative imports resolve
// The name is unique to this suite, so concurrent suites do not race on the path
const BARE_TAG_OWNER_OUT = join(
  COMPONENTS_DIR,
  'modal',
  '.smoke-compiled-attachments-modal.mjs',
);
const BARE_TAG_OWNER_PARENT_OUT = join(
  COMPONENTS_DIR,
  'modal',
  '.smoke-compiled-attachments-modal-parent.mjs',
);

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): void {
  writeFileSync(
    outPath,
    compile(source, { ...COMPILE_OPTIONS, filename }).js.code,
  );
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

// The shape a component uses to forward `{@attach}` to the host tag it owns
// It is written inline, so the suite is about the helper and not about one component
const HOST_SOURCE = `<script>
  import { createAttachmentsSync } from '../runes/attachments';
  let { children, ...rest } = $props();
  let hostNode = $state.raw(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => { syncAttachments(hostNode, rest); });
</script>
<view p={rest} {@attach node => { hostNode = node; }}>{@render children?.()}</view>`;

function compileHost(): void {
  compileToFile(HOST_SOURCE, 'AttachmentHost.svelte', HOST_OUT);
}

// Node caches import() by path, so each differently-SOURCED parent needs its own filename
const SWAP_PARENT = `<script>
  import Host from './.smoke-compiled-attachments-view.mjs';
  let { onEvent, onCapture } = $props();
  let which = $state('first');
  $effect(() => { onCapture?.((next) => { which = next; }); });
  const first = (node) => { onEvent('attach:first', node); return () => onEvent('teardown:first', node); };
  const second = (node) => { onEvent('attach:second', node); return () => onEvent('teardown:second', node); };
</script>
<Host testID="attach-target" {@attach which === 'first' ? first : second} />`;

const ACTION_PARENT = `<script>
  import { fromAction } from 'svelte/attachments';
  import Host from './.smoke-compiled-attachments-view.mjs';
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
<Host testID="action-target" {@attach fromAction(action, () => arg)} />`;

type IEvent = {
  name: string;
  node: ISymbioteNode;
  value: unknown;
};

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
  compileHost();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(HOST_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
  rmSync(ACTION_OUT, { force: true });
  rmSync(BARE_TAG_OWNER_OUT, { force: true });
  rmSync(BARE_TAG_OWNER_PARENT_OUT, { force: true });
});

describe('Positive: createAttachmentsSync', () => {
  // The host ref is null before the attachment runs and after teardown, so the sync must be a no-op
  it('is a no-op when the host is null or undefined, and calls nothing', () => {
    const sync = createAttachmentsSync();
    const attachmentKey = createAttachmentKey();
    const props = { [attachmentKey]: (): void => {} };

    expect(() => sync(null, props)).not.toThrow();
    expect(() => sync(undefined, props)).not.toThrow();
  });
});

// The list family rebuilds its child's props by name, which drops symbol keys silently
describe('Positive: pickAttachmentProps', () => {
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

  // The filter keys off the attachment marker's description, so an unrelated symbol must not leak
  it('drops a symbol key that carries no attachment marker', () => {
    const otherSymbol = Symbol('not-an-attachment');
    const picked = pickAttachmentProps({ [otherSymbol]: 'ignored' });
    expect(Object.getOwnPropertySymbols(picked)).toEqual([]);
  });
});

describe('Positive: {@attach} on a Symbiote component', () => {
  // Dispatching a command or reading a Fabric tag needs the live node, and unmount must clean up
  it('invokes the attachment with the committed host node, and tears it down on unmount', async () => {
    compileToFile(SWAP_PARENT, 'Parent.svelte', PARENT_OUT);
    const Parent = await loadComponent(PARENT_OUT);
    mount(ROOT_TAG, Parent, { onEvent: record, onCapture: captureSetter });
    await tick();
    await tick();

    expect(events.map(entry => entry.name)).toEqual(['attach:first']);
    const node = events[0].node;
    expect(node.component).toBe('RCTView');
    expect(propOf(node, 'testID')).toBe('attach-target');

    unmount(ROOT_TAG);
    expect(events.map(entry => entry.name)).toEqual([
      'attach:first',
      'teardown:first',
    ]);
  });

  // A dynamic expression compiles to a stable prop whose reads live inside the wrapper body
  // Delegating to Svelte's `attach()` makes the swap observable, a diff of the prop would miss it
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

  // Modal owns a bare `modal` tag, so the forwarding is its own and no wrapped ancestor supplies it
  // It is the subject because a hidden modal commits zero nodes, so it keeps its own component body
  it('reaches the committed host node of a component that owns a bare tag', async () => {
    compileToFile(
      readFileSync(join(COMPONENTS_DIR, 'modal', 'index.svelte'), 'utf8'),
      'Modal.svelte',
      BARE_TAG_OWNER_OUT,
    );
    compileToFile(
      `<script>
         import Modal from './.smoke-compiled-attachments-modal.mjs';
         let { onEvent } = $props();
         const mark = (node) => { onEvent('attach:touchable', node); };
       </script>
       <Modal testID="touchable-target" visible={true} {@attach mark} />`,
      'BareTagOwnerParent.svelte',
      BARE_TAG_OWNER_PARENT_OUT,
    );

    const Parent = await loadComponent(BARE_TAG_OWNER_PARENT_OUT);
    mount(ROOT_TAG, Parent, { onEvent: record });
    await tick();
    await tick();

    expect(events.map(entry => entry.name)).toEqual(['attach:touchable']);
    expect(propOf(events[0].node, 'testID')).toBe('touchable-target');
  });

  // `fromAction` bridges a third-party action, as `use:` is illegal on a component
  // Init, update on a changed param and destroy on unmount must all fire
  it('round-trips a real Svelte action through fromAction', async () => {
    compileToFile(ACTION_PARENT, 'ActionParent.svelte', ACTION_OUT);
    const Parent = await loadComponent(ACTION_OUT);
    mount(ROOT_TAG, Parent, { onEvent: record, onCapture: captureSetter });
    await tick();
    await tick();

    expect(events.map(entry => entry.name)).toEqual(['action:init']);
    expect(events[0].value).toBe('one');
    expect(propOf(events[0].node, 'testID')).toBe('action-target');

    setValue?.('two');
    await tick();
    await tick();

    expect(events.map(entry => entry.name)).toEqual([
      'action:init',
      'action:update',
    ]);
    expect(events[1].value).toBe('two');

    unmount(ROOT_TAG);
    expect(events.map(entry => entry.name)).toEqual([
      'action:init',
      'action:update',
      'action:destroy',
    ]);
  });
});
