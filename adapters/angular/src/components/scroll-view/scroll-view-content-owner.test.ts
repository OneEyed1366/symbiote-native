// EXACTLY ONE thing may build a ScrollView's content node, and from 2026-09-11 that thing is the
// engine: `registerScrollViewBehavior()` (`../../register.ts`) puts a `buildStructure` on the
// scroll tags. The Angular wrapper that used to build the content node itself (its own projection
// bridge in `scroll-view/shared.ts` + `.ios.ts`/`.android.ts`) is deleted along with `RefreshControl`
// and `ScrollView` as components — see `../scroll-view-props.ts` and
// `../refresh-control-props.ts`. This is Angular's twin of
// `adapters/svelte/src/components/scroll-view/scroll-view-content-owner.test.ts` and
// `adapters/react/src/components/scroll-view/scroll-view-content-owner.test.tsx`.
//
// THE CONTROL ARM is what makes the count mean anything: a mount producing NOTHING would also
// satisfy `toBe(1)` on a count taken from an empty tree, so every case pins the owner count AND
// that the app's own child is a DESCENDANT of the one content node
// (`.claude/rules/adapter-parity-audit.md`, "Phrase a parity oracle as a CAPABILITY").

// A RECORDING host, and the tree walked here is the AUTHORED one. The question is WHO EMITTED the
// content node; `RCTScrollContentView` is a name the engine sends, and React Native's own
// `componentNameByReactViewName` maps `ScrollContentView` to plain `View`, so the committed tree
// cannot tell a content node from any other view by name at all.
import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STICKY_HEADER_TAG } from '@symbiote-native/components';
import { childrenOf } from '@symbiote-native/engine';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

// registerScrollViewBehavior() is the whole subject of this file.
import '../../register';
import { mount, unmount } from '../../render';
import { SymbioteHostPropsDirective } from '../../primitives';

const ROOT_TAG = 91_032;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function byViewName(name: string): IAuthoredNode[] {
  return fabric.findAll(node => node.viewName === name);
}

// iOS resolves BOTH axes to RCTScrollView / RCTScrollContentView (the horizontal split is an
// Android ViewManager), matching the headless name table VirtualizedList's own tests already use.
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';

// Descends FROM the content node, which is the same claim stated forwards: the engine's structure
// builder put the app's children INSIDE what it created.
function countUnder(
  handle: object,
  match: (node: IAuthoredNode) => boolean,
): number {
  let found = 0;
  for (const child of childrenOf(handle)) {
    const recorded = fabric.find(node => node.handle === child);
    if (recorded !== undefined && match(recorded)) found += 1;
    found += countUnder(child, match);
  }
  return found;
}

function assertSingleContentNode(probeText: string): void {
  const owners = byViewName(SCROLL_VIEW);
  const contents = byViewName(CONTENT_VIEW);
  expect(owners.length, 'exactly one scroll view created').toBe(1);
  expect(contents.length, 'exactly one content view created').toBe(1);
  const probes = countUnder(
    contents[0].handle,
    node => node.props.text === probeText,
  );
  expect(probes, `"${probeText}" sits under the content view`).toBe(1);
}

@Component({
  selector: 'scroll-view-owner-vertical',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<scroll-view><text>sv-v</text></scroll-view>`,
})
class VerticalFixture {}

@Component({
  selector: 'scroll-view-owner-horizontal',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<horizontal-scroll-view
    ><text>sv-h</text></horizontal-scroll-view
  >`,
})
class HorizontalFixture {}

// A refresh-control is CLAIMED by the owner and kept beside the content view — the one child that
// must not add a box of its own to the count.
@Component({
  selector: 'scroll-view-owner-refresh',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SymbioteHostPropsDirective],
  template: `
    <scroll-view>
      <refresh-control
        [symbioteHostProps]="{ refreshing: false }"
      ></refresh-control>
      <text>sv-r</text>
    </scroll-view>
  `,
})
class RefreshFixture {}

// The behavior synthesizes a pin wrapper around a flagged paint child; a synthesized wrapper is a
// node this template did not write, so the count has to survive it.
@Component({
  selector: 'scroll-view-owner-sticky',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SymbioteHostPropsDirective],
  template: `
    <scroll-view [symbioteHostProps]="{ stickyHeaderIndices: [0] }">
      <text>sv-s</text>
      <text>sv-s2</text>
    </scroll-view>
  `,
})
class StickyFixture {}

describe('the engine is the only builder of a ScrollView content node', () => {
  it('scroll-view, vertical', async () => {
    mount(ROOT_TAG, VerticalFixture);
    await tick();
    assertSingleContentNode('sv-v');
  });

  it('horizontal-scroll-view', async () => {
    mount(ROOT_TAG, HorizontalFixture);
    await tick();
    assertSingleContentNode('sv-h');
  });

  it('scroll-view with a refresh-control beside the content view', async () => {
    mount(ROOT_TAG, RefreshFixture);
    await tick();
    assertSingleContentNode('sv-r');
    expect(byViewName('PullToRefreshView').length).toBe(1);
  });

  it('scroll-view, a stickyHeaderIndices child adds no second content node', async () => {
    mount(ROOT_TAG, StickyFixture);
    await tick();
    assertSingleContentNode('sv-s');
    // By the TAG the engine was told, not by a key its tag rule writes: the pin lives in
    // `SymbioteFabricProps.cpp` now, and this harness builds payloads through the TypeScript
    // `fabricProps`, which carries no copy of it.
    const pinned = fabric.findAll(node => node.tagName === STICKY_HEADER_TAG);
    expect(pinned.length).toBe(1);
  });
});
