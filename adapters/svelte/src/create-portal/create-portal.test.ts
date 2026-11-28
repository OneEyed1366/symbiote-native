// Proves Portal (./index.ts) on the fake Fabric slot with REAL compiled Svelte sources
// Content authored in one place commits as a DIRECT child of another node and follows `mount`

// Parentage assertions read the LIVE tree (`createLiveTree`), nodes are matched by `testID`
// (.claude/rules/test-harness-false-greens.md), the harness is the one of create-tunnel.test.ts

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { childrenOf, type ISymbioteNode } from '@symbiote-native/engine';
import { mount, unmount } from '../render';

// Both are set by RN before any app code runs (setUpGlobals.js / setUpNavigator.js); a bare
// vitest sandbox has neither, and svelte's init_operations() reads both at first mount.
if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

// A fresh `rootTag` per case, because the engine keeps one root per tag
// (.claude/rules/test-harness-false-greens.md)
let nextRootTag = 91_500;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

// Node caches `import()` by path, so every compiled artifact needs its own filename or a later
// case silently re-runs an earlier one's module (skill §15).
const written: string[] = [];

function compileToFile(source: string, name: string, dir = __dirname): string {
  const outPath = join(dir, `.smoke-compiled-${name}.mjs`);
  writeFileSync(
    outPath,
    compile(source, { ...COMPILE_OPTIONS, filename: `${name}.svelte` }).js.code,
  );
  written.push(outPath);
  return outPath;
}

async function load(
  source: string,
  name: string,
  dir = __dirname,
): Promise<Component> {
  const outPath = compileToFile(source, name, dir);
  const mod: unknown = await import(`file://${outPath}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${name}.svelte produced no default export`);
  }
  const { default: component } = mod;
  if (typeof component !== 'function') {
    throw new Error(`${name}.svelte's default export is not a component`);
  }
  return component;
}

// The unmount case hands its target out to read the retained tree, where a leaked anchor shows
type IUnmountControl = {
  hide(): void;
  target(): ISymbioteNode | null;
};

let mounted: number | undefined;

beforeEach(() => fabric.reset());

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  for (const path of written) rmSync(path, { force: true });
  written.length = 0;
});

function mountApp(App: Component, props?: object): ReturnType<typeof mount> {
  nextRootTag += 1;
  mounted = nextRootTag;
  return mount(nextRootTag, App, props);
}

function findCommitted(
  predicate: (node: ILiveNode) => boolean,
): ILiveNode | undefined {
  return live.findLive(live.appRoot(), predicate);
}

const byText = (text: string) => (node: ILiveNode) =>
  node.viewName === 'RCTRawText' && node.props.text === text;

const byTestID = (testID: string) => (node: ILiveNode) =>
  node.props.testID === testID;

// Identity, not `===` — `ILiveNode` is rebuilt fresh by a getter on every `.children` read.
function contains(root: ILiveNode, target: ILiveNode): boolean {
  if (root.handle === target.handle) return true;
  return root.children.some(child => contains(child, target));
}

function childTestIDs(node: ILiveNode | undefined): unknown[] {
  return (node?.children ?? []).map(child => child.props.testID);
}

// Every scenario hangs a host element off `{@attach}` and gates the Portal behind `{#if overlay}`
// The ref is filled by an effect, so it is still null while the template that reads it first runs
const OVERLAY_TARGET = `
  let overlay = $state.raw(null);
`;

// `onReady` hands a mutator back out to the test — our mount() wrapper discards svelte's own
// mount() return value, so this is the only way to reach into an already-mounted root's state.
// Same self-reported-export pattern ../create-tunnel/create-tunnel.test.ts uses.
const ON_READY = `
  let { onReady } = $props();
  $effect(() => { onReady?.(control); });
`;

