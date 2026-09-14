// The ANDROID claim mode, where the RefreshControl is not a child but the scroll view's PARENT.
//
// An Android ScrollView holds exactly one child, so a sibling refresh control is an `addViewAt`
// crash — the inversion is a native ViewGroup constraint, not a JSX one, and a host model does not
// dissolve it. What the engine adds is `ISymbioteNode.wrapper`: the adapter goes on naming the
// scroll view for every insert, prop write and command, and only the two structural entry points
// know the wrapper is what the tree holds.
//
// HEADLESS NOTE: the intrinsic->native-name table resolves to the iOS build under vitest, so the
// refresh node serializes as `PullToRefreshView` rather than `AndroidSwipeRefreshLayout`. Every
// assertion below keys off node ROLE (who is whose parent, which style landed where), never the
// native name, so the substitution does not weaken them — the same limitation React's own
// `scroll-view-android-refresh.test.tsx` records.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installFabric,
  type IFakeNode,
} from '../../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { registerScrollViewBehavior } from './index.android';
import { REFRESH_CONTROL, SCROLL_VIEW_TAG } from './shared';

const fabric = installFabric();
let nextRootTag = 9900;
const SCROLL = descriptorFor(SCROLL_VIEW_TAG).component;
const CONTENT = descriptorFor('scroll-content').component;

beforeEach(() => {
  registerScrollViewBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  fabric.reset();
});

function mount(props: Readonly<Record<string, unknown>> = {}): {
  node: ISymbioteNode;
  root: ISymbioteNode;
  refresh: ISymbioteNode;
  commit: () => IFakeNode;
} {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const node = createElement(SCROLL, false, SCROLL_VIEW_TAG);
  for (const key of Object.keys(props)) routeProp(node, key, props[key]);
  const refresh = createElement(REFRESH_CONTROL, false, 'refresh-control');
  return {
    node,
    root,
    refresh,
    commit: () => {
      surface.commit();
      const latest = fabric.committed[fabric.committed.length - 1];
      const app = latest?.children[0]?.children[0];
      if (app === undefined)
        throw new Error('nothing committed under the root');
      return app;
    },
  };
}

describe('the RefreshControl becomes the scroll view s parent', () => {
  it('commits refresh > scroll > content, whichever order the adapter mounts in', () => {
    const { node, root, refresh, commit } = mount();
    // Children BEFORE the owner is attached — the order every adapter uses, and the one that makes
    // the owner unattached at claim time.
    appendChild(node, refresh);
    appendChild(node, createElement('RCTImageView'));
    appendChild(root, node);

    expect(fabric.serialize([commit()])).toBe(
      `${REFRESH_CONTROL}(${SCROLL}(${CONTENT}(RCTImageView)))`,
    );
  });

  it('swaps in place when the claim arrives after the owner is already mounted', () => {
    const { node, root, refresh, commit } = mount();
    appendChild(node, createElement('RCTImageView'));
    appendChild(root, node);
    expect(fabric.serialize([commit()])).toBe(
      `${SCROLL}(${CONTENT}(RCTImageView))`,
    );

    appendChild(node, refresh);
    expect(fabric.serialize([commit()])).toBe(
      `${REFRESH_CONTROL}(${SCROLL}(${CONTENT}(RCTImageView)))`,
    );
  });

  // The adapter keeps naming the SCROLL VIEW — it is the node it holds a ref to and the target of
  // every scroll command. Nothing above `appendChild` learns a wrapper exists.
  it('goes on taking app children on the owner the adapter named', () => {
    const { node, root, refresh, commit } = mount();
    appendChild(node, refresh);
    appendChild(root, node);
    appendChild(node, createElement('RCTImageView'));

    expect(fabric.serialize([commit()])).toBe(
      `${REFRESH_CONTROL}(${SCROLL}(${CONTENT}(RCTImageView)))`,
    );
  });

  it('puts the owner back when the RefreshControl is removed', () => {
    const { node, root, refresh, commit } = mount();
    appendChild(node, refresh);
    appendChild(node, createElement('RCTImageView'));
    appendChild(root, node);
    commit();

    removeChild(node, refresh);
    expect(fabric.serialize([commit()])).toBe(
      `${SCROLL}(${CONTENT}(RCTImageView))`,
    );
  });
});

describe('the style splits across the two boxes', () => {
  function boxes(props: Readonly<Record<string, unknown>>): {
    wrapper: IFakeNode;
    scroll: IFakeNode;
  } {
    const { node, root, refresh, commit } = mount(props);
    appendChild(node, refresh);
    appendChild(node, createElement('RCTImageView'));
    appendChild(root, node);
    const wrapper = commit();
    const scroll = wrapper.children[0];
    if (scroll === undefined)
      throw new Error('the scroll view never committed');
    return { wrapper, scroll };
  }

  it('sends layout to the wrapper and visual to the scroller, base under both', () => {
    const { wrapper, scroll } = boxes({
      style: { height: 200, margin: 4, backgroundColor: '#123', padding: 8 },
    });

    expect(wrapper.props.height).toBe(200);
    expect(wrapper.props.margin).toBe(4);
    expect('backgroundColor' in wrapper.props).toBe(false);

    expect(scroll.props.backgroundColor).toBe('#123');
    expect(scroll.props.padding).toBe(8);
    expect('height' in scroll.props).toBe(false);

    // RN composes the axis base onto BOTH (`ScrollView.js:1856`), so the wrapper grows too.
    expect(wrapper.props.flexGrow).toBe(1);
    expect(scroll.props.flexGrow).toBe(1);
    expect(scroll.props.overflow).toBe('scroll');
  });

  // The inner view has to consume the gesture before the refresh parent sees it, or a scroll
  // becomes a pull-to-refresh.
  it('wires nestedScrollEnabled on the inner scroll view', () => {
    const { scroll } = boxes({});
    expect(scroll.props.nestedScrollEnabled).toBe(true);
  });

  // The wrap swaps the owner's fold, so anything the ordinary fold does had to be restated in the
  // wrapped copy — and `decelerationRate` was not. It reached Fabric as the string 'fast' on every
  // Android ScrollView carrying a RefreshControl, which the native side cannot read.
  it('still resolves decelerationRate while wrapped', () => {
    const { scroll } = boxes({ decelerationRate: 'fast' });
    expect(typeof scroll.props.decelerationRate).toBe('number');
  });

  // `markPropsDirty` bubbles UP, so a style written on the owner reaches every ancestor and never
  // the wrapper. `slotDerived` naming `style` is what makes the wrapper rebuild.
  it('re-splits when the owner style changes after the first commit', () => {
    const { node, root, refresh, commit } = mount({ style: { height: 200 } });
    appendChild(node, refresh);
    appendChild(node, createElement('RCTImageView'));
    appendChild(root, node);
    expect(commit().props.height).toBe(200);

    routeProp(node, 'style', { height: 320 });
    expect(commit().props.height).toBe(320);
  });

  // The plain fold does more than compose the base — dropping it on unwrap would silently take
  // `decelerationRate` resolution with it.
  it('restores the ordinary owner fold when the wrap goes away', () => {
    const { node, root, refresh, commit } = mount({
      style: { height: 200 },
      decelerationRate: 'fast',
    });
    appendChild(node, refresh);
    appendChild(node, createElement('RCTImageView'));
    appendChild(root, node);
    commit();

    removeChild(node, refresh);
    const scroll = commit();
    expect(scroll.props.height).toBe(200);
    expect(typeof scroll.props.decelerationRate).toBe('number');
  });
});
