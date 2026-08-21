// Sticky headers, driven end to end: `stickyHeaderIndices` wraps the flagged children, the wrapper
// measures itself, the shared scroll AnimatedValue drives its interpolation, and the debounced
// settled value lands in the committed transform.
//
// Two of these have no counterpart in the React/Vue files and are the reason this adapter's sticky
// wiring is not a transliteration of theirs. Solid has no reconciler between what a component
// returns and the host nodes — `insert` REPLACES a subtree rather than diffing one — so a reactive
// value read inside the WRAP (the viewport height, the cross-talk y) would put that signal in the
// insert effect's dependency set, and every header measuring would tear down and rebuild every
// header and its children. Both cross as prop getters instead, and `fabric.counts.createNode` is
// what tells a re-prop from a re-render (.claude/rules/solid-descriptor-bridge.md §4).

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  STICKY_HEADER_Z_INDEX,
  type IStickyHeaderProps,
} from '@symbiote-native/components';
import { mount, unmount } from '../../render';
import type { JSX } from '../../jsx-runtime';
import { View } from '../view';
import { ScrollView } from './index';

const ROOT_TAG = 818;
const SCROLL_VIEW = 'RCTScrollView';
const HEADER = 'sticky-header';
const ROW = 'plain-row';
// The debounce that pushes the settled translateY into the committed transform is 64ms on iOS
// (15ms on Android); this waits past the longer one.
const PAST_STICKY_DEBOUNCE_MS = 120;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, PAST_STICKY_DEBOUNCE_MS));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function committedList(): IFakeNode[] {
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

function committedWrappers(): IFakeNode[] {
  return committedList().filter(
    node => node.props.zIndex === STICKY_HEADER_Z_INDEX,
  );
}

function committedScrollView(): IFakeNode {
  const node = committedList().find(entry => entry.viewName === SCROLL_VIEW);
  if (node === undefined) throw new Error('no RCTScrollView was committed');
  return node;
}

// The wrapper the engine CREATED for the flagged child — events are fired at a created node's
// instanceHandle, while props are read off the live committed tree.
function createdWrapperHandles(): unknown[] {
  return fabric.created
    .filter(node => node.props.zIndex === STICKY_HEADER_Z_INDEX)
    .map(node => node.instanceHandle);
}

function fireLayout(handle: unknown, y: number, height: number): void {
  fabric.fireEvent(handle, 'topLayout', {
    layout: { x: 0, y, width: 320, height },
  });
}

describe('Solid ScrollView sticky headers', () => {
  describe('Positive', () => {
    // why: RN implements stickiness PURELY in JS — the native scroll view ignores the index array,
    // so a header only sticks if the flagged child actually gets wrapped in a pinned, z-raised view.
    // Forwarding the prop instead looks correct in every JS assertion and does nothing on a device.
    it('wraps only the flagged children in a z-raised sticky wrapper', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView stickyHeaderIndices={[0]}>
          <View testID={HEADER} />
          <View testID={ROW} />
        </ScrollView>
      ));
      await tick();

      const wrappers = committedWrappers();
      expect(wrappers).toHaveLength(1);
      expect(wrappers[0]?.children[0]?.props.testID).toBe(HEADER);
      // The unflagged row stays a direct child of the content view, unwrapped.
      const content = committedScrollView().children[0];
      expect(content?.children.map(child => child.props.testID)).toEqual([
        undefined,
        ROW,
      ]);
    });

    // why: the wrapper costs a real Yoga node, so a ScrollView with no sticky indices must not pay
    // for one — and the plain path is also the one that hands `insert` the raw children accessor,
    // which is what keeps a nested <For> update fine-grained.
    it('adds no wrapper when no index is flagged', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView>
          <View testID={HEADER} />
        </ScrollView>
      ));
      await tick();
      expect(committedWrappers()).toHaveLength(0);
    });

    // why: with sticky headers the scroll offset has to reach the AnimatedValue, so RN raises the
    // event rate (16 on the JS fallback, 1 on the native driver). Left at the native default the
    // pin updates a few times a second and visibly lags the finger.
    it('raises scrollEventThrottle to the JS-fallback default when sticky headers are on', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView stickyHeaderIndices={[0]}>
          <View testID={HEADER} />
        </ScrollView>
      ));
      await tick();
      expect(committedScrollView().props.scrollEventThrottle).toBe(16);
    });

    // why: the whole point of the component. The header measures itself, the scroll offset drives
    // the interpolation, and the debounced settled value is pushed into the COMMITTED transform so
    // hit-testing follows the pin. Every link in that chain is silent when broken — the header just
    // scrolls away with the rest of the content.
    it('pins the header by committing a translateY once the scroll offset moves', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView stickyHeaderIndices={[0]}>
          <View testID={HEADER} />
          <View testID={ROW} />
        </ScrollView>
      ));
      await tick();

      // The header sits 100pt down its content and is 50pt tall: it starts translating once the
      // offset passes 100 and then tracks 1:1, so an offset of 200 pins it 100pt down.
      fireLayout(createdWrapperHandles()[0], 100, 50);
      await tick();
      fabric.fireEvent(committedScrollView().instanceHandle, 'topScroll', {
        contentOffset: { x: 0, y: 200 },
      });
      await settle();

      expect(committedWrappers()[0]?.props.transform).toEqual([
        { translateY: 100 },
      ]);
    });

    // why: THE Solid-specific hazard. A header reporting its own y bumps the cross-talk version so
    // the PREVIOUS header can re-read its collision point — and that read has to happen inside the
    // header's own computation. Read inside the wrap instead, it joins the content view's `insert`
    // render effect, and since `insert` REPLACES rather than diffs, every layout pass would destroy
    // and rebuild every header and its children. The counter is the only headless line between a
    // re-prop and a re-render.
    it('creates no node when a header layout bumps the cross-talk map', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView stickyHeaderIndices={[0, 2]}>
          <View testID={HEADER} />
          <View testID={ROW} />
          <View testID={HEADER} />
        </ScrollView>
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;

      const [first, second] = createdWrapperHandles();
      fireLayout(first, 0, 40);
      fireLayout(second, 400, 40);
      await tick();

      expect(committedWrappers(), 'both headers still committed').toHaveLength(
        2,
      );
      expect(
        fabric.counts.createNode,
        'a layout bump rebuilt the header subtree',
      ).toBe(createdAtMount);
    });

    // why: same hazard from the other input. The inverted viewport height is captured off the scroll
    // view's OWN onLayout and fed back into every header; a value read in the wrap would rebuild
    // them all on the first layout pass, which on a device lands mid-scroll.
    it('creates no node when the inverted viewport height is captured', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView stickyHeaderIndices={[0]} invertStickyHeaders>
          <View testID={HEADER} />
        </ScrollView>
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;

      fireLayout(committedScrollView().instanceHandle, 0, 600);
      await tick();

      expect(
        committedWrappers(),
        'the header survived the capture',
      ).toHaveLength(1);
      expect(
        fabric.counts.createNode,
        'the viewport capture rebuilt the header subtree',
      ).toBe(createdAtMount);
    });

    // why: RN lets a list supply its own header wrapper (SectionList does). Silently ignoring the
    // override renders the built-in one, which looks right and drops whatever the list needed.
    it('uses a supplied StickyHeaderComponent instead of the built-in wrapper', async () => {
      const CustomHeader = (
        props: IStickyHeaderProps & { children?: JSX.Element },
      ): JSX.Element => (
        <View testID="custom-wrapper" onLayout={props.onLayout}>
          {props.children}
        </View>
      );
      mount(ROOT_TAG, () => (
        <ScrollView
          stickyHeaderIndices={[0]}
          StickyHeaderComponent={CustomHeader}
        >
          <View testID={HEADER} />
        </ScrollView>
      ));
      await tick();

      expect(
        committedWrappers(),
        'the built-in wrapper must not render',
      ).toHaveLength(0);
      const custom = committedList().find(
        node => node.props.testID === 'custom-wrapper',
      );
      expect(custom?.children[0]?.props.testID).toBe(HEADER);
    });

    // why: Solid runs a component body ONCE, so a `stickyHeaderIndices` that arrives later (a list
    // that computes its sections after a fetch) has to re-drive the wrap. A read taken at setup
    // would leave the headers permanently unwrapped while the prop looked correct.
    it('wraps headers flagged after mount', async () => {
      const [indices, setIndices] = createSignal<number[] | undefined>(
        undefined,
      );
      mount(ROOT_TAG, () => (
        <ScrollView stickyHeaderIndices={indices()}>
          <View testID={HEADER} />
        </ScrollView>
      ));
      await tick();
      expect(committedWrappers()).toHaveLength(0);

      setIndices([0]);
      await tick();
      expect(committedWrappers()).toHaveLength(1);
    });
  });

  describe('Negative', () => {
    // why: an index pointing past the end of the children is a normal transient in a list whose
    // sections shrink. It must leave the remaining children alone rather than throw or drop them.
    it('ignores an index with no corresponding child', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView stickyHeaderIndices={[7]}>
          <View testID={ROW} />
        </ScrollView>
      ));
      await tick();

      expect(committedWrappers()).toHaveLength(0);
      const content = committedScrollView().children[0];
      expect(content?.children[0]?.props.testID).toBe(ROW);
    });
  });
});
