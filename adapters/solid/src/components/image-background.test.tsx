// Solid twin of adapters/react/src/components/image-background/*.test.tsx.
//
// Coverage scope: the SOLID-SIDE half per <components_split_logic_view_lifecycle>. The composition
// math (absolute-fill positioning, the wrapper-dimension proxy, the imageStyle-last merge) belongs
// to renderImageBackground, which has no dedicated core test of its own yet — so its shape is
// exercised here rather than skipped, exactly as the React file records. What is genuinely Solid's:
// the wrapper/inner-image SPLIT (literal tag for the live children, Descriptor bridge for the
// image), the child ORDER that makes the overlay paint on top, the class-name routing that must not
// cross between the two nodes, and the two lifecycle claims no other adapter can break — a prop
// frozen at mount, and node identity across a children change.
//
// Every assertion reads fabric.committed: the creation log freezes a node's props at its first
// commit, so an implementation frozen at mount would look correct there
// (symbiote-engine-core §8, .claude/rules/test-harness-false-greens.md §2).
//
// No Negative group: ImageBackground has no guard clause — every prop is optional, `children`
// included, and there is no input it rejects.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { Text } from './text';
import { ImageBackground } from './image-background';

const ROOT_TAG = 837;
const WRAPPER_STYLE = { width: 100, height: 80 };
const SOURCE = { uri: 'http://x/bg.png' };
const OTHER_SOURCE = { uri: 'http://x/other.png' };

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

function committed(predicate: (node: IFakeNode) => boolean): IFakeNode {
  let found: IFakeNode | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (found === undefined && predicate(node)) found = node;
      walk(node.children);
    }
  };
  walk(fabric.committed);
  if (found === undefined) throw new Error('no committed node matched');
  return found;
}

function image(): IFakeNode {
  return committed(node => node.viewName === 'RCTImageView');
}

// Skip the engine's synthetic box-none root; ImageBackground's own wrapper is the other RCTView.
function wrapper(): IFakeNode {
  return committed(
    node =>
      node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none',
  );
}

