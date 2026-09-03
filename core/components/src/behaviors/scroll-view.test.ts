// The ScrollView structure behavior — the first consumer of `buildStructure` / `childHost`.
//
// WHAT THIS PROVES: the engine builds the same two-node shape every adapter's ScrollView wrapper
// builds today, from the tag alone, with no component instance anywhere. WHAT IT DELIBERATELY
// PINS AS ABSENT: `contentContainerStyle`, which is an owner prop that belongs on the slot and
// has no seam yet. That last test is written to go RED the day the seam lands — a gap recorded as
// an assertion instead of as a sentence nobody re-reads.
//
// Registration happens HERE and nowhere else. `symbiote-scroll-view` is the tag the wrappers
// already emit, so a global registration would give every existing ScrollView a second content
// node; see the behavior's header for the `-managed` split that resolves it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
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

    const owner = scrollNode(HORIZONTAL_SCROLL_VIEW_TAG);
    expect(owner.childHost?.props).toEqual({ flexDirection: 'row' });
  });

  it('leaves the vertical content node unstyled, as the wrapper does', () => {
    const owner = scrollNode(SCROLL_VIEW_TAG);
    expect(owner.childHost?.props).toEqual({});
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

describe('the seam this pilot proves is still missing', () => {
  // NOT a wish-list comment: an assertion that FAILS the day owner-prop -> slot-prop routing
  // lands, so the person who builds it is told to come back here. `contentContainerStyle` is
  // written by the app on the OWNER and belongs on the content node; `foldPayload` maps the
  // owner's own payload and cannot reach a child, and `buildStructure` runs before any prop is
  // routed. Until that exists a ScrollView is not lowerable, and this is where that is recorded.
  it('does not route contentContainerStyle onto the slot', () => {
    const owner = scrollNode(SCROLL_VIEW_TAG);
    owner.props = { contentContainerStyle: { padding: 12 } };

    expect(owner.childHost?.props).toEqual({});
  });
});
