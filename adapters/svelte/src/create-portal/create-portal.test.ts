// Proves Portal (./index.ts) against the fake Fabric slot, driving REAL compiled Svelte sources
// (no hand-written stand-ins): content authored in one template position commits under a
// DIFFERENT node's subtree, as that node's DIRECT child, keeps updating there, moves when `mount`
// changes, leaves when the Portal unmounts, and refuses a target that is not a host node. The
// Solid twin (adapters/solid/src/create-portal/create-portal.test.tsx) and the React twin assert
// the same things.
//
// Every parentage assertion reads `fabric.committed`, never `fabric.created`: a created node's
// children are frozen at its first commit, so parentage after a clone-on-write only exists in the
// committed tree (.claude/rules/test-harness-false-greens.md §2). Nodes are matched by `testID`,
// never by `viewName` — the committed tree is full of RCTViews and "the first one" is somebody
// else's (§3 of the same file).
//
// Harness shape is ../create-tunnel/create-tunnel.test.ts's: compile the real `.svelte` sources at
// run time and dynamic-import the output, because no vite-plugin-svelte is wired into this repo's
// vitest config. `Portal` itself needs none of that — it is plain TS and imports directly.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { mount, unmount } from '../render';

// Both are set by RN before any app code runs (setUpGlobals.js / setUpNavigator.js); a bare
// vitest sandbox has neither, and svelte's init_operations() reads both at first mount.
if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

// A fresh rootTag per case. The engine keeps a per-rootTag root container, so reusing one tag
// across cases lets an earlier case's leftovers answer a later case's assertion — the
// accumulating-state trap .claude/rules/test-harness-false-greens.md warns about.
let nextRootTag = 91_500;

const fabric = installFabric();

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

// The unmount case reports its target back out so the assertion can read the RETAINED tree, which
// is the only place a leaked (flattened, never-painted) anchor is visible.
interface IUnmountControl {
  hide(): void;
  target(): { engineNode?: ISymbioteNode } | null;
}

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

function walk(
  nodes: readonly IFakeNode[],
  visit: (node: IFakeNode) => void,
): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && predicate(node)) found = node;
  });
  return found;
}

const byText = (text: string) => (node: IFakeNode) =>
  node.viewName === 'RCTRawText' && node.props.text === text;

const byTestID = (testID: string) => (node: IFakeNode) =>
  node.props.testID === testID;

function contains(root: IFakeNode, target: IFakeNode): boolean {
  if (root === target) return true;
  return root.children.some(child => contains(child, target));
}

function childTestIDs(node: IFakeNode | undefined): unknown[] {
  return (node?.children ?? []).map(child => child.props.testID);
}

