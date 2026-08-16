// Coverage scope: index.ts's own class-name resolution logic — `imageStyle` accepts a bare
// class-name string (widened IImageBackgroundProps type) resolved through the SAME shared style
// registry `className` uses, but the two target DIFFERENT nodes: `className` -> wrapper,
// `imageStyle` -> inner image. This split (and the string-vs-object branch for `imageStyle`) is
// React-adapter-only logic (`resolveClassName` called directly in index.ts before
// renderImageBackground ever sees it), not part of renderImageBackground's own contract, so it
// belongs here rather than in image-background.test.tsx.
//
// No Negative group: an unregistered/unknown class name is not this component's contract to
// reject — resolveClassName's own behavior for that case belongs to the shared style-registry
// suite, not here.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { ImageBackground, mount, unmount } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 15;
const fabric = installFabric();
const SOURCE = { uri: 'http://x/bg.png' };

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('ImageBackground imageStyle/className class-name resolution', () => {
  describe('Positive', () => {
    it('resolves imageStyle and className to their own registered styles, each landing on a different node', () => {
      // why: the two class props share one style registry but must never cross — a caller
      // styling the overlay wrapper (className) must not accidentally repaint the background
      // image (imageStyle), and vice versa. Registering DISTINCT style keys with DISTINCT
      // properties proves the resolution actually targets the right node, not just that
      // *a* value happened to be absent from the wrong one.
      registerStyles({ overlay: { opacity: 0.5 }, wrapperClass: { backgroundColor: '#123456' } });
      mount(
        ROOT_TAG,
        <ImageBackground source={SOURCE} imageStyle="overlay" className="wrapperClass" />,
      );

      const image = fabric.find(node => node.viewName === 'RCTImageView');
      expect(image, 'RCTImageView was created').toBeDefined();
      expect(image!.props.opacity).toBe(0.5);
      expect('backgroundColor' in image!.props).toBe(false);

      const wrapper = fabric.find(
        node => node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none',
      );
      expect(wrapper, 'wrapper RCTView was created').toBeDefined();
      expect(wrapper!.props.backgroundColor).toBe('#123456');
      expect('opacity' in wrapper!.props).toBe(false);
    });

    it('still accepts a plain style object for imageStyle, unchanged, when no class name is used', () => {
      // why: imageStyle's type is `IStyleProp<IViewStyle> | string` — the string branch must
      // not be the only supported shape; a caller with an inline/computed style object needs
      // the original renderImageBackground contract preserved.
      mount(ROOT_TAG, <ImageBackground source={SOURCE} imageStyle={{ opacity: 0.25 }} />);

      const image = fabric.find(node => node.viewName === 'RCTImageView');
      expect(image!.props.opacity).toBe(0.25);
    });
  });
});
