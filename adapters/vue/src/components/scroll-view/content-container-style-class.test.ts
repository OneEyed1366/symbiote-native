// Regression guard: contentContainerStyle previously accepted ONLY a JS style object/array
// (isStyleProp rejects a bare string), so a class-name string was silently dropped. It now
// resolves through the shared style registry, same as `class`/`style` (see shared.ts). Mirrors
// scroll-view-android-class.test.ts's style-for-this-exact-scenario shape.
//
// Unit under test: the `contentContainerStyle` ternary in adapters/vue/src/components/scroll-view
// /shared.ts's createScrollView render (string -> resolveClassName | isStyleProp -> passthrough |
// else -> undefined), landing on the content view, never the outer scroll view.
//
// No Negative group: contentContainerStyle has no throwing path — an unresolvable value degrades
// to `undefined`, it never rejects.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, ScrollView } from '@symbiote-native/vue';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 513;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function committedContentView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollContentView');
  expect(node, 'the scroll content view was committed').toBeDefined();
  if (node === undefined) throw new Error('unreachable: content view missing');
  return node;
}

function mountScrollView(contentContainerStyle: unknown): Promise<void> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(ScrollView, { contentContainerStyle }, { default: () => [h('symbiote-text')] }),
    }),
  );
  return tick();
}

describe('Vue ScrollView contentContainerStyle class-name support', () => {
  describe('Positive (every accepted shape resolves onto the content view without error)', () => {
    it('resolves a class-name string onto the content view, not the outer scroll view', async () => {
      // why: the class-name path is the regression this file guards, and it must land on the
      // content container, not the outer RCTScrollView that pans it.
      registerStyles({ padded: { padding: 20 } });
      await mountScrollView('padded');

      expect(committedContentView().props.padding).toBe(20);
      const scrollView = fabric.find(n => n.viewName === 'RCTScrollView');
      expect(scrollView?.props.padding).toBeUndefined();
    });

    it('still accepts an ordinary style object unchanged', async () => {
      // why: the class-name branch is additive to the pre-existing object/array contract, not a
      // replacement for it.
      await mountScrollView({ padding: 12 });

      expect(committedContentView().props.padding).toBe(12);
    });

    it('drops an unresolvable contentContainerStyle rather than throwing', async () => {
      // why: the ternary's else-branch (not a string, not isStyleProp) must degrade to
      // `undefined` — a malformed prop must never crash the scroll content render.
      await mountScrollView(42);

      expect(committedContentView().props.padding).toBeUndefined();
    });
  });
});
