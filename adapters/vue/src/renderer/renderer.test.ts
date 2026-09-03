// Coverage for createSymbioteRenderer (renderer/index.ts): the Vue RendererOptions mapped onto
// the engine's mutation API — the seam that proves the engine is framework-agnostic (M3). Two
// areas:
//  1. patchProp's class/style merge — a Vue `class` binding resolves through resolveClassName
//     into real style props, and an explicit `:style` always wins over a class-derived one
//     regardless of which patchProp call (class vs style) fires last — the ordering hazard
//     documented at the styleParts WeakMap declaration.
//  2. The rest of RendererOptions (createText/createComment/insert/remove/setElementText/
//     nextSibling/parentNode) driven black-box through real Vue template shapes (v-if, v-for,
//     multi-root, raw children), since Vue never exposes these as directly callable — Vue's own
//     patch algorithm is the only caller.
//
// createElement's toPublicInstance grafting (shallowRef identity, Gotcha 1) is proven in
// host-instance.test.ts, not duplicated here.
//
// N/A: querySelector / setScopeId / insertStaticContent are Vue-DOM-only compiler features (raw
// HTML static-content hoisting, CSS scope-id injection) with no RN equivalent; RN has no
// raw-HTML host, so this renderer's degraded stubs (querySelector -> null, setScopeId -> noop,
// insertStaticContent -> empty anchor pair) are never reachable from a real component-based
// template — only from `v-html`-style static hoisting, which this codebase does not use.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '../render';
import { View, Text } from '@symbiote-native/vue';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 341;
const VIEW = 'RCTView';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function committedView(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === VIEW) found = node;
  });
  expect(found, `a ${VIEW} was committed`).toBeDefined();
  if (found === undefined) throw new Error('unreachable: View missing');
  return found;
}

// fabric.find() searches `created` — every node ever createNode'd, INCLUDING ones later removed
// or superseded by a clone-on-write update — so it can't prove "currently in/out of the tree" or
// "currently holds this text/prop". These tests need the LIVE committed tree instead.
function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && predicate(node)) found = node;
  });
  return found;
}

describe('patchProp class/style merge', () => {
  it('resolves a class binding to registered style props', async () => {
    registerRules([
      {
        tokens: ['foo'],
        specificity: [0, 1, 0],
        order: 0,
        style: { color: 'red' },
      },
    ]);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('symbiote-view', { class: 'foo' }),
      }),
    );
    await tick();
    expect(committedView().props.color).toBe('red');
  });

  it('lets an explicit :style win over a class-derived style, regardless of declaration order', async () => {
    registerRules([
      {
        tokens: ['foo'],
        specificity: [0, 1, 0],
        order: 0,
        style: { color: 'red' },
      },
    ]);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('symbiote-view', { class: 'foo', style: { color: 'blue' } }),
      }),
    );
    await tick();
    expect(committedView().props.color).toBe('blue');
  });

  it('leaves an explicit :style unaffected when there is no class', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('symbiote-view', { style: { color: 'blue' } }),
      }),
    );
    await tick();
    expect(committedView().props.color).toBe('blue');
  });

  it('re-resolves and recommits when the class changes reactively', async () => {
    registerRules([
      {
        tokens: ['foo'],
        specificity: [0, 1, 0],
        order: 0,
        style: { color: 'red' },
      },
      {
        tokens: ['bar'],
        specificity: [0, 1, 0],
        order: 1,
        style: { color: 'green' },
      },
    ]);
    const className = ref('foo');
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('symbiote-view', { class: className.value }),
      }),
    );
    await tick();
    expect(committedView().props.color).toBe('red');

    className.value = 'bar';
    await tick();
    expect(committedView().props.color).toBe('green');
  });
});

describe('insert', () => {
  // why: Fabric has no bare-text host — RCTRawText is only valid as a <Text> child. `insert` is
  // the ONE throwing path in this module; a raw string handed to a plain View (not wrapped in
  // <Text>) must fail loudly at mount time rather than silently paint nothing or crash Fabric
  // natively with a less legible error.
  it('rejects a raw text child inserted outside a <Text>', () => {
    expect(() =>
      mount(
        ROOT_TAG,
        defineComponent({ setup: () => () => h(View, null, 'plain text') }),
      ),
    ).toThrow('must be rendered inside a <Text>');
  });
});

