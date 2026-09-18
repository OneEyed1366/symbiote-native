// Coverage scope: renderImage's own transform (source / src / srcSet resolution, the width+height
// style fold, resizeMode-and-tintColor-from-style, the alt fold) is pure, framework-agnostic and
// already exhaustively covered by core/components/src/view/render-image/render-image.test.ts —
// re-asserting those branches through a Solid mount would duplicate that suite, not add proof.
// THE SUBJECT IS THE BARE TAG. There is no Image component any more — an app writes `<image>` and
// the fold runs in the tag's own behavior — so what is genuinely SOLID-side here is that the tag
// reaches that fold through a real Fabric commit, that the W3C aliases stay off the wire, and that
// a prop written after mount still lands on the SAME host node.
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
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: the tag's fold lives in its behavior, and only this module installs it. An
// app reaches it through the package barrel; a test importing the renderer directly does not.
import '../register';
import { mount, unmount } from '../render';
// SIDE-EFFECT IMPORT, and the suite is worthless without it: `renderImage`'s whole fold reaches
// the tag through `registerImageBehavior`, which only this module calls.
// The STATICS half of the old component, now a plain namespace with no view.
import { Image } from '../modules/image';

const ROOT_TAG = 913;
const IMAGE_VIEW = 'RCTImageView';
const REMOTE = { uri: 'http://x/y.png' };
const OTHER_REMOTE = { uri: 'http://x/z.png' };
// A require()-style asset id only becomes a real source once the installed resolver expands it.
const ASSET_ID = 42;
const RESOLVED_ASSET = { uri: 'asset://42', scale: 1, width: 10, height: 10 };
const CLASS_OPACITY = 0.75;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
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

// The RECORD holds a node as it was CREATED, so anything asserted after an update has to be read
// off the live tree instead.
function committedImage(): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.viewName === IMAGE_VIEW,
  );
  if (found === undefined) throw new Error(`no ${IMAGE_VIEW} was committed`);
  return found;
}

/**
 * The image as the RECORDING holds it.
 *
 * Two things only the record can answer. `instanceHandle` is what an event has to be aimed at. And
 * a key the record LOST is proof the engine sent a clearing op for it — the live payload merely
 * omitting a key cannot tell that apart from the key never having been set.
 */
function createdImage(): {
  instanceHandle: unknown;
  props: Readonly<Record<string, unknown>>;
} {
  const node = fabric.find(n => n.viewName === IMAGE_VIEW);
  if (node === undefined) throw new Error(`no ${IMAGE_VIEW} was created`);
  return node;
}

function firstSource(node: ILiveNode): unknown {
  const source = node.payload.source;
  return Array.isArray(source) ? source[0] : undefined;
}

describe('Solid Image on the engine', () => {
  describe('Positive', () => {
    // why: an integration checkpoint, not a re-test of renderImage's branches — it proves the four
    // pieces this adapter is responsible for wiring actually produce a committed Fabric node under
    // the real native view name. A wrong view name resolves to no component on the host, and no
    // JS-level check would catch it.
    it('mounts to a real RCTImageView', async () => {
      mount(ROOT_TAG, () => <image source={REMOTE} />);
      await tick();
      expect(committedImage().payload.source).toEqual([REMOTE]);
    });

    // why: proves an app's resolver actually reaches the render path through the Solid component,
    // rather than only through core's internal wiring — and, since renderImage resolves inside the
    // descriptor accessor, that it is read at render time (after bootstrapHost) and not at import.
    it('runs the installed source resolver on a require()-style asset id', async () => {
      mount(ROOT_TAG, () => <image source={ASSET_ID} />);
      await tick();
      expect(firstSource(committedImage())).toEqual(RESOLVED_ASSET);
    });

    // THE ALIAS FOLD MOVED: `core/engine/cpp/tests/js/image-payload.itest.ts`. `src`/`width`/
    // `height`/`alt` becoming a resolved `source` array and an accessibility label is
    // `foldImageProps` in `SymbioteFabricProps.cpp` now, and this harness commits through the
    // TypeScript `fabricProps`, which holds no copy of that rule.
    //
    // What stays is the half that is Solid's: the aliases must reach the TAG as the app wrote them,
    // because the engine folds what it is handed. A bare tag that swallowed one — the VIEW_PROPS
    // split this case was named for — would send the engine a bag with nothing to fold.
    it('hands the W3C aliases to the tag as written', async () => {
      mount(ROOT_TAG, () => (
        <image src="http://x/w.png" width={20} height={30} alt="a wombat" />
      ));
      await tick();

      expect(committedImage().payload).toMatchObject({
        src: 'http://x/w.png',
        width: 20,
        height: 30,
        alt: 'a wombat',
      });
    });

    // why: proves the engine's event-dispatch path reaches a Solid callback prop for Image — the
    // handler only rides there because onLoad is NOT in the VIEW_PROPS split and therefore stays in
    // `rest`, which lands in passthrough.
    it('fires onLoad from the captured native topLoad event', async () => {
      let loadedUri: unknown;
      mount(ROOT_TAG, () => (
        <image
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
      mount(ROOT_TAG, () => <image source={REMOTE} class="hero" />);
      await tick();

      const props = committedImage().payload;
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
      mount(ROOT_TAG, () => <image source={source()} />);
      await tick();
      // Node IDENTITY rather than a creation count: what restarts the download and drops the
      // decoded bitmap is the node being REPLACED, and a count is satisfied by a replacement that
      // nets out even.
      const hostAtMount = committedImage().handle;
      expect(firstSource(committedImage())).toEqual(REMOTE);

      setSource(OTHER_REMOTE);
      await tick();

      expect(firstSource(committedImage())).toEqual(OTHER_REMOTE);
      expect(committedImage().handle, 'the host node kept its identity').toBe(
        hostAtMount,
      );
    });

    // why: a prop that goes `undefined` must be CLEARED on the node, not left standing. Solid's
    // spread walks the current key set with no removal pass, so without the bridge's
    // `withStableKeys` widening it the native view keeps the old value forever and a screen reader
    // announces text the app already removed (.claude/rules/solid-descriptor-bridge.md §1).
    //
    // Observed on `alt` ITSELF now, where it used to be observed on the `accessibilityLabel` /
    // `accessible` that `alt` folded into — that fold is the engine's
    // (`core/engine/cpp/tests/js/image-payload.itest.ts`) and this harness cannot see it. The claim
    // is unchanged and the observable is one step closer to it: `alt` is what Solid writes.
    it('clears alt on the node when it goes undefined after mount', async () => {
      const [alt, setAlt] = createSignal<string | undefined>('a wombat');
      mount(ROOT_TAG, () => <image source={REMOTE} alt={alt()} />);
      await tick();
      expect(committedImage().payload.alt).toBe('a wombat');

      setAlt(undefined);
      await tick();

      // ABSENT, not null: the literal null was the CLONE PROTOCOL's spelling of "reset to the
      // default", held only inside the diff the stand-in merged. The engine's op stream says the
      // same thing with `NO_VALUE`, and a host replaying that op deletes the key.
      expect(Object.hasOwn(committedImage().payload, 'alt')).toBe(false);
      // …and the half that proves the engine ACTED rather than merely stopping: the record carried
      // the key after the mount above, so its being gone means a clearing op was sent.
      expect(Object.hasOwn(createdImage().props, 'alt')).toBe(false);
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
