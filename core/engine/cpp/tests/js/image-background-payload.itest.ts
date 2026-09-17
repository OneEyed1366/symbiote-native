// ImageBackground's OWNER, which is a two-line primitive with a one-line platform rule — and the
// clean example of the split this whole port is organised around, because its other node keeps its
// fold and should.
//
// WHAT MOVED: `accessibilityIgnoresInvertColors: true`, unconditionally, on the wrapper
// (`ImageBackground.js:75`). It is a function of the TAG and of nothing else — an ImageBackground is
// a photograph behind content, and iOS's Smart Invert turning a photograph into its own negative is
// the case the prop exists for. Upstream sets it on every ImageBackground ever rendered.
//
// WHAT STAYED, and it is the reason this file is not "ImageBackground is done": the INNER image
// keeps `imageFold`, which derives its style from the OWNER's live style (RN proxies the wrapper's
// width/height onto the image so it fills the box instead of collapsing to the source's intrinsic
// size, `ImageBackground.js:86-96`). That reads another node, so it is composition, and composition
// stays in JS. The image's own platform half — the source resolution, the W3C aliases — is already
// the engine's, reached off the `image` tag it carries.
//
// NONE OF THE FIVE WRAPPERS EVER WROTE THIS PROP, so the port closes a standing gap rather than
// reproducing one. That also means no existing screen can regress from it: there was nothing there.

import { registerImageBackgroundBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerImageBackgroundBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

// The OWNER only. `buildStructure` builds the inner image under it, so a commit here is two nodes
// and the fold count below is the pair's — which is the number worth pinning, since the whole claim
// is that one of the two shed its trip and the other did not.
function commit(props: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(
    'RCTView',
    false,
    'image-background',
  );
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

describe('what an image background sends native', () => {
  // why: iOS Smart Invert inverts colours for accessibility, and a photograph is exactly what must
  // NOT be inverted. RN opts the whole subtree out on the wrapper; without it a user with the
  // setting on sees every background image as its own negative, and nothing in any suite says so.
  it('opts its subtree out of Smart Invert, unconditionally', () => {
    expect(commit({}).payload.accessibilityIgnoresInvertColors).toBe(true);
    expect(
      commit({ testID: 'hero' }).payload.accessibilityIgnoresInvertColors,
    ).toBe(true);
  });

  // why: the owner is the node the app's own style lands on (`IMAGE_BACKGROUND_HOST_PROPS` keeps it
  // there), and the rule must not disturb it — the inner image's fill is DERIVED from this style, so
  // losing it here would silently collapse the image to its intrinsic size.
  it('leaves the app style on the owner for the image to derive from', () => {
    expect(commit({ style: { width: 120, height: 80 } }).payload.width).toBe(
      120,
    );
  });

  // why: THE PRICE, and the split is the point. The owner sheds its trip entirely; the inner image
  // keeps one, because its style is derived from the owner and no per-node rule can read another
  // node. So a committed ImageBackground goes from TWO crossings to ONE, and the remaining one is
  // composition rather than platform — exactly where the browser model says it belongs.
  it('pays one trip for the pair, and it is the image’s', () => {
    const one = commit({});
    print(`DEBUG image-background folds=${one.folds}`);
    expect(one.folds).toBe(1);
  });
});

report();