describe("createComment / createText('') — Fragment and v-if placeholder anchors", () => {
  // why: Vue represents a false v-if branch as a comment node, and a multi-root/v-for Fragment
  // boundary as an empty text node. Fabric has no comment/empty-text primitive, so both must
  // degrade to a non-painting anchor (never an RCTRawText, which WOULD paint) — otherwise toggling
  // a v-if would either crash insert's raw-text guard above or paint a stray empty view.
  it('toggling v-if false/true does not paint a stray node and correctly shows/hides the view', async () => {
    const visible = ref(false);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          visible.value ? h(View, { nativeID: 'toggle' }) : null,
      }),
    );
    await tick();
    expect(findCommitted(n => n.props.nativeID === 'toggle')).toBeUndefined();

    visible.value = true;
    await tick();
    expect(findCommitted(n => n.props.nativeID === 'toggle')).toBeDefined();

    visible.value = false;
    await tick();
    expect(findCommitted(n => n.props.nativeID === 'toggle')).toBeUndefined();
  });

  it('a multi-root (Fragment) setup commits every root without the Fragment boundary painting', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => [
          h(View, { nativeID: 'a' }),
          h(View, { nativeID: 'b' }),
        ],
      }),
    );
    await tick();
    expect(findCommitted(n => n.props.nativeID === 'a')).toBeDefined();
    expect(findCommitted(n => n.props.nativeID === 'b')).toBeDefined();
  });
});

describe('setElementText — <Text> content updates', () => {
  // why: an RCTText's string is a single RCTRawText child; the renderer either reuses that one
  // child (in place) or tears down and rebuilds it, but from the app's point of view a reactive
  // text change must always converge to the new string, on every subsequent update, not just the
  // first — this is a behavioral (black-box) proof, not an assertion on which internal path fired.
  it('reflects every subsequent reactive text change, not just the first', async () => {
    const label = ref('first');
    mount(
      ROOT_TAG,
      defineComponent({ setup: () => () => h(Text, null, label.value) }),
    );
    await tick();
    expect(
      findCommitted(
        n => n.viewName === 'RCTRawText' && n.props.text === 'first',
      ),
    ).toBeDefined();

    label.value = 'second';
    await tick();
    expect(
      findCommitted(
        n => n.viewName === 'RCTRawText' && n.props.text === 'second',
      ),
    ).toBeDefined();
    expect(findCommitted(n => n.props.text === 'first')).toBeUndefined();

    label.value = 'third';
    await tick();
    expect(
      findCommitted(
        n => n.viewName === 'RCTRawText' && n.props.text === 'third',
      ),
    ).toBeDefined();
  });

  // why: a plain STRING child on the raw HOST INTRINSIC (Vue's TEXT_CHILDREN shape,
  // `h('symbiote-view', {}, 'stray')`) patches through setElementText, NOT insert(), so the
  // <Text>-only invariant has to be enforced in BOTH or the array path throws while the string
  // path builds the same invalid Fabric tree in silence. Intrinsic-specific: the public `View`
  // wrapper passes children through slots, which lands as ARRAY_CHILDREN and hits insert()'s
  // guard instead - only a hand-written `h()` on the raw intrinsic reaches this route.
  it('rejects a plain string child on the raw intrinsic under a non-<Text> View', () => {
    expect(() =>
      mount(
        ROOT_TAG,
        defineComponent({ setup: () => () => h('symbiote-view', {}, 'stray') }),
      ),
    ).toThrow('must be rendered inside a <Text>');
  });
});

describe('remove and reorder', () => {
  // why: v-if removing a nested child must detach it from its retained PARENT (child.parent !==
  // undefined branch of `remove`) — proves the child truly leaves the tree, not just becomes
  // invisible while still committed.
  it('detaches a nested child from its parent when its v-if flips false', async () => {
    const show = ref(true);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            View,
            { nativeID: 'parent' },
            show.value ? [h(View, { nativeID: 'child' })] : [],
          ),
      }),
    );
    await tick();
    expect(findCommitted(n => n.props.nativeID === 'child')).toBeDefined();

    show.value = false;
    await tick();
    expect(findCommitted(n => n.props.nativeID === 'child')).toBeUndefined();
    expect(findCommitted(n => n.props.nativeID === 'parent')).toBeDefined();
  });

  // why: a keyed v-for reorder drives Vue's patch algorithm to call `insert` with an anchor and
  // query `nextSibling`/`parentNode` to find where to move existing nodes — proving the final
  // committed order matches the new key order is the only black-box way to confirm those two
  // pure-lookup nodeOps feed the mover correctly (they have no other public surface to call).
  it('reflects a keyed list reorder in committed sibling order', async () => {
    const order = ref(['a', 'b', 'c']);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            View,
            { nativeID: 'list' },
            order.value.map(key => h(View, { key, nativeID: `item-${key}` })),
          ),
      }),
    );
    await tick();
    const list = findCommitted(n => n.props.nativeID === 'list');
    expect(list, 'list root committed').toBeDefined();
    if (list === undefined) throw new Error('unreachable: list missing');
    expect(list.children.map(c => c.props.nativeID)).toEqual([
      'item-a',
      'item-b',
      'item-c',
    ]);

    order.value = ['c', 'a', 'b'];
    await tick();
    const reordered = findCommitted(n => n.props.nativeID === 'list');
    if (reordered === undefined)
      throw new Error('unreachable: list missing after reorder');
    expect(reordered.children.map(c => c.props.nativeID)).toEqual([
      'item-c',
      'item-a',
      'item-b',
    ]);
  });
});

