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
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
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

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
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
  commit: () => ILiveNode;
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
    // `root`'s own handle, not a search — the file already holds it. Its first (only) live child is
    // whichever node the wrap left standing there: the scroll view alone, or the refresh wrapper
    // once a RefreshControl has been claimed.
    commit: (): ILiveNode => {
      surface.commit();
      const app = live.nodeOf(root).children[0];
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

    expect(live.serialize(commit().handle)).toBe(
      `${REFRESH_CONTROL}(${SCROLL}(${CONTENT}(RCTImageView)))`,
    );
  });

  it('swaps in place when the claim arrives after the owner is already mounted', () => {
    const { node, root, refresh, commit } = mount();
    appendChild(node, createElement('RCTImageView'));
    appendChild(root, node);
    expect(live.serialize(commit().handle)).toBe(
      `${SCROLL}(${CONTENT}(RCTImageView))`,
    );

    appendChild(node, refresh);
    expect(live.serialize(commit().handle)).toBe(
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

    expect(live.serialize(commit().handle)).toBe(
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
    expect(live.serialize(commit().handle)).toBe(
      `${SCROLL}(${CONTENT}(RCTImageView))`,
    );
  });
});

// THE WHOLE STYLE-SPLIT DESCRIBE LEFT THIS FILE ON 2026-09-18, three cases, as a GROUP — and the
// group is the point rather than the count. The split is `splitScrollViewStyle` /
// `foldRefreshWrapperProps` in `SymbioteFabricProps.cpp` now, and this host builds its payloads
// through the TypeScript `fabricProps`, which deliberately carries no copy of the tag rules. Two of
// the three went red on the move, which is honest. The third — "stops splitting the style when the
// wrap goes away" — went on PASSING, and for the wrong reason: with no rule in this host there is no
// split to stop, so an unwrapped owner carries its whole style whatever the engine does. A case whose
// subject is a fold cannot stay behind beside the twins that failed; it would be green forever and
// mean nothing. Same shape ActivityIndicator's "OMITS colour entirely" case had.
//
// Their new home is `core/engine/cpp/tests/js/scroll-view-wrap-payload.itest.ts`, against the payload
// a commit actually sent, with a `foldsFound === 0` assertion beside them that this host could never
// have made. `nestedScrollEnabled` and `decelerationRate` had already gone the same way, and their
// note is worth keeping: both used to be restated in the WRAPPED copy of the owner's fold, because
// the wrap swapped that fold out and anything the ordinary one did had to be repeated —
// `decelerationRate` once was NOT repeated, and reached Fabric as the string 'fast' on every Android
// ScrollView carrying a RefreshControl. A rule that runs off the TAG cannot be swapped out, so that
// class of bug is unrepresentable now.
//
// What stays HERE is what this host is authoritative for and the itest is not: the TOPOLOGY. Who
// ends up whose parent, that the owner keeps its identity across a wrap, that removing the
// RefreshControl puts it back. That is `ISymbioteNode.wrapper`'s contract and it is JS's.
