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
// No primitive import: `view` and `text` are TAGS written directly below.
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 341;
const VIEW = 'RCTView';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function committedView(): ILiveNode {
  const found = live.findLive(live.appRoot(), node => node.viewName === VIEW);
  expect(found, `a ${VIEW} was committed`).toBeDefined();
  if (found === undefined) throw new Error('unreachable: View missing');
  return found;
}

// fabric.find() searches the CREATION LOG — every node ever created, INCLUDING ones later
// removed or superseded — so it can't prove "currently in/out of the tree" or "currently holds
// this text/prop". These tests need the LIVE committed tree instead.
function findCommitted(
  predicate: (node: ILiveNode) => boolean,
): ILiveNode | undefined {
  return live.findLive(live.appRoot(), predicate);
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
        setup: () => () => h('view', { class: 'foo' }),
      }),
    );
    await tick();
    expect(committedView().payload.color).toBe('red');
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
          h('view', { class: 'foo', style: { color: 'blue' } }),
      }),
    );
    await tick();
    expect(committedView().payload.color).toBe('blue');
  });

  it('leaves an explicit :style unaffected when there is no class', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('view', { style: { color: 'blue' } }),
      }),
    );
    await tick();
    expect(committedView().payload.color).toBe('blue');
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
        setup: () => () => h('view', { class: className.value }),
      }),
    );
    await tick();
    expect(committedView().payload.color).toBe('red');

    className.value = 'bar';
    await tick();
    expect(committedView().payload.color).toBe('green');
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
        defineComponent({ setup: () => () => h('view', null, 'plain text') }),
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
          visible.value ? h('view', { nativeID: 'toggle' }) : null,
      }),
    );
    await tick();
    expect(findCommitted(n => n.payload.nativeID === 'toggle')).toBeUndefined();

    visible.value = true;
    await tick();
    expect(findCommitted(n => n.payload.nativeID === 'toggle')).toBeDefined();

    visible.value = false;
    await tick();
    expect(findCommitted(n => n.payload.nativeID === 'toggle')).toBeUndefined();
  });

  it('a multi-root (Fragment) setup commits every root without the Fragment boundary painting', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => [
          h('view', { nativeID: 'a' }),
          h('view', { nativeID: 'b' }),
        ],
      }),
    );
    await tick();
    expect(findCommitted(n => n.payload.nativeID === 'a')).toBeDefined();
    expect(findCommitted(n => n.payload.nativeID === 'b')).toBeDefined();
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
      defineComponent({ setup: () => () => h('text', null, label.value) }),
    );
    await tick();
    expect(
      findCommitted(
        n => n.viewName === 'RCTRawText' && n.payload.text === 'first',
      ),
    ).toBeDefined();

    label.value = 'second';
    await tick();
    expect(
      findCommitted(
        n => n.viewName === 'RCTRawText' && n.payload.text === 'second',
      ),
    ).toBeDefined();
    expect(findCommitted(n => n.payload.text === 'first')).toBeUndefined();

    label.value = 'third';
    await tick();
    expect(
      findCommitted(
        n => n.viewName === 'RCTRawText' && n.payload.text === 'third',
      ),
    ).toBeDefined();
  });

  // why: a plain STRING child on the raw HOST INTRINSIC (Vue's TEXT_CHILDREN shape,
  // `h('view', {}, 'stray')`) patches through setElementText, NOT insert(), so the
  // <Text>-only invariant has to be enforced in BOTH or the array path throws while the string
  // path builds the same invalid Fabric tree in silence. Intrinsic-specific: the public `View`
  // wrapper passes children through slots, which lands as ARRAY_CHILDREN and hits insert()'s
  // guard instead - only a hand-written `h()` on the raw intrinsic reaches this route.
  it('rejects a plain string child on the raw intrinsic under a non-<Text> View', () => {
    expect(() =>
      mount(
        ROOT_TAG,
        defineComponent({ setup: () => () => h('view', {}, 'stray') }),
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
            'view',
            { nativeID: 'parent' },
            show.value ? [h('view', { nativeID: 'child' })] : [],
          ),
      }),
    );
    await tick();
    expect(findCommitted(n => n.payload.nativeID === 'child')).toBeDefined();

    show.value = false;
    await tick();
    expect(findCommitted(n => n.payload.nativeID === 'child')).toBeUndefined();
    expect(findCommitted(n => n.payload.nativeID === 'parent')).toBeDefined();
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
            'view',
            { nativeID: 'list' },
            order.value.map(key => h('view', { key, nativeID: `item-${key}` })),
          ),
      }),
    );
    await tick();
    const list = findCommitted(n => n.payload.nativeID === 'list');
    expect(list, 'list root committed').toBeDefined();
    if (list === undefined) throw new Error('unreachable: list missing');
    expect(list.children.map(c => c.payload.nativeID)).toEqual([
      'item-a',
      'item-b',
      'item-c',
    ]);

    order.value = ['c', 'a', 'b'];
    await tick();
    const reordered = findCommitted(n => n.payload.nativeID === 'list');
    if (reordered === undefined)
      throw new Error('unreachable: list missing after reorder');
    expect(reordered.children.map(c => c.payload.nativeID)).toEqual([
      'item-c',
      'item-a',
      'item-b',
    ]);
  });
});

