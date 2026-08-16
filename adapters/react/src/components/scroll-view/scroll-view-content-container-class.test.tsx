// contentContainerStyle accepts a bare class-name string, resolved through the SAME shared
// style registry as `className` (routeProp's merge), not the full IClassNameValue union.
// Proves the resolved style lands on the CONTENT node (RCTScrollContentView), not the outer
// scroll view, and that a plain style object still works unchanged.
//
// SCOPE: class-name resolution itself (registerStyles/routeProp merge) is core/engine infra
// with its own coverage (style-registry) — N/A here, this file only proves ScrollView actually
// routes contentContainerStyle THROUGH that resolution onto the right node. No Negative group:
// an unregistered class name resolves to no styles, it does not throw (same as `className`
// elsewhere in the repo) — untested here as it would just be re-testing routeProp's own contract.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { View, mount, unmount } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { ScrollView } from './index';

const ROOT_TAG = 54;
const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('React ScrollView contentContainerStyle class-name resolution', () => {
  // why: contentContainerStyle historically only accepted a style object; accepting a bare
  // class-name string (CSS-modules / scoped `<style>` convention) means it must route through
  // the SAME registry className does, landing on the content node and never the outer frame.
  it('resolves a class-name string onto the content node', () => {
    registerStyles({ scrollContent: { padding: 8 } });
    mount(
      ROOT_TAG,
      <ScrollView contentContainerStyle="scrollContent">
        <View />
      </ScrollView>,
    );

    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    expect(content!.props.padding).toBe(8);

    // The class must NOT leak onto the outer scroll view.
    const outer = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();
    expect('padding' in outer!.props).toBe(false);
  });

  // why: adding class-name support must be additive — the pre-existing plain-object form of
  // contentContainerStyle (the majority of current call sites) must keep working unchanged.
  it('still accepts a plain style object unchanged', () => {
    mount(
      ROOT_TAG,
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <View />
      </ScrollView>,
    );

    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content!.props.padding).toBe(12);
  });
});
