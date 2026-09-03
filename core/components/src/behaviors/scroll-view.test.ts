// The ScrollView structure behavior — the first consumer of `buildStructure` / `childHost`.
//
// WHAT THIS PROVES: the engine builds the same two-node shape every adapter's ScrollView wrapper
// builds today, from the tag alone, with no component instance anywhere — AND composes the same
// two style arrays onto it. The style half is the part that fails silently: both nodes get a
// style either way, and only the PRECEDENCE says whether the app's value or the axis constant
// won. The two orders are opposite on purpose (base under on the owner, row over on the slot), so
// a test that checked only one would pass with both folds written the same way.
//
// Registration happens HERE and nowhere else. `symbiote-scroll-view` is the tag the wrappers
// already emit, so a global registration would give every existing ScrollView a second content
// node; see the behavior's header for the `-managed` split that resolves it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import { selectScrollIntrinsics } from '../view/render-scroll-view';
import {
  HORIZONTAL_SCROLL_VIEW_TAG,
  registerScrollViewBehavior,
  SCROLL_VIEW_TAG,
} from './scroll-view';

const fabric = installFabric();
let nextRootTag = 9700;

function scrollNode(tag: string): ISymbioteNode {
  return createElement(descriptorFor(tag).component, false, tag);
}

beforeEach(() => {
  registerScrollViewBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  fabric.reset();
});

describe('the lowered structure reproduces the wrapper', () => {
  // Derived from `selectScrollIntrinsics`, never hardcoded: it is the ONE function every adapter's
  // wrapper calls, so deriving is what makes this a comparison rather than a restatement. It also
  // keeps the test honest across platforms — the vertical content intrinsic resolves to
  // RCTScrollContentView on iOS and to a plain RCTView on Android.
  it.each([
    { name: 'vertical', tag: SCROLL_VIEW_TAG, horizontal: false },
    { name: 'horizontal', tag: HORIZONTAL_SCROLL_VIEW_TAG, horizontal: true },
  ])(
    '$name: builds the content node the wrapper would',
    ({ tag, horizontal }) => {
      const { scrollViewIntrinsic, contentIntrinsic } = selectScrollIntrinsics(
        horizontal,
        undefined,
      );
      expect(tag).toBe(scrollViewIntrinsic);

      const owner = scrollNode(tag);

      expect(owner.children).toHaveLength(1);
      expect(owner.childHost).toBe(owner.children[0]);
      expect(owner.childHost?.component).toBe(
        descriptorFor(contentIntrinsic).component,
      );
    },
  );

  it('gives the horizontal content node the row direction the wrapper does', () => {
    const { contentStyle } = selectScrollIntrinsics(true, undefined);
    // The wrapper's contentStyle for horizontal is `[contentContainerStyle, {flexDirection:'row'}]`;
    // with no contentContainerStyle the only live half is the row direction, which is a constant of
    // the TAG and so is the only half a structure-time build can supply.
    expect(contentStyle).toEqual([undefined, { flexDirection: 'row' }]);

    // Structure time carries only what the wrapper sets unconditionally; the row direction is a
    // FOLD, so it shows up in the committed payload rather than in `props` (see the payload group).
    const owner = scrollNode(HORIZONTAL_SCROLL_VIEW_TAG);
    expect(owner.childHost?.props).toEqual({ collapsable: false });
  });

  it('sets collapsable:false on the content node, both axes, as the wrapper does', () => {
    // Yoga may collapse a view that only groups children, and a collapsed content node takes the
    // scroll metrics with it. React's `contentProps` sets it unconditionally; so does this.
    expect(scrollNode(SCROLL_VIEW_TAG).childHost?.props).toEqual({
      collapsable: false,
    });
    expect(scrollNode(HORIZONTAL_SCROLL_VIEW_TAG).childHost?.props).toEqual({
      collapsable: false,
    });
  });
});

