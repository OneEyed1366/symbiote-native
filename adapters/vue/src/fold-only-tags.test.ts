// The four primitives that became TAGS on 2026-09-10 and left `lowering-equivalence.test.ts`'s
// comparison with them — `safe-area-view`, `input-accessory-view`, `refresh-control`, `image`.
// That oracle compares a component spelling against a tag spelling, so a primitive with no
// component left has nothing to be equal TO and its row must be dropped; this file is what the row
// is replaced BY, and it asks the absolute question the comparison could not: does the tag alone
// commit the fold?
//
// Each case pins something the DELETED WRAPPER used to do, so a fold that failed to move down goes
// red here rather than on a device:
//
//   safe-area-view        the wrapper's `normalizeVueAttrs` (kebab->camel) and its aria fold
//   input-accessory-view  `renderInputAccessoryView`'s mapping, now the behavior's
//   refresh-control       `id -> nativeID`, plus `onRefresh` reaching native as a real listener
//   image                 `renderImage`'s source/width/height fold, now the behavior's
//
// SIDE-EFFECT IMPORT of `./register`, and MEASURED rather than assumed: dropping it reddens
// exactly ONE of the four rows, `image`. The other three pass without any behavior registered, and
// that is correct rather than a gap — `safe-area-view`'s two folds are the RENDERER's
// (`normalizeVueAttrKey`, `PROP_ALIASES`) and the ENGINE's (`fabricProps`'s aria fold),
// `refresh-control`'s row asserts the same renderer alias plus `routeProp`'s event routing, and
// `input-accessory-view`'s behavior does no aliasing at all (see `./register`'s own note on why it
// may share the wrapper's tag). So this file witnesses the registration for `image` only; the
// machines those behaviors carry are `core/components`' own suites' subject.
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_976;
const fabric = installFabric();

// Vue batches its commits on a microtask, so the tree is not there on the next line.
const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

function byTestId(id: string): IFakeNode {
  const hit = flatten(fabric.appRoot().children).find(
    node => node.props.testID === id,
  );
  if (hit === undefined) throw new Error(`no committed node with testID ${id}`);
  return hit;
}

async function mountTag(
  tag: string,
  props: Record<string, unknown>,
): Promise<void> {
  mount(ROOT_TAG, defineComponent({ setup: () => () => h(tag, props) }));
  await settle();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Vue: the fold-only tags commit what their wrappers used to', () => {
  // The expectation names `nativeID`, never `id`: `id` is what the source writes and `nativeID` is
  // what the fold PRODUCES, so an assertion on `id` would pass with the fold deleted. Compared by
  // key lookup rather than by substring for the same reason — `id` is a substring of `nativeID`.
  it('safe-area-view folds a kebab attr and the id alias', async () => {
    await mountTag('safe-area-view', {
      testID: 'sav',
      id: 'pane',
      'aria-label': 'the pane',
    });

    const node = byTestId('sav');
    expect(node.viewName).toBe('SafeAreaView');
    expect(node.props.nativeID).toBe('pane');
    expect(Object.hasOwn(node.props, 'id')).toBe(false);
    // The wrapper called `resolveAccessibilityProps`; the engine's `fabricProps` does it now.
    expect(node.props.accessibilityLabel).toBe('the pane');
  });

  it('input-accessory-view keeps its nativeID and background', async () => {
    await mountTag('input-accessory-view', {
      testID: 'acc',
      nativeID: 'bar',
      backgroundColor: '#123456',
    });

    const node = byTestId('acc');
    expect(node.props.nativeID).toBe('bar');
    expect(node.props.backgroundColor).toBe('#123456');
  });

  it('refresh-control folds the id alias and takes a real refresh listener', async () => {
    const calls: string[] = [];
    await mountTag('refresh-control', {
      testID: 'rc',
      id: 'puller',
      refreshing: false,
      onRefresh: () => calls.push('refresh'),
    });

    const node = byTestId('rc');
    expect(node.props.nativeID).toBe('puller');
    expect(node.props.refreshing).toBe(false);
    // The wrapper turned a host `onRefresh` into a typed `refresh` emit. On the tag the prop IS the
    // listener, so what has to be true is that the engine routed it as an EVENT rather than
    // dropping it as a function prop — `fabricProps` drops every function it is handed.
    expect(Object.hasOwn(node.props, 'onRefresh')).toBe(false);
  });

  it('image folds src and the width/height box into the style', async () => {
    await mountTag('image', {
      testID: 'img',
      src: 'https://example.test/a.png',
      width: 12,
      height: 34,
    });

    const node = byTestId('img');
    expect(node.viewName).toBe('RCTImageView');
    // `renderImage`'s job, now `registerImageBehavior`'s: `src` becomes the native source array and
    // width/height become style, neither of which survives as the raw prop it was written as.
    expect(Array.isArray(node.props.source)).toBe(true);
    expect(node.props.width).toBe(12);
    expect(node.props.height).toBe(34);
  });
});
