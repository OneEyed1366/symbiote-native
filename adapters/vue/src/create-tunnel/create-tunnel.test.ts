// Proves createTunnel (create-tunnel.ts) actually solves the case Teleport's scope
// explicitly does NOT cover: content registered by one surface painting on a GENUINELY
// different, independently-mounted SymbioteSurface — the concrete "system overlay lives in
// its own mount() call" scenario. Unlike the Teleport test (runtime-helpers.test.ts), there
// is no shared node/ref here at all — the two apps below never touch each other's Fabric
// tree directly, only a plain shared reactive Map.

import { defineComponent, h, inject, provide, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTunnel, mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const SOURCE_TAG = 622;
const TARGET_TAG = 623;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(SOURCE_TAG);
  unmount(TARGET_TAG);
});

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function findText(text: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTRawText' && node.props.text === text)
      found = node;
  });
  return found;
}

function findByTestId(testId: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.props.testID === testId) found = node;
  });
  return found;
}

// Positive only: createTunnel has no invalid-input/guard-clause path — `In`/`Out` take no props
// that could be malformed, and the shared Map is entirely internal. There is no Negative group.
describe('createTunnel — genuine cross-surface delivery', () => {
  it('paints content registered by surface A on surface B, a DIFFERENT mounted surface', async () => {
    const tunnel = createTunnel();

    const SourceApp = defineComponent({
      setup: () => () =>
        h(tunnel.In, {}, () =>
          h('symbiote-text', {}, 'ported across surfaces'),
        ),
    });
    const TargetApp = defineComponent({
      setup: () => () =>
        h('symbiote-view', { testID: 'target' }, [h(tunnel.Out)]),
    });

    // Surface A registers content, fully synchronously, before surface B ever mounts.
    mount(SOURCE_TAG, SourceApp);
    await tick();
    // Surface B mounts SEPARATELY (its own rootTag, its own SymbioteSurface) and reads the
    // tunnel via <tunnel.Out/> on its OWN first render — no ref, no isSymbioteNode guard, no
    // rootTag lookup.
    mount(TARGET_TAG, TargetApp);
    await tick();

    // fake-fabric's `committed` is last-write-wins across rootTags (core/test-utils
    // limitation, not the engine's), so after mounting B second, it reflects B's own tree.
    const ported = findText('ported across surfaces');
    expect(
      ported,
      'content is present in the LAST-committed tree (surface B)',
    ).toBeDefined();
  });

  it('removes the content from the target once the source unmounts', async () => {
    const tunnel = createTunnel();

    const SourceApp = defineComponent({
      setup: () => () =>
        h(tunnel.In, {}, () => h('symbiote-text', {}, 'still here')),
    });
    const TargetApp = defineComponent({
      setup: () => () =>
        h('symbiote-view', { testID: 'target' }, [h(tunnel.Out)]),
    });

    mount(SOURCE_TAG, SourceApp);
    await tick();
    mount(TARGET_TAG, TargetApp);
    await tick();
    expect(
      findText('still here'),
      'present while the source is mounted',
    ).toBeDefined();

    // Tearing down surface A unmounts <tunnel.In>, whose onUnmounted drops it from the shared
    // Map — surface B's <tunnel.Out/> reacts to that Map mutation and recommits itself.
    unmount(SOURCE_TAG);
    await tick();
    expect(
      findText('still here'),
      'gone from surface B after the source unmounts',
    ).toBeUndefined();
  });

  it('reacts to the slot content — updates propagate to an already-mounted target', async () => {
    const tunnel = createTunnel();
    const visible = ref(true);

    const SourceApp = defineComponent({
      setup: () => () =>
        h(tunnel.In, {}, () =>
          visible.value ? [h('symbiote-text', {}, 'toggle me')] : [],
        ),
    });
    const TargetApp = defineComponent({
      setup: () => () =>
        h('symbiote-view', { testID: 'target' }, [h(tunnel.Out)]),
    });

    mount(SOURCE_TAG, SourceApp);
    mount(TARGET_TAG, TargetApp);
    await tick();
    expect(findText('toggle me'), 'visible on first render').toBeDefined();

    visible.value = false;
    await tick();
    expect(
      findText('toggle me'),
      'gone after the source flips its own slot content',
    ).toBeUndefined();
  });

  // why: the doc comment on `Out` promises "renders everything currently tunneled in, in
  // registration order" — every other test in this file registers exactly one <tunnel.In>, so
  // that ordering promise is otherwise unverified.
  it('renders multiple simultaneous registrations in registration order', async () => {
    const tunnel = createTunnel();

    const SourceApp = defineComponent({
      setup: () => () => [
        h(tunnel.In, {}, () => h('symbiote-text', {}, 'first')),
        h(tunnel.In, {}, () => h('symbiote-text', {}, 'second')),
      ],
    });
    const TargetApp = defineComponent({
      setup: () => () =>
        h('symbiote-view', { testID: 'target' }, [h(tunnel.Out)]),
    });

    mount(SOURCE_TAG, SourceApp);
    await tick();
    mount(TARGET_TAG, TargetApp);
    await tick();

    const target = findByTestId('target');
    expect(target, 'target view committed').toBeDefined();
    if (target === undefined) throw new Error('unreachable: target missing');
    // Each registration is an RCTText wrapping one RCTRawText child, not a bare RCTRawText —
    // read the raw text one level below each direct child to recover registration order.
    const texts = target.children.map(cell => cell.children[0]?.props.text);
    expect(texts).toEqual(['first', 'second']);
  });

  // why: the React twin's create-tunnel history records a real infinite-render-loop white screen
  // when In/Out shared ONE component; this Vue version avoids the class structurally (In writes
  // the Map, but never reads it, so it has no reactive dependency on its own write) — but that
  // structural argument is only a proof if something actually mounts In and Out TOGETHER in one
  // render tree and settles, rather than always in separate surfaces like every test above.
  it('settles without a render loop when In and Out share the same surface', async () => {
    const tunnel = createTunnel();
    mount(
      SOURCE_TAG,
      defineComponent({
        setup: () => () =>
          h('symbiote-view', {}, [
            h(tunnel.In, {}, () => h('symbiote-text', {}, 'same-surface')),
            h(tunnel.Out),
          ]),
      }),
    );
    await tick();

    expect(findText('same-surface')).toBeDefined();
    // A real render loop would keep re-committing every microtask; a handful of commits for one
    // mount + one reactive settle is the honest upper bound, not an exact implementation count.
    expect(fabric.counts.completeRoot).toBeLessThan(5);
  });
  // why: the exact inverse of the portal's provide/inject test
  // (../create-portal/create-portal.test.ts), and the reason the two mechanisms are not
  // interchangeable. A tunnel moves no nodes — `In` hands over a SLOT and `Out` invokes it, so the
  // content's vnodes are created in Out's component tree and inject resolves from the OUT site.
  // That is precisely what buys the tunnel its cross-surface reach (there is nothing to move
  // between two surfaces) and what a caller has to know before choosing between the two.
  it('resolves inject from the Out site, not the In site', async () => {
    const tunnel = createTunnel();
    const ORIGIN_KEY = 'tunnel-origin';

    const Consumer = defineComponent({
      setup: () => {
        const origin = inject(ORIGIN_KEY, 'default');
        return () => h('symbiote-text', {}, origin);
      },
    });
    const Provider = defineComponent({
      props: { origin: { type: String, required: true } },
      setup: (props, { slots }) => {
        provide(ORIGIN_KEY, props.origin);
        return () => slots.default?.();
      },
    });

    mount(
      SOURCE_TAG,
      defineComponent({
        setup: () => () =>
          h('symbiote-view', {}, [
            h(
              Provider,
              { origin: 'in site' },
              {
                default: () => h(tunnel.In, {}, () => h(Consumer)),
              },
            ),
            h(
              Provider,
              { origin: 'out site' },
              {
                default: () => h('symbiote-view', {}, [h(tunnel.Out)]),
              },
            ),
          ]),
      }),
    );
    await tick();

    expect(
      findText('out site'),
      'the content resolved inject where it is rendered',
    ).toBeDefined();
    expect(findText('in site'), 'not where it was written').toBeUndefined();
  });
});
