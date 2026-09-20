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
import { createSignal, For } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: registerScrollViewBehavior builds the content node these tags commit under.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 933;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function committed(viewName: string): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.viewName === viewName,
  );
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
    expect(scroll.payload.testID).toBe('probe');
    expect(scroll.children).toHaveLength(1);
    const content = scroll.children[0];
    expect(content?.viewName).toBe(CONTENT_VIEW);
    // `collapsable: false` is `foldScrollContentProps` in the engine since 2026-09-18, and this host
    // builds payloads through the TypeScript `fabricProps`, which carries no copy of the tag rules —
    // pinned in `core/engine/cpp/tests/js/scroll-content-payload.itest.ts`. What Solid owns is the
    // SHAPE either side of it: a content node here, and the app's child under it.
    expect(content?.children[0]?.payload.testID).toBe('child');
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
    expect(scroll.payload.backgroundColor).toBe('blue');
    expect(scroll.payload.padding).toBeUndefined();
    const content = scroll.children[0];
    expect(content?.payload.padding).toBe(8);
    expect(content?.payload.backgroundColor).toBeUndefined();
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
    expect(content?.payload.padding).toBe(12);
  });

  it('picks the row axis and the separate Android ViewManager tag for horizontal-scroll-view', async () => {
    mount(ROOT_TAG, () => (
      <horizontal-scroll-view>
        <view />
      </horizontal-scroll-view>
    ));
    await tick();

    const scroll = committed(SCROLL_VIEW);
    // Both the axis flag and the content node's row style are engine rules now
    // (`scroll-view-payload.itest.ts`, `scroll-content-payload.itest.ts`), and under this host the
    // iOS name table maps BOTH axes onto `RCTScrollView` / `RCTScrollContentView` — so no observable
    // here distinguishes the axis, and the Android ViewManager half of this case's name was never
    // reachable from a vitest run either. What survives is that the tag reached its behavior at all:
    // an unregistered or misspelled tag builds no content node under the scroller.
    expect(scroll.children[0]).toBeDefined();
  });

  // `onRefresh` is an OWNED listener (RefreshControl's own machine holds the slot), stashed rather
  // than left as a readable `.payload.onRefresh` — fire the native event the way Fabric would, same
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

    const contentViews = live.findAllLive(
      live.appRoot(),
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

  // Reported as an on-device RAM leak + a "Clear" step that never finishes on the benchmark
  // screen: a <For> whose items live directly under a <scroll-view> (a composed primitive whose
  // real children mount on `node.childHost`, the content view) has a FOLLOWING SIBLING, which is
  // what makes solid-js/universal's array reconciler emit a `marker` and take `cleanChildren`'s
  // multi-child branch. That branch decides whether an old item still lives under `parent` via
  // `getParentNode(el) === parent` — and `getParentNode` used to return `el.parent` verbatim,
  // which for a childHost'd child is the CONTENT node, never the `<scroll-view>` owner Solid holds
  // as `parent`. The comparison was false for every row, so `removeNode` never fired on a full
  // clear: the old rows stayed committed to Fabric forever, orphaned but still retained — reproduced
  // headlessly as the committed node count growing by one row-set per cycle instead of returning to
  // baseline. `getFirstChild` already carried the matching `childHost` redirect; `getParentNode` had
  // to walk it the other way — see its own comment in `./renderer.ts`.
  it('clearing a <For> under a <scroll-view> actually removes its rows, not just orphans them', async () => {
    const [rows, setRows] = createSignal([1, 2, 3]);

    mount(ROOT_TAG, () => (
      <scroll-view testID="outer">
        <For each={rows()}>{row => <view testID={`row-${row}`} />}</For>
        {/* The trailing sibling is load-bearing: without it solid-js/universal has no `marker` and
          takes cleanChildren's OTHER branch, which does not consult getParentNode at all. */}
        <view testID="after" />
      </scroll-view>
    ));
    await tick();
    expect(committed(CONTENT_VIEW).children).toHaveLength(4); // 3 rows + "after"

    setRows([]);
    await tick();
    expect(committed(CONTENT_VIEW).children).toHaveLength(1); // "after" only
  });
});

// RN parity: a ScrollView ref exposes scrollTo/scrollToEnd/flashScrollIndicators
// (`.claude/rules/adapter-parity-audit.md`'s "imperative scroll handle" surface item). The
// commands themselves are engine-level (`core/components/src/scroll-view-commands.ts`, already
// tested there) — what's unproven for Solid specifically is that a `ref`-held `<scroll-view>`
// hands back a node carrying them. Solid's own `components/view.test.tsx` only proves `measure`
// (the generic host surface), not the ScrollView-specific commands.
//
// No Negative group: scrollTo/flashScrollIndicators take no input this adapter can reject.
describe('Solid <scroll-view> imperative handle', () => {
  async function mountScrollRef(): Promise<{
    scrollTo: (options?: {
      x?: number;
      y?: number;
      animated?: boolean;
    }) => void;
    flashScrollIndicators: () => void;
  }> {
    const [node, setNode] = createSignal<
      | {
          scrollTo: (options?: unknown) => void;
          flashScrollIndicators: () => void;
        }
      | undefined
    >();
    mount(ROOT_TAG, () => <scroll-view ref={setNode} />);
    await tick();
    const handle = node();
    if (handle === undefined)
      throw new Error('ref never resolved to a host instance');
    return handle;
  }

  it('dispatches scrollTo through the ref-held host instance', async () => {
    const handle = await mountScrollRef();
    handle.scrollTo({ x: 0, y: 42, animated: false });

    expect(fabric.commands).toHaveLength(1);
    expect(fabric.commands[0]?.commandName).toBe('scrollTo');
    expect(fabric.commands[0]?.args).toEqual([0, 42, false]);
    expect(fabric.commands[0]?.node.viewName).toBe(SCROLL_VIEW);
  });

  it('dispatches flashScrollIndicators through the same handle', async () => {
    const handle = await mountScrollRef();
    handle.flashScrollIndicators();

    expect(fabric.commands).toHaveLength(1);
    expect(fabric.commands[0]?.commandName).toBe('flashScrollIndicators');
    expect(fabric.commands[0]?.args).toEqual([]);
  });
});
