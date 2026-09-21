// ImageBackground's INNER image — the second user of `ownerProps`, and the one that finishes the
// primitive at zero crossings.
//
// WHAT THE RULE DOES, and it is RN's own workaround rather than ours (`ImageBackground.js:86-96`,
// whose comment calls it a "Temporary Workaround"): an RN Image overwrites its own width/height from
// the SOURCE's intrinsic size, which fights the box the app sized. So the wrapper's explicit
// dimensions are proxied back onto the image, under an absolute fill, so it covers the box instead of
// collapsing to whatever the bitmap happens to be.
//
// Both inputs live on the node ABOVE — the app writes `style` on the `<image-background>`, and
// `IMAGE_BACKGROUND_HOST_PROPS` keeps it there. That is why this fold outlived every other one in the
// file and why it can move now: `fabricProps` takes `ownerProps` from `node.parent`.
//
// IT NEEDED ITS OWN TAG. The inner image used to carry plain `image`, which is right for everything
// the ordinary image rule does and wrong for this — a bare `<image>` must NOT get an absolute fill.
// `image-background-image` is a distinct tag that `usesImageRule` also serves, so the node gets the
// ordinary image rule AND this one, in that order. Same shape as `usesPressableRule` serving
// `button` and the touchables.
//
// THE ORDER IS THE RECORDED DIVERGENCE, preserved exactly. The image rule folds the image's own
// `width`/`height` PROPS under its style first, and this then layers the BOX's dimensions over that —
// where RN nests it the other way. So an app setting both a `width` prop and a conflicting `style`
// width gets the prop's answer here and the style's in RN. That was decided when the image rule
// moved, is pinned in `core/components/src/behaviors/image-background.test.ts`, and moving the fold
// does not revisit it.

import { registerImageBackgroundBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  registerRules,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerImageBackgroundBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

// Built through the real behavior, so `buildStructure` makes the inner image exactly as an app's
// `<image-background>` would. `routeProp`, because the owner's prop split is a routing decision that
// lives there — `setProp` would put everything on the owner and the image would see nothing.
function commit(ownerProps: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const owner: ISymbioteNode = createElement(
    'RCTView',
    false,
    'image-background',
  );
  for (const [name, value] of Object.entries(ownerProps))
    routeProp(owner, name, value);

  const image = owner.childHost;
  if (image === undefined) throw new Error('the behavior built no inner image');

  surface.appendChild(owner);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(image);
  if (payload === undefined)
    throw new Error('the inner image committed nothing');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

describe('what an image background’s inner image sends native', () => {
  // why: the absolute fill is what puts the photograph BEHIND the app's children rather than in the
  // flow beside them. Without it the image takes part in layout and the children move.
  it('fills its owner absolutely', () => {
    const payload = commit({ source: { uri: 'http://x/a.png' } }).payload;

    expect(payload.position).toBe('absolute');
    expect(payload.left).toBe(0);
    expect(payload.right).toBe(0);
    expect(payload.top).toBe(0);
    expect(payload.bottom).toBe(0);
  });

  // why: THE HALF THAT NEEDED THE SEAM, and RN's own workaround. The dimensions are written on the
  // WRAPPER by the app; an RN Image would otherwise overwrite them from the source's intrinsic size
  // and the background would collapse to the bitmap.
  it('proxies the owner’s explicit box onto the image', () => {
    const payload = commit({
      source: { uri: 'http://x/a.png' },
      style: { width: 120, height: 80 },
    }).payload;

    expect(payload.width).toBe(120);
    expect(payload.height).toBe(80);
  });

  // why: a CLASS name resolves into the owner's style slot through `pushClassStyle`, so the proxy has
  // to read the resolved slot rather than an inline object — an app that sizes its background with a
  // stylesheet rule is the common case, not the exotic one.
  it('reads the box out of a style ARRAY, not just an inline object', () => {
    const payload = commit({
      source: { uri: 'http://x/a.png' },
      style: [{ width: 64 }, { height: 48 }],
    }).payload;

    expect(payload.width).toBe(64);
    expect(payload.height).toBe(48);
  });

  // why: an owner with no explicit size must proxy NOTHING — writing `undefined` dimensions would be
  // the same as writing none, but writing 0 would collapse the image to nothing.
  it('proxies no box when the owner sizes itself by flex', () => {
    const payload = commit({
      source: { uri: 'http://x/a.png' },
      style: { flex: 1 },
    }).payload;

    expect(payload.width).toBe(undefined);
    expect(payload.height).toBe(undefined);
  });

  // why: `imageStyle` is the caller's own say over the image, and it is composed LAST so it beats
  // both the fill and the proxy — an app that wants the background inset or differently positioned
  // has no other way to ask.
  it('lets imageStyle win over the fill and the proxy', () => {
    const payload = commit({
      source: { uri: 'http://x/a.png' },
      style: { width: 120, height: 80 },
      imageStyle: { width: 40, position: 'relative' },
    }).payload;

    expect(payload.width).toBe(40);
    expect(payload.position).toBe('relative');
    // Untouched halves of the fill and the proxy still land.
    expect(payload.height).toBe(80);
    expect(payload.left).toBe(0);
  });

  // why: THE CONTROL, and the reason this needed a tag of its own. A plain `<image>` must not be
  // absolutely positioned — it is an ordinary element in the flow, and filling its parent would break
  // every image in every app.
  it('leaves a PLAIN image alone', () => {
    const surface = createSurface(ROOT_TAG);
    const plain: ISymbioteNode = createElement('RCTImageView', false, 'image');
    routeProp(plain, 'source', { uri: 'http://x/a.png' });
    surface.appendChild(plain);
    surface.commit();
    mounted();

    expect(committedPayloadOf(plain)?.position).toBe(undefined);
  });

  // why: RN spreads `...props` onto the Image (`ImageBackground.js:81`), so `id` is the IMAGE's and
  // never the box's — and a raw `id` is a key no ViewConfig declares, so Fabric drops it in silence
  // and the nativeID is lost. Two rules meet on one node here (`foldIdAlias` over every tagged node,
  // then this one), which is the case worth having rather than either alone.
  it('renames the id the spread put on it, and leaves the owner without one', () => {
    const surface = createSurface(ROOT_TAG);
    const owner: ISymbioteNode = createElement(
      'RCTView',
      false,
      'image-background',
    );
    routeProp(owner, 'source', { uri: 'http://x/a.png' });
    routeProp(owner, 'id', 'hero');
    const image = owner.childHost;
    if (image === undefined)
      throw new Error('the behavior built no inner image');
    surface.appendChild(owner);
    surface.commit();
    mounted();

    expect(committedPayloadOf(image)?.nativeID).toBe('hero');
    expect(committedPayloadOf(image)?.id).toBe(undefined);
    expect(committedPayloadOf(owner)?.nativeID).toBe(undefined);
  });

  // why: THE FAILURE MODE A PARENT-READING RULE INTRODUCES, and this primitive's version of it. The
  // rule runs when the IMAGE is dirty, so a write to the OWNER after the first commit has to mark the
  // image dirty or the proxy freezes at the box's first size — a background that keeps the old
  // dimensions forever while the box visibly resizes around it.
  //
  // `slotDerived` names `style`, so it works, and it worked for the JS fold for the same reason.
  // Asserted rather than assumed, because a later `slotDerived` edit would delete it silently.
  it('re-derives the box when the owner is resized after the first commit', () => {
    const surface = createSurface(ROOT_TAG);
    const owner: ISymbioteNode = createElement(
      'RCTView',
      false,
      'image-background',
    );
    routeProp(owner, 'source', { uri: 'http://x/a.png' });
    routeProp(owner, 'style', { width: 100, height: 80 });
    const image = owner.childHost;
    if (image === undefined)
      throw new Error('the behavior built no inner image');
    surface.appendChild(owner);
    surface.commit();
    mounted();
    expect(committedPayloadOf(image)?.width).toBe(100);

    routeProp(owner, 'style', { width: 200, height: 160 });
    surface.commit();
    mounted();

    expect(committedPayloadOf(owner)?.width).toBe(200);
    expect(committedPayloadOf(image)?.width).toBe(200);
    expect(committedPayloadOf(image)?.height).toBe(160);
  });

  // why: the same path reached the OTHER way an app sizes a box. A class name is published INTO
  // `node.props.style` by `pushClassStyle`, so it arrives at the derived-slot mark spelled `style` —
  // which is why `slotDerived` names only that one key, and why a `class` write must still reach the
  // image. Styling a background with a stylesheet rule is the common case, not the exotic one.
  it('re-derives the box when a CLASS sizes the owner after the first commit', () => {
    registerRules([
      {
        tokens: ['box'],
        specificity: [0, 1, 0],
        order: 0,
        style: { width: 300, height: 240 },
      },
    ]);
    const surface = createSurface(ROOT_TAG);
    const owner: ISymbioteNode = createElement(
      'RCTView',
      false,
      'image-background',
    );
    routeProp(owner, 'source', { uri: 'http://x/a.png' });
    const image = owner.childHost;
    if (image === undefined)
      throw new Error('the behavior built no inner image');
    surface.appendChild(owner);
    surface.commit();
    mounted();
    expect(committedPayloadOf(image)?.width).toBe(undefined);

    routeProp(owner, 'class', 'box');
    surface.commit();
    mounted();

    expect(committedPayloadOf(owner)?.width).toBe(300);
    expect(committedPayloadOf(image)?.width).toBe(300);
    expect(committedPayloadOf(image)?.height).toBe(240);
  });

  // why: `ImageBackground.js:67,76,82` destructures `importantForAccessibility` out of props and
  // reapplies it explicitly to BOTH the wrapper (:76) and the image (:82) — one accessibility
  // subtree, so both halves must agree on whether it is hidden. `IMAGE_BACKGROUND_HOST_PROPS` keeps
  // it on the owner now (`image-background.test.ts`), so this reads it back off `ownerProps`, the
  // same seam the box proxy already uses.
  it('derives importantForAccessibility from the owner, matching vendor', () => {
    const payload = commit({
      source: { uri: 'http://x/a.png' },
      importantForAccessibility: 'no-hide-descendants',
    }).payload;

    expect(payload.importantForAccessibility).toBe('no-hide-descendants');
  });

  // why: RN never applies a value it was not given — an ImageBackground with no
  // `importantForAccessibility` must not invent one on the image any more than on the owner.
  it('writes nothing when the owner never authored importantForAccessibility', () => {
    const payload = commit({ source: { uri: 'http://x/a.png' } }).payload;

    expect(payload.importantForAccessibility).toBe(undefined);
  });

  // why: THE PRICE. ImageBackground is now zero trips on both nodes — the owner shed its fold when
  // the Smart Invert opt-out moved, and this is the other one.
  it('costs no trip into JS for either node', () => {
    const one = commit({ source: { uri: 'http://x/a.png' } });
    print(`DEBUG image-background-image folds=${one.folds}`);
    expect(one.folds).toBe(0);
  });
});

report();
