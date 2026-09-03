// The generic wrap itself, over bases this module does NOT own. Every other file in this folder
// exercises Animated.<X> for one of the six real components; this one pins the CONTRACT
// createAnimatedComponent offers any base, including one a consumer writes:
//
//   * a plain host primitive, which exports nothing, so the wrap can only reach its node through
//     the `{@attach}` seam (runes/attachments.ts);
//   * a scroll container, which exports an imperative handle, so the wrap must unwrap it through
//     getScrollNode() — binding the leaf to the handle itself type-checks and then silently
//     animates nothing;
//   * named scoped snippets, which are ordinary props: naming `children` and forwarding only that
//     is the exact bug Vue's wrapper shipped (Animated.FlatList committed empty cells, no error).
//
// The two fixture components below are deliberately hand-written rather than imported: a real
// component would let the wrap pass by accident through some Symbiote-specific detail.
//
// No Negative group: createAnimatedComponent has no rejecting path — any base is accepted and any
// prop rides the open IAnimatedComponentProps bag.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { AnimatedValue } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { createAnimatedComponent } from './create-animated-component';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}
// No NativeAnimatedTurboModule: isNativeAnimatedAvailable() stays false, so this exercises the
// JS-driven flush path exclusively.
globalThis.nativeModuleProxy = undefined;

const ROOT_TAG = 91_109;
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;
const LEAF_OUT = join(__dirname, '.wrap-compiled-foreign-leaf.mjs');
const CONTAINER_OUT = join(__dirname, '.wrap-compiled-foreign-container.mjs');
const PARENT_OUT = join(__dirname, '.wrap-compiled-foreign-parent.mjs');

// A foreign host primitive: exports nothing at all, so `bind:this` on it yields no node. Its only
// contract with the wrap is that it forwards `{@attach}` onto its host tag, which is this
// adapter's documented seam to a committed node.
const FOREIGN_LEAF_SOURCE = `<script>
  import { createAttachmentsSync } from '../../runes/attachments';
  let { children, ...rest } = $props();
  let hostShim = $state.raw(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => { syncAttachments(hostShim, rest); });
  const bag = $derived({ ...rest });
</script>
<symbiote-view p={bag} bind:this={hostShim}>{@render children?.()}</symbiote-view>`;

// A foreign scroll container: exports an imperative handle exactly the way RN's getScrollableNode
// pattern does, and does NOT forward attachments — so getScrollNode() is the ONLY route to its
// node. It also takes its rows through a NAMED scoped snippet, never through `children`.
const FOREIGN_CONTAINER_SOURCE = `<script>
  let { row, data = [], ...rest } = $props();
  let hostShim = $state.raw(null);
  const bag = $derived({ ...rest });
  export function getScrollNode() { return hostShim?.engineNode ?? null; }
  export function scrollToOffset(params) { window.__wrapScrollCalls.push(params); }
</script>
<symbiote-view p={bag} bind:this={hostShim}>{#each data as entry}{@render row?.({ entry })}{/each}</symbiote-view>`;

const PARENT_SOURCE = `<script>
  let { Wrapper, style, data, passthrough } = $props();
  let handle = $state();
  $effect(() => { window.__wrapHandle = handle; });
</script>
{#snippet cell({ entry })}<symbiote-text p={{ text: entry, testID: 'cell-' + entry }}></symbiote-text>{/snippet}
<Wrapper
  bind:this={handle}
  {style}
  {data}
  row={cell}
  testID="wrapped"
  passthroughAnimatedPropExplicitValues={passthrough}
/>`;

const fabric = installFabric();
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

// fabric.find() walks the CREATION log, which never reflects a later clone's props, so a
// live-value assertion has to walk the currently COMMITTED tree instead.
function findLive(
  node: IFakeNode,
  predicate: (n: IFakeNode) => boolean,
): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findLive(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

function wrapped(): IFakeNode {
  const node = findLive(fabric.appRoot(), n => n.props.testID === 'wrapped');
  if (node === undefined) throw new Error('no testID="wrapped" node committed');
  return node;
}

async function loadFixtures(): Promise<{
  Parent: Component;
  ForeignLeaf: unknown;
  ForeignContainer: unknown;
}> {
  compileToFile(FOREIGN_LEAF_SOURCE, 'ForeignLeaf.svelte', LEAF_OUT);
  compileToFile(
    FOREIGN_CONTAINER_SOURCE,
    'ForeignContainer.svelte',
    CONTAINER_OUT,
  );
  compileToFile(PARENT_SOURCE, 'WrapParent.svelte', PARENT_OUT);

  const [leaf, container, parent]: unknown[] = await Promise.all([
    import(`file://${LEAF_OUT}`),
    import(`file://${CONTAINER_OUT}`),
    import(`file://${PARENT_OUT}`),
  ]);
  if (
    leaf === null ||
    typeof leaf !== 'object' ||
    !('default' in leaf) ||
    container === null ||
    typeof container !== 'object' ||
    !('default' in container) ||
    parent === null ||
    typeof parent !== 'object' ||
    !('default' in parent)
  ) {
    throw new Error('a fixture produced no default export');
  }
  return {
    Parent: parent.default as Component,
    ForeignLeaf: leaf.default,
    ForeignContainer: container.default,
  };
}

// The handle's true shape is only known at runtime (the compiled parent's $effect writes it), so
// narrow with a guard rather than an `as` cast.
function isContainerHandle(value: unknown): value is {
  scrollToOffset: (p: unknown) => void;
  getScrollNode: () => unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'scrollToOffset' in value &&
    'getScrollNode' in value
  );
}