describe('Solid ImageBackground on the engine', () => {
  describe('Positive', () => {
    // why: RN's ImageBackground.js contract — the wrapper View owns the caller's layout style
    // while the inner Image is absolutely positioned behind it, so the image never affects the
    // wrapper's own layout. Both halves have to survive Solid's split between a literal tag and
    // the Descriptor bridge.
    it('commits a wrapper carrying the caller style and an inner absolute-fill image', async () => {
      mount(ROOT_TAG, () => (
        <ImageBackground
          style={WRAPPER_STYLE}
          source={SOURCE}
          resizeMode="cover"
        />
      ));
      await tick();

      expect(wrapper().props.width).toBe(WRAPPER_STYLE.width);
      expect(wrapper().props.height).toBe(WRAPPER_STYLE.height);
      expect(image().props.position).toBe('absolute');
      expect(image().props.resizeMode).toBe('cover');
    });

    // why: RN's Image overwrites its own width/height from the source's intrinsic size, which
    // would fight the wrapper's explicit dimensions — the proxy is what actually makes the
    // "background" fill the box rather than collapse.
    it("proxies the wrapper's explicit width/height onto the inner image", async () => {
      mount(ROOT_TAG, () => (
        <ImageBackground style={WRAPPER_STYLE} source={SOURCE} />
      ));
      await tick();

      expect(image().props.width).toBe(WRAPPER_STYLE.width);
      expect(image().props.height).toBe(WRAPPER_STYLE.height);
    });

    // why: renderImageBackground never receives `children` — composing them onto the wrapper, and
    // specifically AFTER the image, is the adapter's own responsibility. Getting the order wrong
    // paints the overlay BEHIND the background with nothing to report it. On Solid this is not a
    // static concern: both children are one dynamic expression list, so the order is decided by
    // the renderer's insert, not by source order alone.
    it('appends the caller children AFTER the inner image, so they paint on top', async () => {
      mount(ROOT_TAG, () => (
        <ImageBackground style={WRAPPER_STYLE} source={SOURCE}>
          <Text>on top</Text>
        </ImageBackground>
      ));
      await tick();

      const names = wrapper().children.map(child => child.viewName);
      expect(names).toEqual(['RCTImageView', 'RCTText']);
    });

    // why: `children` is optional — a caller using this purely as a decorative background must not
    // be forced to pass an empty fragment, and the bridge must not leave a stray placeholder node
    // in the committed tree when there is nothing to show.
    it('commits just the wrapper + image when no children are given', async () => {
      mount(ROOT_TAG, () => (
        <ImageBackground style={WRAPPER_STYLE} source={SOURCE} />
      ));
      await tick();

      expect(wrapper().children.map(child => child.viewName)).toEqual([
        'RCTImageView',
      ]);
    });

    // why: `class` and `imageStyle` share ONE style registry but must never cross — styling the
    // overlay wrapper must not repaint the background image, and vice versa. Registering DISTINCT
    // properties is what proves the resolution targets the right node rather than that a value
    // happened to be absent from the wrong one.
    it('routes a `class` to the wrapper and a bare-string imageStyle to the inner image', async () => {
      registerRules([
        {
          tokens: ['wrapperClass'],
          specificity: [0, 1, 0],
          order: 0,
          style: { backgroundColor: '#123456' },
        },
        {
          tokens: ['overlay'],
          specificity: [0, 1, 0],
          order: 1,
          style: { opacity: 0.5 },
        },
      ]);
      mount(ROOT_TAG, () => (
        <ImageBackground
          style={WRAPPER_STYLE}
          source={SOURCE}
          class="wrapperClass"
          imageStyle="overlay"
        />
      ));
      await tick();

      expect(wrapper().props.backgroundColor).toBe('#123456');
      expect('opacity' in wrapper().props).toBe(false);
      expect(image().props.opacity).toBe(0.5);
      expect('backgroundColor' in image().props).toBe(false);
    });

    // why: imageStyle's type is `IStyleProp<IViewStyle> | string` — the string branch must not be
    // the only supported shape; a caller with a computed style object needs renderImageBackground's
    // original contract preserved, merged AFTER the proxied dimensions.
    it('still accepts a plain style object for imageStyle', async () => {
      mount(ROOT_TAG, () => (
        <ImageBackground
          style={WRAPPER_STYLE}
          source={SOURCE}
          imageStyle={{ opacity: 0.25 }}
        />
      ));
      await tick();

      expect(image().props.opacity).toBe(0.25);
    });

    // why: Solid runs a component body ONCE. Every prop read sits inside the memo the Descriptor
    // bridge re-runs, so a later source change reaches the SAME image node; a destructure at setup
    // would freeze the background while every other test here passed. The identity assertion is
    // the other half — replacing the node would also show the new source, while restarting the
    // download and dropping the decoded bitmap.
    it('re-commits the same image node when the source changes after mount', async () => {
      const [source, setSource] = createSignal(SOURCE);
      mount(ROOT_TAG, () => (
        <ImageBackground style={WRAPPER_STYLE} source={source()} />
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(image().props.source).toEqual([SOURCE]);

      setSource(OTHER_SOURCE);
      await tick();

      expect(image().props.source).toEqual([OTHER_SOURCE]);
      expect(fabric.counts.createNode, 'the image node kept its identity').toBe(
        createdAtMount,
      );
    });

    // why: the image and the overlay live in ONE dynamic child list, so a children change re-runs
    // the list. If that rebuilt the image instead of reusing it, the background would flicker and
    // reload on every unrelated overlay update — and the order would be re-derived each time.
    it('keeps the image node and the child order when only the children change', async () => {
      const [label, setLabel] = createSignal('first');
      mount(ROOT_TAG, () => (
        <ImageBackground style={WRAPPER_STYLE} source={SOURCE}>
          <Text>{label()}</Text>
        </ImageBackground>
      ));
      await tick();
      const imageTag = image().tag;

      setLabel('second');
      await tick();

      expect(image().tag).toBe(imageTag);
      expect(wrapper().children.map(child => child.viewName)).toEqual([
        'RCTImageView',
        'RCTText',
      ]);
    });
  });
});