describe('app children reach Fabric under the content node', () => {
  it('commits RCTScrollView > content > children', () => {
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    surface.appendChild(root);

    const owner = scrollNode(SCROLL_VIEW_TAG);
    const child = createElement('RCTImageView');
    // The adapter appends to the OWNER and never learns a slot exists — the whole point of the
    // redirect. Nothing in this test names `childHost` on the write path.
    appendChild(owner, child);
    appendChild(root, owner);
    surface.commit();

    const committed = fabric.find(node => node.viewName === 'RCTScrollView');
    const contentName = descriptorFor('symbiote-scroll-content').component;
    expect(fabric.serialize([committed as never])).toBe(
      `RCTScrollView(${contentName}(RCTImageView))`,
    );
  });
});

describe('owner props that belong to the slot', () => {
  it('routes contentContainerStyle onto the content node, not the owner', () => {
    const owner = scrollNode(SCROLL_VIEW_TAG);
    // Written on the OWNER, which is where the app writes it and therefore where every adapter
    // writes it. Nothing on this line knows a slot exists.
    routeProp(owner, 'contentContainerStyle', { padding: 12 });

    expect(owner.props.contentContainerStyle).toBeUndefined();
    expect(owner.props.style).toBeUndefined();
    expect(owner.childHost?.props.style).toEqual([undefined, { padding: 12 }]);
  });

  it('leaves the owner its own style', () => {
    const owner = scrollNode(SCROLL_VIEW_TAG);
    routeProp(owner, 'style', { backgroundColor: 'red' });

    expect(owner.props.style).toEqual([undefined, { backgroundColor: 'red' }]);
    expect(owner.childHost?.props.style).toBeUndefined();
  });
});

describe('style precedence, which is opposite on the two nodes', () => {
  function commitScroll(
    tag: string,
    props: Readonly<Record<string, unknown>>,
  ): { owner: IFakeNode; slot: IFakeNode } {
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    surface.appendChild(root);
    const node = scrollNode(tag);
    for (const key of Object.keys(props)) routeProp(node, key, props[key]);
    appendChild(root, node);
    surface.commit();

    const owner = fabric.find(n => n.viewName === descriptorFor(tag).component);
    if (owner === undefined) throw new Error('scroll node never committed');
    const slot = owner.children[0];
    if (slot === undefined) throw new Error('content node never committed');
    return { owner, slot };
  }

  it('horizontal: the base wins on the slot and loses on the owner', () => {
    const { owner, slot } = commitScroll(HORIZONTAL_SCROLL_VIEW_TAG, {
      // Collides with SCROLL_VIEW_BASE_HORIZONTAL's flexGrow: 1 — the app must win.
      style: { flexGrow: 9, backgroundColor: 'red' },
      // Collides with the fold's flexDirection: 'row' — the CONSTANT must win, because the
      // wrapper writes `[contentContainerStyle, {flexDirection:'row'}]`.
      contentContainerStyle: { padding: 12, flexDirection: 'column' },
    });

    expect(owner.props.flexGrow).toBe(9);
    expect(owner.props.backgroundColor).toBe('red');
    // Untouched halves of the base still land.
    expect(owner.props.flexDirection).toBe('row');
    expect(owner.props.overflow).toBe('scroll');

    expect(slot.props.padding).toBe(12);
    expect(slot.props.flexDirection).toBe('row');
    expect(slot.props.collapsable).toBe(false);
  });

  it('vertical: the base composes under the app style and the slot has no constant', () => {
    const { owner, slot } = commitScroll(SCROLL_VIEW_TAG, {
      style: { flexDirection: 'row' },
      contentContainerStyle: { padding: 4 },
    });

    // SCROLL_VIEW_BASE_VERTICAL says 'column'; the app said 'row' and wins.
    expect(owner.props.flexDirection).toBe('row');
    expect(owner.props.flexGrow).toBe(1);

    expect(slot.props.padding).toBe(4);
    // Nothing composes a direction onto a vertical content node — the wrapper's contentStyle for
    // vertical is `contentContainerStyle` alone.
    expect(slot.props.flexDirection).toBeUndefined();
  });
});
