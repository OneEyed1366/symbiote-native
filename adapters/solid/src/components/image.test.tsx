// Coverage scope: renderImage's own transform (source / src / srcSet resolution, the width+height
// style fold, resizeMode-and-tintColor-from-style, the alt fold) is pure, framework-agnostic and
// already exhaustively covered by core/components/src/view/render-image/render-image.test.ts —
// re-asserting those branches through a Solid mount would duplicate that suite, not add proof.
// This file covers what is genuinely SOLID-side: that ./image.ts wires splitProps +
// resolveAccessibilityProps + renderImage + descriptorToSolid into a real Fabric commit, that the
// VIEW_PROPS split keeps the W3C aliases off the wire, and — the part with no counterpart in
// React's twin — that a component body which runs ONCE still tracks later prop changes and still
// clears a prop key that VANISHES from the bag.
//
// No Negative group: every Image prop is optional and every path resolves to some descriptor, so
// there is no input this component rejects (React's twin reaches the same conclusion).

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import {
  imageStatics,
  setImageSourceResolver,
} from '@symbiote-native/components';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { Image } from './image';

const ROOT_TAG = 913;
const IMAGE_VIEW = 'RCTImageView';
const REMOTE = { uri: 'http://x/y.png' };
const OTHER_REMOTE = { uri: 'http://x/z.png' };
// A require()-style asset id only becomes a real source once the installed resolver expands it.
const ASSET_ID = 42;
const RESOLVED_ASSET = { uri: 'asset://42', scale: 1, width: 10, height: 10 };
const CLASS_OPACITY = 0.75;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  setImageSourceResolver(source =>
    source === ASSET_ID ? RESOLVED_ASSET : source,
  );
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
  setImageSourceResolver(source => source);
});

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// Props on the CREATED node are frozen at first commit (clone-on-write hands back a new object),
// so anything asserted after an update has to be read off the live committed tree.
function committedImage(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === IMAGE_VIEW) found = node;
  });
  if (found === undefined) throw new Error(`no ${IMAGE_VIEW} was committed`);
  return found;
}

function createdImage(): IFakeNode {
  const node = fabric.find(n => n.viewName === IMAGE_VIEW);
  if (node === undefined) throw new Error(`no ${IMAGE_VIEW} was created`);
  return node;
}

function firstSource(node: IFakeNode): unknown {
  const source = node.props.source;
  return Array.isArray(source) ? source[0] : undefined;
}