describe('Portal', () => {
  // why: the entire point. `ported in` is authored inside the source View and must commit under
  // the overlay host instead — asserted BOTH ways, because "present somewhere" would pass even if
  // Portal had done nothing at all.
  it('commits content under the target node, not its own template position', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         ${OVERLAY_TARGET}
       </script>
       <view p={{ testID: 'root' }}>
         <view p={{ testID: 'source' }}>
           {#if overlay}
             <Portal mount={overlay}>
               {#snippet children()}<text p={{ testID: 'ported' }}>ported in</text>{/snippet}
             </Portal>
           {/if}
         </view>
         <view p={{ testID: 'overlay-host' }} {@attach node => { overlay = node; return () => { overlay = null; }; }}></view>
       </view>`,
      'portal-basic',
    );

    mountApp(App);
    await tick();
    await tick();

    const ported = findCommitted(byTestID('ported'));
    const overlayHost = findCommitted(byTestID('overlay-host'));
    const source = findCommitted(byTestID('source'));
    expect(ported, 'the portaled Text committed').toBeDefined();
    expect(overlayHost, 'the overlay host committed').toBeDefined();
    expect(source, 'the source View committed').toBeDefined();
    if (
      ported === undefined ||
      overlayHost === undefined ||
      source === undefined
    ) {
      throw new Error('unreachable');
    }

    expect(
      contains(overlayHost, ported),
      'portal landed under the overlay host',
    ).toBe(true);
    expect(
      contains(source, ported),
      'portal did NOT stay under its own template parent',
    ).toBe(false);
  });

  // The fragment host is bookkeeping only: if the engine stopped flattening an anchor's children,
  // the portaled Text would vanish or gain a wrapper view, so it is pinned as a DIRECT child
  it('makes the content a direct child of the target, with no wrapper view', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         ${OVERLAY_TARGET}
       </script>
       <view p={{ testID: 'root' }}>
         {#if overlay}
           <Portal mount={overlay}>
             {#snippet children()}<text p={{ testID: 'ported' }}>direct</text>{/snippet}
           </Portal>
         {/if}
         <view p={{ testID: 'overlay-host' }} {@attach node => { overlay = node; return () => { overlay = null; }; }}></view>
       </view>`,
      'portal-direct-child',
    );

    mountApp(App);
    await tick();
    await tick();

    expect(
      childTestIDs(findCommitted(byTestID('overlay-host'))),
      'exactly one direct child, the portaled Text itself',
    ).toEqual(['ported']);
  });

  // A reactive update must keep reaching the content in the target, or dynamic overlays freeze
  // The `{#if}` swaps whole elements, because a `{label}` inside one `<text>` updates itself
  // even if Portal handed over a dead snapshot (.claude/rules/test-harness-false-greens.md)
  it('keeps updating the content in place after the move', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         ${OVERLAY_TARGET}
         let label = $state('first');
         const control = { swap: () => { label = 'second'; } };
         ${ON_READY}
       </script>
       <view p={{ testID: 'root' }}>
         {#if overlay}
           <Portal mount={overlay}>
             {#snippet children()}
               {#if label === 'first'}
                 <text p={{ testID: 'ported' }}>first</text>
               {:else}
                 <text p={{ testID: 'ported' }}>second</text>
               {/if}
             {/snippet}
           </Portal>
         {/if}
         <view p={{ testID: 'overlay-host' }} {@attach node => { overlay = node; return () => { overlay = null; }; }}></view>
       </view>`,
      'portal-reactive',
    );

    let control: { swap: () => void } | undefined;
    mountApp(App, {
      onReady: (value: { swap: () => void }) => {
        control = value;
      },
    });
    await tick();
    await tick();
    expect(findCommitted(byText('first'))).toBeDefined();

    expect(control).toBeDefined();
    control?.swap();
    await tick();
    await tick();

    expect(
      findCommitted(byText('second')),
      'the update reached the target',
    ).toBeDefined();
    expect(
      findCommitted(byText('first')),
      'the old text is gone',
    ).toBeUndefined();
    const overlayHost = findCommitted(byTestID('overlay-host'));
    const updated = findCommitted(byText('second'));
    if (overlayHost === undefined || updated === undefined)
      throw new Error('unreachable');
    expect(
      contains(overlayHost, updated),
      'the update stayed under the target, it did not snap back to the call site',
    ).toBe(true);
  });

  // `mount` is reactive, and an empty host A shows the content relocates instead of being copied
  // A tunnel re-creates its content per outlet
  it('moves the content when `mount` points at a different target', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         let hostA = $state.raw(null);
         let hostB = $state.raw(null);
         let useB = $state(false);
         const control = { toB: () => { useB = true; } };
         ${ON_READY}
         let target = $derived(useB ? hostB : hostA);
       </script>
       <view p={{ testID: 'root' }}>
         {#if target}
           <Portal mount={target}>
             {#snippet children()}<text p={{ testID: 'ported' }}>movable</text>{/snippet}
           </Portal>
         {/if}
         <view p={{ testID: 'host-a' }} {@attach node => { hostA = node; return () => { hostA = null; }; }}></view>
         <view p={{ testID: 'host-b' }} {@attach node => { hostB = node; return () => { hostB = null; }; }}></view>
       </view>`,
      'portal-move',
    );

    let control: { toB: () => void } | undefined;
    mountApp(App, {
      onReady: (value: { toB: () => void }) => {
        control = value;
      },
    });
    await tick();
    await tick();
    expect(
      childTestIDs(findCommitted(byTestID('host-a'))),
      'starts on host A',
    ).toEqual(['ported']);

    expect(control).toBeDefined();
    control?.toB();
    await tick();
    await tick();

    expect(
      childTestIDs(findCommitted(byTestID('host-b'))),
      'moved to host B',
    ).toEqual(['ported']);
    expect(
      childTestIDs(findCommitted(byTestID('host-a'))),
      'and host A is empty again — moved, not copied',
    ).toEqual([]);
  });

  // The effect cleanup must detach the fragment host from a target the Portal does not own
  // The committed tree cannot fail here: the leaked empty anchor is flattened away before Fabric,
  // so the falsifiable check is the target's retained child list, reported back through `control`
  it('removes the content from the target when the Portal unmounts', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         ${OVERLAY_TARGET}
         let visible = $state(true);
         const control = { hide: () => { visible = false; }, target: () => overlay };
         ${ON_READY}
       </script>
       <view p={{ testID: 'root' }}>
         {#if visible && overlay}
           <Portal mount={overlay}>
             {#snippet children()}<text p={{ testID: 'ported' }}>transient</text>{/snippet}
           </Portal>
         {/if}
         <view p={{ testID: 'overlay-host' }} {@attach node => { overlay = node; return () => { overlay = null; }; }}></view>
       </view>`,
      'portal-unmount',
    );

    let control: IUnmountControl | undefined;
    mountApp(App, {
      onReady: (value: IUnmountControl) => {
        control = value;
      },
    });
    await tick();
    await tick();
    expect(findCommitted(byText('transient'))).toBeDefined();

    expect(control).toBeDefined();
    control?.hide();
    await tick();
    await tick();

    expect(
      findCommitted(byText('transient')),
      'gone from the target once the Portal unmounted',
    ).toBeUndefined();
    expect(
      childTestIDs(findCommitted(byTestID('overlay-host'))),
      'the target paints nothing again',
    ).toEqual([]);
    // Through the engine's accessor, as a node's children are derived from its op log
    const host = control?.target();
    expect(
      host === null || host === undefined ? undefined : childrenOf(host).length,
      'and the fragment host itself left the retained tree, no leaked anchor',
    ).toBe(0);
  });

  // The surface is the other `IPortalTarget` member and takes its own branch in `attachHost`
  // (`host.makeLive(surface)` plus `surface.appendChild`), like React's `isSurfaceContainer`
  it('accepts the surface itself as a target', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         let target = $state.raw(null);
         const control = { use: (value) => { target = value; } };
         ${ON_READY}
       </script>
       <view p={{ testID: 'source' }}>
         {#if target}
           <Portal mount={target}>
             {#snippet children()}<text p={{ testID: 'ported' }}>top level</text>{/snippet}
           </Portal>
         {/if}
       </view>`,
      'portal-surface',
    );

    let control: { use: (value: unknown) => void } | undefined;
    const surface = mountApp(App, {
      onReady: (value: { use: (v: unknown) => void }) => {
        control = value;
      },
    });
    await tick();
    expect(control).toBeDefined();
    control?.use(surface);
    await tick();
    await tick();

    const ported = findCommitted(byTestID('ported'));
    const source = findCommitted(byTestID('source'));
    expect(ported, 'the portaled Text committed').toBeDefined();
    expect(source, 'the source View committed').toBeDefined();
    if (ported === undefined || source === undefined)
      throw new Error('unreachable');
    expect(
      contains(source, ported),
      'it left the source subtree for the surface root',
    ).toBe(false);
  });

  // A raw engine node is the third `IPortalTarget` member, the one React's container type has too
  // `hostInstance()` unwraps a host ref into it, and a raw node has no back-pointer to a surface
  it('accepts a raw engine node (hostInstance) as a target', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         import { hostInstance } from '../host-instance.ts';
         ${OVERLAY_TARGET}
         let node = $derived(hostInstance(overlay));
       </script>
       <view p={{ testID: 'root' }}>
         <view p={{ testID: 'source' }}>
           {#if node}
             <Portal mount={node}>
               {#snippet children()}<text p={{ testID: 'ported' }}>raw node</text>{/snippet}
             </Portal>
           {/if}
         </view>
         <view p={{ testID: 'overlay-host' }} {@attach node => { overlay = node; return () => { overlay = null; }; }}></view>
       </view>`,
      'portal-raw-node',
    );

    mountApp(App);
    await tick();
    await tick();

    expect(
      childTestIDs(findCommitted(byTestID('overlay-host'))),
      'a raw engine node is a target too, direct child and all',
    ).toEqual(['ported']);
    const ported = findCommitted(byTestID('ported'));
    const source = findCommitted(byTestID('source'));
    if (ported === undefined || source === undefined)
      throw new Error('unreachable');
    expect(contains(source, ported), 'and it left the call site').toBe(false);
  });

  // A wrong `mount` must fail at the call site with a message in Svelte's terms (`{#if}` gate)
  // The target is validated in the Portal's `$effect`, so the throw travels Svelte's error path
  // and is caught with `<svelte:boundary onerror>`, not with `expect(() => mount()).toThrow()`
  it('throws an actionable error for a target that is not a host node', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         let { target, onerror } = $props();
       </script>
       <svelte:boundary {onerror}>
         <Portal mount={target}>
           {#snippet children()}<text p={{}}>nope</text>{/snippet}
         </Portal>
       </svelte:boundary>`,
      'portal-bad-target',
    );

    const selectorString: unknown = JSON.parse('"body"');
    let caught: unknown;
    mountApp(App, {
      target: selectorString,
      onerror: (error: unknown) => {
        caught = error;
      },
    });
    await tick();
    await tick();

    expect(caught, 'the guard fired').toBeInstanceOf(Error);
    expect(
      caught instanceof Error ? caught.message : '',
      'and says what to do about it, in Svelte terms',
    ).toMatch(/already-mounted host node.*\{#if target\}/s);
  });
});

// Both halves render the SAME Consumer, which reads `getContext('origin')`
// Portal answers 'call site', `createTunnel` answers 'out site'
describe('Portal vs createTunnel — where the content’s context resolves', () => {
  const CONSUMER_SOURCE = `<script>
     import { getContext } from 'svelte';
     const origin = getContext('origin') ?? 'nowhere';
   </script>
   <text p={{ testID: 'consumer' }}>{origin}</text>`;

  const PROVIDER_SOURCE = `<script>
     import { setContext } from 'svelte';
     let { origin, children } = $props();
     setContext('origin', origin);
   </script>
   {@render children()}`;

  // The one capability a tunnel cannot reproduce: Portal renders the snippet in its own context,
  // so only host nodes move and context still comes from where the content was authored
  it('Portal: context resolves from the call site, not from where the content landed', async () => {
    await load(CONSUMER_SOURCE, 'ctx-consumer');
    await load(PROVIDER_SOURCE, 'ctx-provider');
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         import Consumer from './.smoke-compiled-ctx-consumer.mjs';
         import Provider from './.smoke-compiled-ctx-provider.mjs';
         ${OVERLAY_TARGET}
       </script>
       <view p={{ testID: 'root' }}>
         <Provider origin="call site">
           {#snippet children()}
             {#if overlay}
               <Portal mount={overlay}>
                 {#snippet children()}<Consumer />{/snippet}
               </Portal>
             {/if}
           {/snippet}
         </Provider>
         <Provider origin="landing site">
           {#snippet children()}
             <view p={{ testID: 'overlay-host' }} {@attach node => { overlay = node; return () => { overlay = null; }; }}></view>
           {/snippet}
         </Provider>
       </view>`,
      'ctx-portal',
    );

    mountApp(App);
    await tick();
    await tick();

    expect(
      findCommitted(byText('call site')),
      'context came from where the content was written',
    ).toBeDefined();
    expect(
      findCommitted(byText('landing site')),
      'not from where it landed',
    ).toBeUndefined();
  });

  // The other half of the pair: `TunnelOut` renders the snippet in ITS own context, so the same
  // Consumer reads 'landing site'
  it('createTunnel: context resolves from the Out site instead', async () => {
    await load(CONSUMER_SOURCE, 'ctx-tunnel-consumer');
    await load(PROVIDER_SOURCE, 'ctx-tunnel-provider');
    // Compiled into create-tunnel/ so `./tunnel` resolves, named `-for-portal` to dodge its deletes
    // (.claude/rules/smoke-compiled-artifact-collisions.md)
    const TUNNEL_DIR = join(__dirname, '../create-tunnel');
    for (const name of ['tunnel-in', 'tunnel-out']) {
      compileToFile(
        readFileSync(join(TUNNEL_DIR, `${name}.svelte`), 'utf8'),
        `${name}-for-portal`,
        TUNNEL_DIR,
      );
    }
    const App = await load(
      `<script>
         import { createTunnel } from '../create-tunnel/tunnel.ts';
         import TunnelIn from '../create-tunnel/.smoke-compiled-tunnel-in-for-portal.mjs';
         import TunnelOut from '../create-tunnel/.smoke-compiled-tunnel-out-for-portal.mjs';
         import Consumer from './.smoke-compiled-ctx-tunnel-consumer.mjs';
         import Provider from './.smoke-compiled-ctx-tunnel-provider.mjs';
         const tunnel = createTunnel();
       </script>
       <view p={{ testID: 'root' }}>
         <Provider origin="call site">
           {#snippet children()}
             <TunnelIn tunnel={tunnel}>
               {#snippet children()}<Consumer />{/snippet}
             </TunnelIn>
           {/snippet}
         </Provider>
         <Provider origin="landing site">
           {#snippet children()}
             <TunnelOut tunnel={tunnel} />
           {/snippet}
         </Provider>
       </view>`,
      'ctx-tunnel',
    );

    mountApp(App);
    await tick();
    await tick();

    expect(
      findCommitted(byText('landing site')),
      'the tunnel re-creates its content at the Out site, so context resolves there',
    ).toBeDefined();
    expect(
      findCommitted(byText('call site')),
      'and NOT where the content was written',
    ).toBeUndefined();
  });
});
