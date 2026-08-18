// Class-name resolution through the ADAPTER'S components, not through a raw host intrinsic.
//
// Why this file exists: every canary styles its layout with a CSS class, so if `class` fails to
// resolve through `View`, the root box loses both its `flex: 1` and its background and the app
// paints a blank white screen — with nothing thrown, nothing logged, and every other test green.
// That is exactly what happened when examples/solid moved off raw `symbiote-*` intrinsics onto
// these components: `Image` had a class test, `View`/`Text`/`Pressable` did not, so the whole
// layer went unpinned. The resolution itself is the engine's (routeProp's centralized class+style
// merge); what is asserted here is only that each component actually HANDS it the class.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { Pressable } from './pressable';
import { Text } from './text';
import { View } from './view';

const ROOT_TAG = 977;
const SCREEN_FLEX = 1;
const SCREEN_OPACITY = 0.5;
const LABEL_FONT_SIZE = 15;

// Deliberately NOT asserting on a color: a string color only survives to Fabric once a color
// processor is registered (the engine drops unprocessable colors — fabric-props.ts), and that is
// an app-entry seam no unit mount installs. Colors would make this file test color processing
// instead of what it is for: whether the component hands `class` to routeProp at all.

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
  registerStyles({
    screen: { flex: SCREEN_FLEX, opacity: SCREEN_OPACITY },
    label: { fontSize: LABEL_FONT_SIZE },
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// Found by testID, NOT by viewName. The committed tree carries container nodes of the same
// viewName, so `first RCTView` is not the node under test — matching on viewName made an assertion
// pass against a wrapper that happens to carry `flex`, i.e. a false green. Reads `fabric.committed`
// because a clone-on-write supersedes the created node's frozen props.
function committed(testID: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && node.props.testID === testID) found = node;
  });
  return found;
}

const PROBE = 'class-probe';

describe('class resolution through the adapter components', () => {
  // why: this is the exact shape of every canary's root box. A `class` that does not resolve
  // leaves the root with no flex and no background — a blank screen, silently.
  it('resolves a registered class on View into real style props', async () => {
    mount(ROOT_TAG, () => <View class="screen" testID={PROBE} />);
    await tick();

    const view = committed(PROBE);
    expect(view?.props.flex).toBe(SCREEN_FLEX);
    expect(view?.props.opacity).toBe(SCREEN_OPACITY);
    // The class name itself is a JS-side lookup key; it must never reach Fabric.
    expect('class' in (view?.props ?? {})).toBe(false);
  });

  it('resolves a registered class on Text', async () => {
    mount(ROOT_TAG, () => (
      <Text class="label" testID={PROBE}>
        hi
      </Text>
    ));
    await tick();

    const text = committed(PROBE);
    expect(text?.props.fontSize).toBe(LABEL_FONT_SIZE);
    expect('class' in (text?.props ?? {})).toBe(false);
  });

  it('resolves a registered class on Pressable', async () => {
    mount(ROOT_TAG, () => <Pressable class="screen" testID={PROBE} />);
    await tick();

    const view = committed(PROBE);
    expect(view?.props.flex).toBe(SCREEN_FLEX);
    expect(view?.props.opacity).toBe(SCREEN_OPACITY);
  });

  // why: `class` and `style` together must BOTH reach the node — the component forwarding only one
  // of them is the realistic regression. Which one wins on a conflicting key is routeProp's merge
  // order, deliberately not asserted here: that is engine behaviour with its own tests, and pinning
  // it from an adapter file would duplicate the contract in a place that cannot fix it.
  it('forwards class and an explicit style together on View', async () => {
    mount(ROOT_TAG, () => (
      <View class="screen" style={{ margin: 7 }} testID={PROBE} />
    ));
    await tick();

    const view = committed(PROBE);
    expect(view?.props.flex, 'the class half').toBe(SCREEN_FLEX);
    expect(view?.props.margin, 'the explicit-style half').toBe(7);
  });
});
