// Proof of the runtime half for Image, ahead of any `HOST_PRIMITIVES` entry — this project's
// documented order: wire and prove first, add the spec key last, because a missing fold is
// device-only and silent.
//
// Two claims:
//   1. the behavior's fold (a flat prop bag) produces the same payload as `mapImageProps`, for the
//      same authored props;
//   2. the fold is IDEMPOTENT, so a bag that reaches it twice is unchanged.
//
// (2) is asserted rather than reasoned about on purpose. `.claude/rules/adapter-parity-audit.md`
// records that a double fold "is invisible for a fold that happens to be idempotent"; the whole
// difference between an accident and a design is whether something fails when it stops being true.
// A fold that consumes an alias also appearing in its own output would fail it.
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
  it('produces the payload mapImageProps produces', () => {
    const folded = foldImagePayload(AUTHORED);
    const mapped = mapImageProps({
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

    expect(Object.keys(folded).sort()).toEqual(Object.keys(mapped).sort());
    expect(folded).toEqual(mapped);
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