beforeEach(() => {
  fabric.reset();
  Object.assign(globalThis, { __wrapScrollCalls: [], __wrapHandle: undefined });
});

afterEach(() => {
  unmount(ROOT_TAG);
  for (const out of [LEAF_OUT, CONTAINER_OUT, PARENT_OUT]) {
    rmSync(out, { force: true });
  }
});

describe('createAnimatedComponent over a foreign base (Positive)', () => {
  // why: the whole point of a GENERIC wrap is that it needs nothing from the base but the two
  // documented seams — a consumer's own component must animate without touching this module. A
  // base that exports nothing has no `bind:this` value at all, so the first paint landing the
  // rasterized value is what proves the `{@attach}` route reached a real committed node.
  it('rasterizes an animated style prop on a base that exports nothing', async () => {
    const { Parent, ForeignLeaf } = await loadFixtures();
    const opacity = new AnimatedValue(0.4);

    mount(ROOT_TAG, Parent, {
      Wrapper: createAnimatedComponent(ForeignLeaf),
      style: { opacity },
    });
    await tick();
    await tick();

    expect(wrapped().viewName).toBe('RCTView');
    expect(wrapped().props.opacity).toBe(0.4);
  });

  // why: the per-frame path never re-renders Svelte — it goes AnimatedProps.update() ->
  // setNativeProps(node). If the wrap bound the leaf to anything but the base's committed node
  // (or to nothing, because the base exports no ref), the first paint above still passes and only
  // this assertion fails.
  it('drives the foreign base committed node from setValue, with no re-render', async () => {
    const { Parent, ForeignLeaf } = await loadFixtures();
    const opacity = new AnimatedValue(0.4);

    mount(ROOT_TAG, Parent, {
      Wrapper: createAnimatedComponent(ForeignLeaf),
      style: { opacity },
    });
    await tick();
    await tick();

    opacity.setValue(0.85);
    await tick();

    expect(wrapped().props.opacity).toBe(0.85);
  });

  // why: Vue's wrapper forwarded only the DEFAULT slot and Animated.FlatList silently committed
  // empty cells. Svelte snippets are ordinary props, so the equivalent bug is the wrap naming
  // `children` (or any other prop) instead of forwarding the whole bag. The container takes its
  // rows exclusively through a NAMED snippet, so a wrap that drops it renders zero cells.
  it('forwards a named scoped snippet, not just default content', async () => {
    const { Parent, ForeignContainer } = await loadFixtures();

    mount(ROOT_TAG, Parent, {
      Wrapper: createAnimatedComponent(ForeignContainer),
      data: ['a', 'b', 'c'],
    });
    await tick();
    await tick();

    expect(wrapped().children.length).toBe(3);
    expect(
      findLive(fabric.appRoot(), n => n.props.testID === 'cell-b'),
      'the named `row` snippet reached the base and rendered its cell',
    ).toBeDefined();
  });

  // why: a scroll container's ref captures an IMPERATIVE HANDLE, never the host node, so the leaf
  // has to be bound through getScrollNode() (the engine's resolveHostNode). Binding the handle
  // itself is silent: setNativeProps no-ops and the animation simply does not move. This
  // container forwards no attachments, so getScrollNode() is the only route that can work.
  it('binds the leaf through getScrollNode(), not the handle itself', async () => {
    const { Parent, ForeignContainer } = await loadFixtures();
    const opacity = new AnimatedValue(0.3);

    mount(ROOT_TAG, Parent, {
      Wrapper: createAnimatedComponent(ForeignContainer),
      data: ['a'],
      style: { opacity },
    });
    await tick();
    await tick();
    expect(wrapped().props.opacity).toBe(0.3);

    opacity.setValue(0.75);
    await tick();

    expect(wrapped().props.opacity).toBe(0.75);
  });

  // why: `bind:this` on Animated.<X> must reach the SAME surface the base exposes — the six
  // hand-authored components used to re-declare every method by hand, so a method added to the
  // base could go missing. The wrap returns the base's own exports, which cannot drift.
  it('exposes the base own imperative handle through bind:this', async () => {
    const { Parent, ForeignContainer } = await loadFixtures();

    mount(ROOT_TAG, Parent, {
      Wrapper: createAnimatedComponent(ForeignContainer),
      data: ['a'],
    });
    await tick();
    await tick();

    const handle = Reflect.get(globalThis, '__wrapHandle');
    expect(isContainerHandle(handle)).toBe(true);
    if (!isContainerHandle(handle)) return;

    handle.scrollToOffset({ offset: 42 });
    expect(Reflect.get(globalThis, '__wrapScrollCalls')).toEqual([
      { offset: 42 },
    ]);
    expect(handle.getScrollNode()).not.toBeNull();
  });

  // why: `passthroughAnimatedPropExplicitValues` is the ONE prop the wrap consumes (RN's
  // sticky-header hit-testing sync). Its style must override the reduced one in the COMMITTED
  // props, and the prop itself must never reach the base as a Fabric prop.
  it('merges the passthrough style over the reduced one and never forwards the prop', async () => {
    const { Parent, ForeignLeaf } = await loadFixtures();
    const opacity = new AnimatedValue(0.2);

    mount(ROOT_TAG, Parent, {
      Wrapper: createAnimatedComponent(ForeignLeaf),
      style: { opacity },
      passthrough: { style: { opacity: 0.6 } },
    });
    await tick();
    await tick();

    expect(wrapped().props.opacity).toBe(0.6);
    expect(
      wrapped().props.passthroughAnimatedPropExplicitValues,
    ).toBeUndefined();
  });
});