describe('Solid Image on the engine', () => {
  describe('Positive', () => {
    // why: an integration checkpoint, not a re-test of renderImage's branches — it proves the four
    // pieces this adapter is responsible for wiring actually produce a committed Fabric node under
    // the real native view name. A wrong view name resolves to no component on the host, and no
    // JS-level check would catch it.
    it('mounts to a real RCTImageView', async () => {
      mount(ROOT_TAG, () => <Image source={REMOTE} />);
      await tick();
      expect(committedImage().props.source).toEqual([REMOTE]);
    });

    // why: proves an app's resolver actually reaches the render path through the Solid component,
    // rather than only through core's internal wiring — and, since renderImage resolves inside the
    // descriptor accessor, that it is read at render time (after bootstrapHost) and not at import.
    it('runs the installed source resolver on a require()-style asset id', async () => {
      mount(ROOT_TAG, () => <Image source={ASSET_ID} />);
      await tick();
      expect(firstSource(committedImage())).toEqual(RESOLVED_ASSET);
    });

    // why: the W3C aliases are consumed by renderImage and fold into the resolved `source` array.
    // Dropping one from the VIEW_PROPS split list would leave it riding through `passthrough` to
    // Fabric raw as well — a prop native has no idea about, alongside a source that looks correct.
    it('keeps the W3C aliases off the native prop bag, folding them into source', async () => {
      mount(ROOT_TAG, () => (
        <Image src="http://x/w.png" width={20} height={30} alt="a wombat" />
      ));
      await tick();

      const props = committedImage().props;
      expect(firstSource(committedImage())).toEqual({
        uri: 'http://x/w.png',
        width: 20,
        height: 30,
        headers: {},
      });
      expect('src' in props).toBe(false);
      expect('crossOrigin' in props).toBe(false);
      expect(props.accessibilityLabel).toBe('a wombat');
    });

    // why: proves the engine's event-dispatch path reaches a Solid callback prop for Image — the
    // handler only rides there because onLoad is NOT in the VIEW_PROPS split and therefore stays in
    // `rest`, which lands in passthrough.
    it('fires onLoad from the captured native topLoad event', async () => {
      let loadedUri: unknown;
      mount(ROOT_TAG, () => (
        <Image
          source={REMOTE}
          onLoad={event => {
            loadedUri = event.nativeEvent.source;
          }}
        />
      ));
      await tick();

      fabric.fireEvent(createdImage().instanceHandle, 'topLoad', {
        source: REMOTE,
      });
      expect(loadedUri).toEqual(REMOTE);
    });

    // why: `class` is IImageProps' Solid-specific extension, not one of renderImage's typed view
    // fields — so it must fall into passthrough and resolve through the SAME registerRules /
    // routeProp path View uses, landing as flattened style props rather than a literal `class`.
    it('resolves a Solid `class` through the shared style registry onto the image', async () => {
      registerRules([
        {
          tokens: ['hero'],
          specificity: [0, 1, 0],
          order: 0,
          style: { opacity: CLASS_OPACITY },
        },
      ]);
      mount(ROOT_TAG, () => <Image source={REMOTE} class="hero" />);
      await tick();

      const props = committedImage().props;
      expect(props.opacity).toBe(CLASS_OPACITY);
      expect('class' in props).toBe(false);
    });

    // why: Solid runs a component body ONCE. Every prop read sits inside the descriptor accessor
    // precisely so a later change still reaches the host node; one destructure at setup would
    // freeze the image at its mount-time source while every other test here still passed. The node
    // count pins the other half — the update must re-commit the SAME image, not replace it (a
    // replacement restarts the download and drops the decoded bitmap).
    it('re-commits the same native node when the parent swaps source after mount', async () => {
      const [source, setSource] = createSignal(REMOTE);
      mount(ROOT_TAG, () => <Image source={source()} />);
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(firstSource(committedImage())).toEqual(REMOTE);

      setSource(OTHER_REMOTE);
      await tick();

      expect(firstSource(committedImage())).toEqual(OTHER_REMOTE);
      expect(fabric.counts.createNode, 'the host node kept its identity').toBe(
        createdAtMount,
      );
    });

    // why: renderImage emits accessibilityLabel/accessible ONLY while `alt` holds a value, so the
    // keys VANISH from the bag when it clears. Solid's spread walks the current key set with no
    // removal pass, so without the bridge's withStableKeys widening this the native view keeps the
    // old label forever and a screen reader announces text the app already removed
    // (.claude/rules/solid-descriptor-bridge.md §1).
    it('clears the alt-derived accessibility props when alt goes undefined after mount', async () => {
      const [alt, setAlt] = createSignal<string | undefined>('a wombat');
      mount(ROOT_TAG, () => <Image source={REMOTE} alt={alt()} />);
      await tick();
      expect(committedImage().props.accessibilityLabel).toBe('a wombat');
      expect(committedImage().props.accessible).toBe(true);

      setAlt(undefined);
      await tick();

      expect(committedImage().props.accessibilityLabel).toBeNull();
      expect(committedImage().props.accessible).toBeNull();
    });

    // why: Object.assign(ImageComponent, imageStatics) must attach the SAME function references —
    // a rewrap or partial copy would silently desync the Solid entry point from core's behavior
    // (including the negative-path guarantees core/engine/src/image-loader.test.ts proves) without
    // either layer noticing.
    it('exposes every imageStatics method on Image by identity, not a wrapped copy', () => {
      const staticKeys = Object.keys(imageStatics);
      expect(staticKeys.length).toBeGreaterThan(0);
      for (const key of staticKeys) {
        expect(Reflect.get(Image, key)).toBe(Reflect.get(imageStatics, key));
      }
    });

    // why: a live call proves the composed object is genuinely invokable through `Image.*` at
    // runtime, not merely structurally equal to imageStatics.
    it('resolveAssetSource is callable through the Image import, using the installed resolver', () => {
      const resolved = Image.resolveAssetSource(ASSET_ID);
      expect(resolved).toEqual(RESOLVED_ASSET);
    });
  });
});
