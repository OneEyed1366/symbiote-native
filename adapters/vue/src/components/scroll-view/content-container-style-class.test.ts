// contentContainerStyle accepts a bare class-name string, resolved through the SAME shared
// style registry as `class` (routeProp's merge), not the full IClassNameValue union. Proves the
// resolved style lands on the CONTENT node (RCTScrollContentView), not the outer scroll view, and
// that a plain style object still works unchanged. Vue twin of
// adapters/react/src/components/scroll-view/scroll-view-content-container-class.test.tsx.
//
// SCOPE: class-name resolution itself (registerRules/routeProp merge) is core/engine infra with
// its own coverage — N/A here, this file only proves the Vue adapter actually routes
// contentContainerStyle THROUGH that resolution onto the right node. No Negative group: an
// unregistered class name resolves to no styles, it does not throw.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 513;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function mountScrollView(contentContainerStyle: unknown): Promise<void> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h('scroll-view', { contentContainerStyle }, [h('text')]),
    }),
  );
  return tick();
}

describe('Vue <scroll-view> contentContainerStyle class-name resolution', () => {
  it('resolves a class-name string onto the content node, not the outer scroll view', async () => {
    registerRules([
      {
        tokens: ['padded'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 20 },
      },
    ]);
    await mountScrollView('padded');

    const content = fabric.find(n => n.viewName === 'RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    expect(content!.props.padding).toBe(20);

    const outer = fabric.find(n => n.viewName === 'RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();
    expect('padding' in outer!.props).toBe(false);
  });

  it('still accepts a plain style object unchanged', async () => {
    await mountScrollView({ padding: 12 });

    const content = fabric.find(n => n.viewName === 'RCTScrollContentView');
    expect(content!.props.padding).toBe(12);
  });
});
