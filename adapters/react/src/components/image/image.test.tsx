// Coverage scope: `renderImage`'s own transform logic (source/src/srcSet resolution, the
// width/height style fold, resizeMode/tintColor-from-style, the alt->accessibilityLabel fold) is
// pure and framework-agnostic, and is already exhaustively covered by
// core/components/src/view/render-image/render-image.test.ts — re-asserting those branches here
// through a React mount would duplicate that suite, not add proof. This file instead covers what
// is genuinely REACT-SIDE: that ImageComponent (index.ts) actually wires resolveAccessibilityProps
// + renderImage + descriptorToReact together into a real Fabric commit, and that the native
// topLoad event reaches the `onLoad` prop through the mount/event-dispatch path.
//
// No Negative group: ImageComponent has no guard clause — every prop is optional and every path
// resolves to SOME descriptor; there is no input it rejects.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import {
  mount,
  unmount,
  Image,
  setImageSourceResolver,
  type ISymbioteEvent,
} from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const fabric = installFabric();
const ROOT_TAG = 11;

// A require()-style number expands to a resolved source before it reaches renderImage; this
// proves the resolver hook is actually wired at the React entry point, not just present in core.
const ASSET_ID = 42;
const RESOLVED_ASSET = { uri: 'asset://42', scale: 1, width: 10, height: 10 };

function imageNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTImageView');
  if (!node) throw new Error('no RCTImageView was created');
  return node;
}

beforeEach(() => {
  fabric.reset();
  setImageSourceResolver(source =>
    source === ASSET_ID ? RESOLVED_ASSET : source,
  );
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('Image (React lifecycle + descriptor bridge)', () => {
  describe('Positive', () => {
    it('mounts to a real RCTImageView, proving resolveAccessibilityProps -> renderImage -> descriptorToReact integrate', () => {
      // why: this is an integration checkpoint, not a re-test of renderImage's own branches
      // (covered in core) — it proves the three pieces the React adapter is responsible for
      // wiring together actually produce a committed Fabric node.
      mount(ROOT_TAG, <Image source={{ uri: 'http://x/y.png' }} />);
      expect(fabric.appRoot().children.map(n => n.viewName)).toContain(
        'RCTImageView',
      );
    });

    it('runs the installed source resolver on a require()-style number before it reaches native', () => {
      // why: setImageSourceResolver is re-exported at the React entry point (@symbiote-native/react);
      // this proves an app's resolver actually reaches the render path through THIS import, not
      // just through core's own internal wiring.
      mount(ROOT_TAG, <Image source={ASSET_ID} />);
      const source = imageNode().props.source;
      expect(Array.isArray(source) ? source[0] : undefined).toEqual(
        RESOLVED_ASSET,
      );
    });

    it('fires onLoad from the captured native topLoad event', () => {
      // why: proves the engine's generic event-dispatch path reaches a React callback prop for
      // Image specifically — nothing about event routing is Image-specific, but the prop must
      // actually be registered as a handler for this to work end to end.
      let loadedWith: ISymbioteEvent | undefined;
      mount(
        ROOT_TAG,
        <Image
          source={{ uri: 'http://x/y.png' }}
          onLoad={event => {
            loadedWith = event;
          }}
        />,
      );

      const node = imageNode();
      fabric.fireEvent(node.instanceHandle, 'topLoad', {
        source: { uri: 'http://x/y.png', width: 1, height: 1 },
      });
      expect(loadedWith).toBeDefined();
    });

    it('resolves a React-only `className` through the shared style registry onto the image', () => {
      // why: className is IImageProps' React-specific extension (not part of the shared
      // agnostic IImageBaseProps) — since it is not one of renderImage's typed transform fields
      // (source/src/srcSet/alt/width/height/...), it falls into passthrough and must resolve
      // through the SAME registerRules/routeProp path View and ImageBackground use, landing as
      // flattened style props on the image node, not a literal `className` prop.
      registerRules([
        {
          tokens: ['hero'],
          specificity: [0, 1, 0],
          order: 0,
          style: { opacity: 0.75 },
        },
      ]);
      mount(
        ROOT_TAG,
        <Image source={{ uri: 'http://x/y.png' }} className="hero" />,
      );
      expect(imageNode().props.opacity).toBe(0.75);
    });
  });
});
