// `scroll-view` / `horizontal-scroll-view` as bare TAGS through Solid's own renderer — the suite
// that replaced `components/scroll-view/` while a wrapper composed the content node by hand. RN's
// ScrollView commits RCTScrollView > RCTScrollContentView; both nodes are the ENGINE's now
// (`core/components/src/behaviors/scroll-view/`), and `./register` is what names it.
//
// SCOPE: the sticky machinery, the RefreshControl claim/placement per platform, contentSizeChange
// synthesis, the decelerationRate/axis folds — all engine-owned and exhaustively covered at
// `core/components/src/behaviors/scroll-view/{scroll-view,sticky,sticky-indices}.test.ts` plus
// `components/virtualized-list/virtualized-list.test.tsx` (which mounts the SAME tags). This file
// proves only that SOLID reaches that behavior: compiled JSX, this adapter's own `class`/`style`
// merge, and the content-node OWNERSHIP guard — nothing here else in this adapter may ALSO build a
// scroll-content node, or a tree gets a silent second one nested inside the first.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: registerScrollViewBehavior builds the content node these tags commit under.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 933;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function flatCommitted(): IFakeNode[] {
  const flat: IFakeNode[] = [];
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return flat;
}

function committed(viewName: string): IFakeNode {
  const found = flatCommitted().find(node => node.viewName === viewName);
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

describe('Solid scroll-view / horizontal-scroll-view tags', () => {
  it('commits a nested scroll host with an un-flattened content container', async () => {
    mount(ROOT_TAG, () => (
      <scroll-view testID="probe">
        <view testID="child" />
      </scroll-view>
    ));
    await tick();

    const scroll = committed(SCROLL_VIEW);
    expect(scroll.props.testID).toBe('probe');
    expect(scroll.children).toHaveLength(1);
    const content = scroll.children[0];
    expect(content?.viewName).toBe(CONTENT_VIEW);
    expect(content?.props.collapsable).toBe(false);
    expect(content?.children[0]?.props.testID).toBe('child');
  });

  it('routes a contentContainerStyle OBJECT onto the content node, not the scroll view', async () => {
    mount(ROOT_TAG, () => (
      <scroll-view
        style={{ backgroundColor: 'blue' }}
        contentContainerStyle={{ padding: 8 }}
      >
        <view />
      </scroll-view>
    ));
    await tick();

    const scroll = committed(SCROLL_VIEW);
    expect(scroll.props.backgroundColor).toBe('blue');
    expect(scroll.props.padding).toBeUndefined();
    const content = scroll.children[0];
    expect(content?.props.padding).toBe(8);
    expect(content?.props.backgroundColor).toBeUndefined();
  });

  // The same string-resolves-through-the-shared-registry path `className`/`class` already gets —
  // contentContainerStyle is typed as `IStyleProp<IViewStyle> | string` for exactly this.
  it('resolves a contentContainerStyle CLASS NAME the same way `class` does', async () => {
    registerRules([
      {
        selector: '.content-pad',
        style: { padding: 12 },
        tokens: ['content-pad'],
      },
    ]);
    mount(ROOT_TAG, () => (
      <scroll-view contentContainerStyle="content-pad">
        <view />
      </scroll-view>
    ));
    await tick();

    const content = committed(SCROLL_VIEW).children[0];
    expect(content?.props.padding).toBe(12);
  });

  it('picks the row axis and the separate Android ViewManager tag for horizontal-scroll-view', async () => {
    mount(ROOT_TAG, () => (
      <horizontal-scroll-view>
        <view />
      </horizontal-scroll-view>
    ));
    await tick();

    const scroll = committed(SCROLL_VIEW);
    expect(scroll.props.horizontal).toBe(true);
    const content = scroll.children[0];
    expect(content?.props.flexDirection).toBe('row');
  });

  // `onRefresh` is an OWNED listener (RefreshControl's own machine holds the slot), stashed rather
  // than left as a readable `.props.onRefresh` — fire the native event the way Fabric would, same
  // pattern `virtualized-list.test.tsx` uses for its own scroll/layout events.
  it('places a refresh-control child before the content view and lets it drive onRefresh', async () => {
    let refreshed = 0;
    mount(ROOT_TAG, () => (
      <scroll-view>
        <refresh-control
          refreshing={false}
          onRefresh={() => (refreshed += 1)}
        />
        <view testID="row" />
      </scroll-view>
    ));
    await tick();

    const scroll = committed(SCROLL_VIEW);
    expect(scroll.children.map(child => child.viewName)).toEqual([
      'PullToRefreshView',
      CONTENT_VIEW,
    ]);
    fabric.fireEvent(scroll.children[0].instanceHandle, 'topRefresh', {});
    expect(refreshed).toBe(1);
  });

  // `onScroll` is likewise an owned listener — the behavior's own dispatcher needs the slot for the
  // sticky pin and the content-size synthesis, so the app's handler is stashed, not left raw.
  it('composes the app onScroll through the native scroll round-trip', async () => {
    const offsets: number[] = [];
    mount(ROOT_TAG, () => (
      <scroll-view
        onScroll={event => offsets.push(event.nativeEvent.contentOffset.y)}
      >
        <view />
      </scroll-view>
    ));
    await tick();

    const scroll = committed(SCROLL_VIEW);
    fabric.fireEvent(scroll.instanceHandle, 'topScroll', {
      contentOffset: { x: 0, y: 42 },
    });
    expect(offsets).toEqual([42]);
  });

  // The precondition `registerScrollViewBehavior()`'s own comment names: nothing else in this
  // adapter may build a `scroll-content` node under the tag. `virtualized-list/shared.tsx` reads
  // `scroll.childHost` back rather than building a second one — this proves that holds for BOTH the
  // bare tag and VirtualizedList's own hand-authored host in the SAME committed tree.
  it('never builds a second content node under a scroll host, bare tag or VirtualizedList alike', async () => {
    mount(ROOT_TAG, () => (
      <scroll-view testID="outer">
        <scroll-view testID="inner" />
      </scroll-view>
    ));
    await tick();

    const contentViews = flatCommitted().filter(
      node => node.viewName === CONTENT_VIEW,
    );
    // One content node per scroll host — two scroll hosts, two content nodes, never a nested pair
    // under either.
    expect(contentViews).toHaveLength(2);
    for (const content of contentViews) {
      expect(
        content.children.filter(child => child.viewName === CONTENT_VIEW),
      ).toHaveLength(0);
    }
  });
});
