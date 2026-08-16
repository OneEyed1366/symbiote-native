// Coverage scope: renderImageBackground (core/components/src/view/render-image-background.ts —
// the absolute-fill positioning, wrapper-dimension proxy onto the inner image, imageStyle-last
// merge) has NO dedicated core/components test of its own yet, so its shape is exercised here
// rather than skipped — a gap in core coverage, not something this file should paper over.
// What IS genuinely React-adapter-only (renderImageBackground never sees `children` — it composes
// only the wrapper + inner image): appending the user's `children` AFTER the inner image in
// element order, which is exactly what makes them "paint on top". That's this file's focus.
// The `imageStyle`-as-class-name resolution and the wrapper `className` resolution each have
// their own dedicated coverage in image-background-image-style-class.test.tsx — not duplicated here.
//
// No Negative group: ImageBackground has no guard clause — every prop is optional, `children`
// included, and there is no input it rejects.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Text, ImageBackground } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';

const fabric = installFabric();
const ROOT_TAG = 14;

const WRAPPER_STYLE = { width: 100, height: 80 };
const SOURCE = { uri: 'http://x/bg.png' };
const OVERLAY_TEXT = 'on top';

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('ImageBackground (React lifecycle + children composition)', () => {
  describe('Positive', () => {
    it('renders an outer wrapper carrying the given style and an inner absolute-fill image', () => {
      // why: RN's ImageBackground.js contract — the wrapper View owns the user's layout style,
      // while the inner Image is absolutely positioned behind it so it never affects the
      // wrapper's own layout.
      mount(ROOT_TAG, <ImageBackground style={WRAPPER_STYLE} source={SOURCE} resizeMode="cover" />);

      const wrapper = fabric.find(
        node => node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none',
      );
      expect(wrapper).toBeDefined();
      expect(wrapper!.props.width).toBe(WRAPPER_STYLE.width);
      expect(wrapper!.props.height).toBe(WRAPPER_STYLE.height);

      const image = fabric.find(node => node.viewName === 'RCTImageView');
      expect(image).toBeDefined();
      expect(image!.props.position).toBe('absolute');
    });

    it("proxies the wrapper's explicit width/height onto the inner image so it fills the box", () => {
      // why: RN's Image would otherwise collapse to the source's own intrinsic size, fighting
      // the wrapper's explicit dimensions — the proxy is what actually makes "background" work.
      mount(ROOT_TAG, <ImageBackground style={WRAPPER_STYLE} source={SOURCE} />);

      const image = fabric.find(node => node.viewName === 'RCTImageView');
      expect(image!.props.width).toBe(WRAPPER_STYLE.width);
      expect(image!.props.height).toBe(WRAPPER_STYLE.height);
    });

    it('appends the user children AFTER the inner image, so they paint on top', () => {
      // why: renderImageBackground itself never receives `children` — composing them onto the
      // wrapper, and specifically appending them AFTER the image element, is the React
      // adapter's own responsibility (index.ts's createElement call). Getting the order wrong
      // would silently paint the overlay content BEHIND the background image instead of on it.
      mount(
        ROOT_TAG,
        <ImageBackground style={WRAPPER_STYLE} source={SOURCE}>
          <Text>{OVERLAY_TEXT}</Text>
        </ImageBackground>,
      );

      const committedWrapper = fabric.appRoot().children[0];
      expect(committedWrapper.viewName).toBe('RCTView');

      const childNames = committedWrapper.children.map(child => child.viewName);
      const imageIndex = childNames.indexOf('RCTImageView');
      const textIndex = childNames.findIndex(name => name === 'RCTText' || name === 'RCTParagraph');
      expect(imageIndex).toBeGreaterThanOrEqual(0);
      expect(textIndex).toBeGreaterThan(imageIndex);
    });

    it('renders just the wrapper + image with no children given, without throwing', () => {
      // why: `children` is optional — a caller using ImageBackground purely as a decorative
      // background (no overlay content) must not be forced to pass an empty fragment.
      mount(ROOT_TAG, <ImageBackground style={WRAPPER_STYLE} source={SOURCE} />);

      const committedWrapper = fabric.appRoot().children[0];
      expect(committedWrapper.children.map(child => child.viewName)).toEqual(['RCTImageView']);
    });
  });
});