// An intrinsic TAG reaches the renderer with no component wrapper in between, so what a wrapper used
// to do must happen somewhere else. There were TWO such things here and there is one left: the
// kebab->camel attr fold (`normalizeVueAttrs`), whose failure is silent — a prop that never reaches
// Fabric under a name no ViewConfig declares.
//
// RN's Text.js defaults were the other, and they went one layer further down on 2026-09-18 rather
// than staying in this renderer. `foldTextDefaults` reads the authored bag at payload time, so it
// needs no help from any adapter, and the claims are in
// `core/engine/cpp/tests/js/committed-payload.itest.ts`. What this renderer still owes a text tag is
// FORWARDING, which is what the cases below assert.
describe('host primitives as intrinsic tags', () => {
  const findByTestId = (id: string): ILiveNode | undefined =>
    findCommitted(node => node.payload.testID === id);

  const mountTemplate = async (render: () => unknown): Promise<void> => {
    mount(ROOT_TAG, defineComponent({ setup: () => render }));
    await tick();
  };

  // why: the engine's rule is keyed on the COMPONENT, so committing an intrinsic `text` as `RCTText`
  // is the precondition for every default landing. This is what the old "seeds RN's Text defaults"
  // case was really establishing about the renderer.
  it('commits an intrinsic text under the component the rule is keyed on', async () => {
    await mountTemplate(() => h('text', { testID: 'plain' }, ['hello']));
    expect(findByTestId('plain')?.viewName).toBe('RCTText');
  });

  it('forwards an explicit value rather than folding it', async () => {
    await mountTemplate(() =>
      h(
        'text',
        {
          testID: 'explicit',
          ellipsizeMode: 'middle',
          allowFontScaling: false,
        },
        ['hello'],
      ),
    );
    const props = findByTestId('explicit')?.payload;
    expect(props?.ellipsizeMode).toBe('middle');
    expect(props?.allowFontScaling).toBe(false);
  });

  // why: this renderer used to SUBSTITUTE the default for an explicit `undefined` in `patchProp`,
  // on the reasoning that RN treats a missing prop and an explicit `undefined` alike. True, and the
  // engine is where it is now acted on — which means the renderer's job is the opposite one: pass
  // the clear through untouched and let the rule decide. A renderer that still substituted would be
  // invisible here and would diverge from the other four.
  it('forwards an explicit undefined rather than substituting for it', async () => {
    await mountTemplate(() =>
      h(
        'text',
        {
          testID: 'undef',
          ellipsizeMode: undefined,
          allowFontScaling: undefined,
        },
        ['hello'],
      ),
    );
    const props = findByTestId('undef')?.payload;
    expect(props?.ellipsizeMode).toBeUndefined();
    expect(props?.allowFontScaling).toBeUndefined();
  });

  it('folds a kebab attr to camelCase on an intrinsic tag', async () => {
    await mountTemplate(() =>
      h('view', {
        testID: 'kebab',
        'accessibility-label': 'close',
      }),
    );
    const props = findByTestId('kebab')?.payload;
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
      h('view', { testID: 'aria', 'aria-label': 'from-aria' }),
    );
    const props = findByTestId('aria')?.payload;
    expect(props?.accessibilityLabel).toBe('from-aria');
    expect(props).not.toHaveProperty('ariaLabel');
  });

  it('leaves a non-text node without text defaults', async () => {
    await mountTemplate(() => h('view', { testID: 'view' }));
    const props = findByTestId('view')?.payload;
    expect(props?.ellipsizeMode).toBeUndefined();
    expect(props?.allowFontScaling).toBeUndefined();
  });

  // RN's `id` is the W3C alias for `nativeID` and Fabric knows only the latter, so an unfolded
  // `id` reaches the native view as an unknown prop and the element ends up with no nativeID at
  // all — which breaks the one thing nativeID is for (InputAccessoryView pairing) with nothing
  // red anywhere. React, Svelte and Solid all fold it; Vue did not, on any of its four paths.
  it('folds id to nativeID on an intrinsic tag', async () => {
    await mountTemplate(() =>
      h('view', { testID: 'aliased', id: 'accessory-1' }),
    );
    const props = findByTestId('aliased')?.payload;
    expect(props?.nativeID).toBe('accessory-1');
    expect(props?.id, 'the alias must not also reach Fabric').toBeUndefined();
  });

  it('folds id on a Text node too', async () => {
    await mountTemplate(() =>
      h('text', { testID: 'aliased-text', id: 'label-1' }, 'x'),
    );
    expect(findByTestId('aliased-text')?.payload.nativeID).toBe('label-1');
  });
});
