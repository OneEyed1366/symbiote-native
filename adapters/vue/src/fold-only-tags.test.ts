// The four primitives that became TAGS on 2026-09-10 — `safe-area-view`, `input-accessory-view`,
// `refresh-control`, `image`. With no component spelling left there is nothing to compare against,
// so this asks the absolute question a comparison could not: does the tag alone commit the fold?
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
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_976;
const fabric = installRecordingFabric();
// A fold runs on the way into what Fabric is handed, so every read here is `.payload`.
const live = createLiveTree(fabric);

// Vue batches its commits on a microtask, so the tree is not there on the next line.
const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function byTestId(id: string): ILiveNode {
  const hit = live.findLive(live.appRoot(), node => node.payload.testID === id);
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
    expect(node.payload.nativeID).toBe('pane');
    expect(Object.hasOwn(node.payload, 'id')).toBe(false);
    // The aria ALIAS, read under its authored name. The wrapper used to fold it with
    // `resolveAccessibilityProps`; the fold is the engine's rule now (`foldAriaProps`,
    // `SymbioteFabricProps.cpp`) and this harness holds no copy of it, so what a fold-only tag owes
    // is that the hyphenated key survives the wrapper's removal at all. Note this is the OPPOSITE
    // shape from the `id` line above — that alias is resolved by `routeProp`, in JS, on the way in.
    expect(node.payload['aria-label']).toBe('the pane');
  });

  it('input-accessory-view keeps its nativeID and background', async () => {
    await mountTag('input-accessory-view', {
      testID: 'acc',
      nativeID: 'bar',
      backgroundColor: '#123456',
    });

    const node = byTestId('acc');
    expect(node.payload.nativeID).toBe('bar');
    expect(node.payload.backgroundColor).toBe('#123456');
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
    expect(node.payload.nativeID).toBe('puller');
    expect(node.payload.refreshing).toBe(false);
    // The wrapper turned a host `onRefresh` into a typed `refresh` emit. On the tag the prop IS the
    // listener, so what has to be true is that the engine routed it as an EVENT rather than
    // dropping it as a function prop — `fabricProps` drops every function it is handed.
    expect(Object.hasOwn(node.payload, 'onRefresh')).toBe(false);
  });

  // THE FOLD HALF MOVED: `core/engine/cpp/tests/js/image-payload.itest.ts`. `src` becoming the
  // native source array and `width`/`height` becoming style is `foldImageProps` in
  // `SymbioteFabricProps.cpp` now, and this harness commits through the TypeScript `fabricProps`,
  // which holds no copy of that rule.
  //
  // What stays is what this FILE is about — that a bare Vue tag reaches the right native view and
  // carries its props to the commit. The `image` arm is kept rather than deleted because the set of
  // tags is the subject; losing one would quietly narrow it.
  it('image reaches the native image view and carries its props', async () => {
    await mountTag('image', {
      testID: 'img',
      src: 'https://example.test/a.png',
      width: 12,
      height: 34,
    });

    const node = byTestId('img');
    expect(node.viewName).toBe('RCTImageView');
    expect(node.payload.src).toBe('https://example.test/a.png');
  });
});
