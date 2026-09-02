// Proof of the runtime half for Image, ahead of any `HOST_PRIMITIVES` entry — this project's
// documented order: wire and prove first, add the spec key last, because the key is what makes all
// four transforms start lowering at once and a missing fold is device-only and silent.
//
// Two claims, and the second is the one that decides whether Image needs a `-managed` tag split the
// way TextInput did:
//   1. the LOWERED path (a flat prop bag through the behavior) produces the same payload as the
//      WRAPPER path (a typed view through renderImage's mapping), for the same authored props;
//   2. the fold is IDEMPOTENT, so running it on a wrapper-built node — which already carries folded
//      props, since renderImage emits the same `symbiote-image` tag — changes nothing.
//
// (2) is asserted rather than reasoned about on purpose. `.claude/rules/adapter-parity-audit.md`
// records that a double fold "is invisible for a fold that happens to be idempotent"; the whole
// difference between an accident and a design is whether something fails when it stops being true.
//
// AND DO NOT COPY IMAGE'S CONCLUSION — CHECK BOTH PROPERTIES. It is tempting to read TextInput's
// `-managed` split as evidence that its fold is not idempotent. Measured 2026-09-01, by reaching
// `node.payloadFold` off a real `symbiote-text-input` node and running it twice: it IS idempotent
// (it deletes its alias-only keys and derives the rest, so a second pass finds nothing to do). The
// split exists for a different reason — that behavior carries a MACHINE (`ownedListeners`
// change/focus/blur, `attach`, `attachAfterCommit`, `afterCommit`), and attaching it to a
// wrapper-built node would give that node two owners while the wrapper's own lifecycle is running.
// Solid's `register.ts` says exactly that: "One owner per node."
//
// So a fold-only primitive owes TWO checks before it may share the wrapper's tag:
//   is the fold idempotent?  (this file)
//   does the behavior carry anything BUT a fold?  (if yes, the tag must split, idempotent or not)
// Image answers yes and no. A primitive whose fold consumes an alias that also appears in its own
// output fails the first; anything with listeners or a commit hook fails the second.
import { afterEach, describe, expect, it } from 'vitest';
import { setImageSourceResolver } from '@symbiote-native/engine';
import { foldImagePayload } from './image';
import { mapImageProps } from '../view/render-image';

afterEach(() => {
  setImageSourceResolver(source => source);
});

// Every authored shape the mapping actually branches on, in one bag: a W3C alias set (src/alt/
// width/height), a legacy one (source/resizeMode/tintColor), the two secondary sources, and a
// passthrough key that must survive untouched.
const AUTHORED = {
  src: 'https://example.test/a.png',
  alt: 'A picture',
  width: 40,
  height: 20,
  style: { opacity: 0.5 },
  resizeMode: 'contain',
  tintColor: '#ff0000',
  defaultSource: { uri: 'https://example.test/placeholder.png' },
  loadingIndicatorSource: { uri: 'https://example.test/spinner.gif' },
  testID: 'probe',
  blurRadius: 2,
} as const;

describe('the Image behavior fold', () => {
  it('gives the lowered path the payload the wrapper path produces', () => {
    const lowered = foldImagePayload(AUTHORED);
    const wrapper = mapImageProps({
      src: AUTHORED.src,
      alt: AUTHORED.alt,
      width: AUTHORED.width,
      height: AUTHORED.height,
      style: { ...AUTHORED.style },
      resizeMode: 'contain',
      tintColor: AUTHORED.tintColor,
      defaultSource: { ...AUTHORED.defaultSource },
      loadingIndicatorSource: { ...AUTHORED.loadingIndicatorSource },
      passthrough: { testID: AUTHORED.testID, blurRadius: AUTHORED.blurRadius },
    });

    expect(Object.keys(lowered).sort()).toEqual(Object.keys(wrapper).sort());
    expect(lowered).toEqual(wrapper);
  });

  it('consumes every W3C alias rather than forwarding it', () => {
    const folded = foldImagePayload(AUTHORED);
    // A raw `src` / `alt` / `width` reaching Fabric is a key no ViewConfig declares: it throws
    // nothing, logs nothing and paints nothing, which is the failure this fold exists to prevent.
    for (const consumed of ['src', 'srcSet', 'alt', 'width', 'height']) {
      expect(folded, consumed).not.toHaveProperty(consumed);
    }
    expect(folded.accessibilityLabel).toBe('A picture');
    expect(folded.accessible).toBe(true);
    expect(folded.testID).toBe('probe');
  });

  it('is IDEMPOTENT, which is what lets it share the wrapper tag', () => {
    const once = foldImagePayload(AUTHORED);
    const twice = foldImagePayload(once);
    expect(twice).toEqual(once);
  });

  it('is idempotent for a legacy object source too', () => {
    const legacy = {
      source: { uri: 'https://example.test/b.png' },
      testID: 'x',
    };
    const once = foldImagePayload(legacy);
    expect(foldImagePayload(once)).toEqual(once);
  });

  it('drops a source shape it cannot resolve rather than forwarding it', () => {
    // A string is the plausible mistake (`source="./a.png"`), and forwarding it would reach native
    // as neither an asset id nor a `{uri}` — an image that silently never paints.
    const folded = foldImagePayload({ source: './a.png' });
    expect(folded.source).toEqual([]);
  });
});
