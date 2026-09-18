// Unit test for `renderImage`, which is a GATHER and no longer a fold.
//
// WHAT THIS FILE USED TO BE, and where it went. It exercised source resolution (source / src /
// srcSet), the header aliases (crossOrigin / referrerPolicy), the width/height style fold,
// resizeMode/tintColor read from style, and the `alt` -> accessibilityLabel fold — roughly seventy
// assertions against `mapImageProps`. That rule is the engine's now (`foldImageProps` in
// `SymbioteFabricProps.cpp`) and its contract is
// `core/engine/cpp/tests/js/image-payload.itest.ts`, which reads the payload the commit actually
// sent rather than the return value of a function. Every claim moved; nothing was dropped.
//
// It had to move rather than stay: this harness never reaches the C++ builder, so a case left here
// would assert a rule that no longer runs — the shape of false green the text-input port was caught
// by.
//
// WHAT IS LEFT is the one thing `renderImage` still decides: it flattens a typed view object back
// into the prop bag an app would have authored, and names the `image` TAG. The engine resolves the
// rest at commit, once, for every adapter.
//
// No Negative group: the function is total over `IImageViewProps` — no guard clause, no throw.

import { describe, expect, it } from 'vitest';
import { renderImage, type IImageViewProps } from './index';

function baseView(overrides: Partial<IImageViewProps> = {}): IImageViewProps {
  return { passthrough: {}, ...overrides };
}

describe('renderImage (Positive — the tag it names and the bag it hands over)', () => {
  // why: the TAG is what reaches Image's behavior and therefore the engine's rule. A descriptor
  // naming the Fabric view instead would commit an image that folds nothing, and the payload would
  // look plausible — a raw `src` that Fabric drops in silence.
  it('names the image tag, not the native view', () => {
    expect(renderImage(baseView({ src: 'http://x/1.png' })).type).toBe('image');
  });

  // why: the aliases leave UNRESOLVED on purpose. Resolving one here would be a second
  // implementation of the rule that moved, which is exactly what this file's own header warns
  // about — and the adapter that still calls this (Angular's typed `@Input()`s) would then get a
  // different payload from every adapter that writes props straight onto the tag.
  it('forwards every named prop verbatim, aliases included', () => {
    const props = renderImage(
      baseView({
        src: 'http://x/1.png',
        srcSet: 'http://x/2.png 2x',
        alt: 'a cat',
        width: 40,
        height: 20,
        crossOrigin: 'use-credentials',
        referrerPolicy: 'origin',
        resizeMode: 'contain',
      }),
    ).props;

    expect(props).toMatchObject({
      src: 'http://x/1.png',
      srcSet: 'http://x/2.png 2x',
      alt: 'a cat',
      width: 40,
      height: 20,
      crossOrigin: 'use-credentials',
      referrerPolicy: 'origin',
      resizeMode: 'contain',
    });
  });

  // why: passthrough is everything the adapter did not narrow — events, testID, the accessibility
  // props. It must land on the tag untouched, and a named prop must not be shadowed by it.
  it('carries passthrough through, with the named props over it', () => {
    const props = renderImage(
      baseView({
        source: { uri: 'http://x/1.png' },
        passthrough: { testID: 'hero', onLoad: () => {} },
      }),
    ).props;

    expect(props.testID).toBe('hero');
    expect(typeof props.onLoad).toBe('function');
    expect(props.source).toEqual({ uri: 'http://x/1.png' });
  });

  // why: an absent field must not arrive as an explicit `undefined`. `routeProp` encodes that as a
  // DELETE, so a spread of every name would clear props the app never mentioned.
  it('omits the fields the view did not carry', () => {
    const props = renderImage(baseView({ src: 'http://x/1.png' })).props;

    expect('alt' in props).toBe(false);
    expect('defaultSource' in props).toBe(false);
    expect('width' in props).toBe(false);
  });
});