// The lowered path: the SFC transformer rewrites <View>/<Text> to their intrinsic TAGS
// (metro-vue-transformer.cjs), so those nodes reach the renderer with no component wrapper in
// between. Two things the wrapper used to do must therefore happen here — RN's Text.js defaults
// (resolveTextProps) and the kebab->camel attr fold (normalizeVueAttrs). Both failures are
// silent: a clipped line with no ellipsis, and a prop that never reaches Fabric.
describe('lowered host primitives (intrinsic tags)', () => {
  const findByTestId = (id: string): IFakeNode | undefined =>
    findCommitted(node => node.props.testID === id);

  const mountTemplate = async (render: () => unknown): Promise<void> => {
    mount(ROOT_TAG, defineComponent({ setup: () => render }));
    await tick();
  };

  it("seeds RN's Text defaults on an intrinsic symbiote-text", async () => {
    await mountTemplate(() =>
      h('symbiote-text', { testID: 'plain' }, ['hello']),
    );
    const props = findByTestId('plain')?.props;
    expect(props?.ellipsizeMode).toBe('tail');
    expect(props?.allowFontScaling).toBe(true);
  });

  it('lets an explicit value beat the seeded default', async () => {
    await mountTemplate(() =>
      h(
        'symbiote-text',
        {
          testID: 'explicit',
          ellipsizeMode: 'middle',
          allowFontScaling: false,
        },
        ['hello'],
      ),
    );
    const props = findByTestId('explicit')?.props;
    expect(props?.ellipsizeMode).toBe('middle');
    expect(props?.allowFontScaling).toBe(false);
  });

  // RN treats a missing prop and an explicit `undefined` alike — only a literal `false` opts out
  // (core/components/src/text-props.ts). Without the re-seed in patchProp the undefined would
  // delete the default instead.
  it('keeps the default when the prop is explicitly undefined', async () => {
    await mountTemplate(() =>
      h(
        'symbiote-text',
        {
          testID: 'undef',
          ellipsizeMode: undefined,
          allowFontScaling: undefined,
        },
        ['hello'],
      ),
    );
    const props = findByTestId('undef')?.props;
    expect(props?.ellipsizeMode).toBe('tail');
    expect(props?.allowFontScaling).toBe(true);
  });

  it('folds a kebab attr to camelCase on an intrinsic tag', async () => {
    await mountTemplate(() =>
      h('symbiote-view', {
        testID: 'kebab',
        'accessibility-label': 'close',
      }),
    );
    const props = findByTestId('kebab')?.props;
    expect(props?.accessibilityLabel).toBe('close');
  });

  // The aria- family is the ONE hyphenated group patchProp's kebab -> camel pass must leave alone.
  // The engine's foldAriaProps reads the hyphenated spelling literally (`bag['aria-label']`), so a
  // camelized `ariaLabel` is invisible to it: the fold never runs and the key reaches Fabric dead,
  // where no ViewConfig declares it.
  //
  // The witness used to be the raw `aria-label` surviving into the payload. That stopped being
  // observable once the fold moved into fabricProps — it now consumes the key and nulls it — and
  // "the key is gone" is exactly what a wrongly-camelized attr would also produce. So the claim is
  // pinned from BOTH sides instead: the fold's OUTPUT carries the aria value (only reachable if the
  // hyphenated key arrived intact), and no camelized key is left behind.
  it('leaves the aria- family hyphenated for the engine to fold', async () => {
    await mountTemplate(() =>
      h('symbiote-view', { testID: 'aria', 'aria-label': 'from-aria' }),
    );
    const props = findByTestId('aria')?.props;
    expect(props?.accessibilityLabel).toBe('from-aria');
    expect(props).not.toHaveProperty('ariaLabel');
  });

  it('leaves a non-text node without text defaults', async () => {
    await mountTemplate(() => h('symbiote-view', { testID: 'view' }));
    const props = findByTestId('view')?.props;
    expect(props?.ellipsizeMode).toBeUndefined();
    expect(props?.allowFontScaling).toBeUndefined();
  });

  // RN's `id` is the W3C alias for `nativeID` and Fabric knows only the latter, so an unfolded
  // `id` reaches the native view as an unknown prop and the element ends up with no nativeID at
  // all — which breaks the one thing nativeID is for (InputAccessoryView pairing) with nothing
  // red anywhere. React, Svelte and Solid all fold it; Vue did not, on any of its four paths.
  it('folds id to nativeID on an intrinsic tag', async () => {
    await mountTemplate(() =>
      h('symbiote-view', { testID: 'aliased', id: 'accessory-1' }),
    );
    const props = findByTestId('aliased')?.props;
    expect(props?.nativeID).toBe('accessory-1');
    expect(props?.id, 'the alias must not also reach Fabric').toBeUndefined();
  });

  it('folds id on a Text node too', async () => {
    await mountTemplate(() =>
      h('symbiote-text', { testID: 'aliased-text', id: 'label-1' }, 'x'),
    );
    expect(findByTestId('aliased-text')?.props.nativeID).toBe('label-1');
  });
});