// Every scenario below hangs a host element off `bind:this` and gates the Portal behind
// `{#if overlay}`. That gate is not decoration: a Svelte host ref is populated by an EFFECT, so
// it is still null while the template that reads it first runs — the twin of React's callback-ref
// timing gotcha and of Solid's `<Show when={overlay()}>`. It is also what Portal's own error
// message tells the caller to do.
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
       <symbiote-view p={{ testID: 'root' }}>
         <symbiote-view p={{ testID: 'source' }}>
           {#if overlay}
             <Portal mount={overlay}>
               {#snippet children()}<symbiote-text p={{ testID: 'ported' }}>ported in</symbiote-text>{/snippet}
             </Portal>
           {/if}
         </symbiote-view>
         <symbiote-view p={{ testID: 'overlay-host' }} bind:this={overlay}></symbiote-view>
       </symbiote-view>`,
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

  // why: the fragment host is retained-tree bookkeeping only. If the engine ever stopped
  // flattening an anchor's children into its parent (renderableChildren, commit.ts), the portaled
  // Text would either vanish or gain a wrapper view. This pins it as a DIRECT Fabric child of the
  // target, which is what makes the surface match React's createPortal rather than the DOM
  // community pattern, whose container element always survives the move.
  it('makes the content a direct child of the target, with no wrapper view', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         ${OVERLAY_TARGET}
       </script>
       <symbiote-view p={{ testID: 'root' }}>
         {#if overlay}
           <Portal mount={overlay}>
             {#snippet children()}<symbiote-text p={{ testID: 'ported' }}>direct</symbiote-text>{/snippet}
           </Portal>
         {/if}
         <symbiote-view p={{ testID: 'overlay-host' }} bind:this={overlay}></symbiote-view>
       </symbiote-view>`,
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

  // why: the content is created under the Portal's own owner but lives in someone else's subtree.
  // A reactive update has to keep reaching it there — otherwise the portal is a one-shot move and
  // every dynamic overlay (a toast with a countdown, a live status line) silently freezes.
  //
  // The dynamic part is an {#if} at the PORTAL's own children level, swapping whole elements,
  // deliberately: putting `{label}` inside one <symbiote-text> would prove nothing about Portal —
  // that text node's own template_effect owns the update and would satisfy the assertion even if
  // Portal had handed its snippet over as a dead snapshot (the trap recorded in
  // .claude/rules/test-harness-false-greens.md).
  it('keeps updating the content in place after the move', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         ${OVERLAY_TARGET}
         let label = $state('first');
         const control = { swap: () => { label = 'second'; } };
         ${ON_READY}
       </script>
       <symbiote-view p={{ testID: 'root' }}>
         {#if overlay}
           <Portal mount={overlay}>
             {#snippet children()}
               {#if label === 'first'}
                 <symbiote-text p={{ testID: 'ported' }}>first</symbiote-text>
               {:else}
                 <symbiote-text p={{ testID: 'ported' }}>second</symbiote-text>
               {/if}
             {/snippet}
           </Portal>
         {/if}
         <symbiote-view p={{ testID: 'overlay-host' }} bind:this={overlay}></symbiote-view>
       </symbiote-view>`,
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

  // why: `mount` is documented as reactive. Untested, the effect could quietly freeze on the
  // first target and nobody would know until an app moved an overlay host. The A-is-empty half is
  // what separates MOVED from COPIED — the capability row a tunnel answers the other way, since a
  // tunnel re-creates its content per outlet instead of relocating nodes.
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
       <symbiote-view p={{ testID: 'root' }}>
         {#if target}
           <Portal mount={target}>
             {#snippet children()}<symbiote-text p={{ testID: 'ported' }}>movable</symbiote-text>{/snippet}
           </Portal>
         {/if}
         <symbiote-view p={{ testID: 'host-a' }} bind:this={hostA}></symbiote-view>
         <symbiote-view p={{ testID: 'host-b' }} bind:this={hostB}></symbiote-view>
       </symbiote-view>`,
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

  // why: the effect's cleanup must detach the fragment host from a target the Portal does not own.
  //
  // The committed-tree half of this test CANNOT fail on its own, and that is worth stating rather
  // than counting as coverage: deleting the cleanup entirely still leaves the target painting
  // nothing, because Svelte's own teardown removes the CONTENT from the host and the host is an
  // anchor the commit walk flattens away. What actually leaks is the empty anchor, which Fabric
  // never sees. So the falsifiable assertion is the RETAINED-tree one below — the target's engine
  // child list — and the target is reported back out through `control` for exactly that reason.
  // Measured: with `return () => {}` in place of the detach, the committed assertion passed and
  // the retained one failed.
  it('removes the content from the target when the Portal unmounts', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         ${OVERLAY_TARGET}
         let visible = $state(true);
         const control = { hide: () => { visible = false; }, target: () => overlay };
         ${ON_READY}
       </script>
       <symbiote-view p={{ testID: 'root' }}>
         {#if visible && overlay}
           <Portal mount={overlay}>
             {#snippet children()}<symbiote-text p={{ testID: 'ported' }}>transient</symbiote-text>{/snippet}
           </Portal>
         {/if}
         <symbiote-view p={{ testID: 'overlay-host' }} bind:this={overlay}></symbiote-view>
       </symbiote-view>`,
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
    expect(
      control?.target()?.engineNode?.children.length,
      'and the fragment host itself left the retained tree — no leaked anchor',
    ).toBe(0);
  });

  // why: the surface is the other member of IPortalTarget and takes a different branch in
  // attachHost — `host.makeLive(surface)` plus `surface.appendChild`, instead of handing the host
  // to a shim parent. Untested, that branch would only fail on a real app portaling to the app
  // root. This is React's `isSurfaceContainer` branch, same boundary.
  it('accepts the surface itself as a target', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         let target = $state.raw(null);
         const control = { use: (value) => { target = value; } };
         ${ON_READY}
       </script>
       <symbiote-view p={{ testID: 'source' }}>
         {#if target}
           <Portal mount={target}>
             {#snippet children()}<symbiote-text p={{ testID: 'ported' }}>top level</symbiote-text>{/snippet}
           </Portal>
         {/if}
       </symbiote-view>`,
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

  // why: the third member of IPortalTarget, and the one that makes this boundary the SAME as
  // React's rather than a narrowed one — React's container type is `ISymbioteNode |
  // SymbioteSurface`, and `hostInstance()` is how a Svelte author unwraps a host ref into exactly
  // that raw engine node. It takes its own branch in attachHost, the only one that has to source a
  // surface from the Portal's own call-site anchor because a raw node carries no back-pointer.
  it('accepts a raw engine node (hostInstance) as a target', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         import { hostInstance } from '../host-instance.ts';
         ${OVERLAY_TARGET}
         let node = $derived(hostInstance(overlay));
       </script>
       <symbiote-view p={{ testID: 'root' }}>
         <symbiote-view p={{ testID: 'source' }}>
           {#if node}
             <Portal mount={node}>
               {#snippet children()}<symbiote-text p={{ testID: 'ported' }}>raw node</symbiote-text>{/snippet}
             </Portal>
           {/if}
         </symbiote-view>
         <symbiote-view p={{ testID: 'overlay-host' }} bind:this={overlay}></symbiote-view>
       </symbiote-view>`,
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

  // why: the guard exists so a wrong `mount` fails at the call site with a message written in
  // Svelte's own terms (a null `bind:this` ref, the `{#if}` gate) instead of somewhere inside the
  // engine's appendChild. JSON.parse is how this repo produces an untyped value without an `as`
  // cast — the React and Solid twins do the same.
  //
  // It is caught through `<svelte:boundary onerror>` rather than `expect(() => mount()).toThrow()`:
  // the target is validated inside the Portal's own `$effect`, so the throw travels Svelte's error
  // path, not the caller's stack. Measured — asserting on mount() gave "expected function to throw"
  // while vitest separately reported the very same message as an Uncaught Exception. A boundary is
  // both the idiomatic Svelte catch and a real assertion instead of a leaked rejection.
  it('throws an actionable error for a target that is not a host node', async () => {
    const App = await load(
      `<script>
         import { Portal } from './index.ts';
         let { target, onerror } = $props();
       </script>
       <svelte:boundary {onerror}>
         <Portal mount={target}>
           {#snippet children()}<symbiote-text p={{}}>nope</symbiote-text>{/snippet}
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

// The matched pair the whole "portal is not a tunnel" claim rests on. Both halves render the SAME
// Consumer component, which reads `getContext('origin')`; the only difference is which mechanism
// relocates it. Portal answers 'call site', createTunnel answers 'out site' — and no amount of
// tunnel configuration can produce the first answer, because a tunnel's content is re-created by
// whoever renders the outlet.
describe('Portal vs createTunnel — where the content’s context resolves', () => {
  const CONSUMER_SOURCE = `<script>
     import { getContext } from 'svelte';
     const origin = getContext('origin') ?? 'nowhere';
   </script>
   <symbiote-text p={{ testID: 'consumer' }}>{origin}</symbiote-text>`;

  const PROVIDER_SOURCE = `<script>
     import { setContext } from 'svelte';
     let { origin, children } = $props();
     setContext('origin', origin);
   </script>
   {@render children()}`;

  // why: this is the one capability a tunnel cannot reproduce, so it is pinned rather than
  // asserted in prose. Portal renders the snippet inside its OWN component context — and <Portal>
  // is written at the call site — so only host nodes move; context, and anything else resolved
  // from the component tree, still comes from where the content was authored. The overlay host
  // sits OUTSIDE the provider on purpose.
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
       <symbiote-view p={{ testID: 'root' }}>
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
             <symbiote-view p={{ testID: 'overlay-host' }} bind:this={overlay}></symbiote-view>
           {/snippet}
         </Provider>
       </symbiote-view>`,
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

  // why: the other half of the pair. Identical Consumer, identical two providers — TunnelOut
  // renders the registered snippet inside ITS own component context, so the same content reads
  // 'landing site'. Two mechanisms, opposite answers: that is the measurement behind "portal and
  // tunnel do not overlap", not an opinion about naming.
  it('createTunnel: context resolves from the Out site instead', async () => {
    await load(CONSUMER_SOURCE, 'ctx-tunnel-consumer');
    await load(PROVIDER_SOURCE, 'ctx-tunnel-provider');
    // Compiled into create-tunnel/ so their own `./tunnel` import still resolves, and named
    // `-for-portal` because create-tunnel.test.ts owns the unsuffixed paths and deletes them in
    // its own afterEach — .claude/rules/smoke-compiled-artifact-collisions.md.
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
       <symbiote-view p={{ testID: 'root' }}>
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
       </symbiote-view>`,
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

// Why Portal exists at all when Svelte already has a community portal idiom, measured rather than
// asserted. The conventional spelling is an ACTION — `use:portal={target}`, whose body is
// `target.appendChild(node)` plus a `destroy()` that removes it.
//
// Two findings, both from the installed svelte 5.56.8. (1) `use:` is a COMPILE ERROR on a
// component (`component_invalid_directive`), and app code in this adapter never authors a raw host
// tag, so the community spelling is unreachable from app code by construction — Svelte's own rule,
// not a shim gap. `{@attach}` / `fromAction` is the reachable equivalent, and this adapter already
// forwards attachments onto the host tag (runes/attachments.ts). (2) The action BODY works
// verbatim over the DOM shim, which is what the test below pins — and it still is not React
// parity, because what it relocates is the ELEMENT the directive sits on. That element is a
// wrapper view the target now contains, and an action can never move a fragment of several nodes
// or content that renders no element at all.
describe('the community `use:portal` action over the DOM shim', () => {
  it('moves the element it sits on — proving the shim supports it, and why it is not the portal', async () => {
    const App = await load(
      `<script>
         ${OVERLAY_TARGET}
         // the community action body, verbatim
         function portal(node, target) {
           target.appendChild(node);
           return { destroy() { node.remove(); } };
         }
       </script>
       <symbiote-view p={{ testID: 'root' }}>
         <symbiote-view p={{ testID: 'source' }}>
           {#if overlay}
             <symbiote-view p={{ testID: 'action-wrapper' }} use:portal={overlay}>
               <symbiote-text p={{ testID: 'action-ported' }}>via action</symbiote-text>
             </symbiote-view>
           {/if}
         </symbiote-view>
         <symbiote-view p={{ testID: 'overlay-host' }} bind:this={overlay}></symbiote-view>
       </symbiote-view>`,
      'portal-action',
    );

    mountApp(App);
    await tick();
    await tick();

    const overlayHost = findCommitted(byTestID('overlay-host'));
    const source = findCommitted(byTestID('source'));
    const ported = findCommitted(byTestID('action-ported'));
    expect(overlayHost).toBeDefined();
    expect(source).toBeDefined();
    expect(ported).toBeDefined();
    if (
      overlayHost === undefined ||
      source === undefined ||
      ported === undefined
    ) {
      throw new Error('unreachable');
    }

    expect(
      contains(overlayHost, ported),
      'the action body relocated a live subtree through the shim — appendChild/remove are enough',
    ).toBe(true);
    expect(contains(source, ported), 'and it left the source subtree').toBe(
      false,
    );
    expect(
      childTestIDs(overlayHost),
      'but the target gained a WRAPPER view, not the content itself — the gap Portal closes',
    ).toEqual(['action-wrapper']);
  });
});
