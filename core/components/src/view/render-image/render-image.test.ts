// Unit test for the pure renderImage view fn, split out from the imperative Image statics
// (@symbiote-native/engine's image-loader.ts) per the VIEW layer's zero-state / zero-native-bridge
// contract. Exercises source resolution (source / src / srcSet), the header aliases
// (crossOrigin/referrerPolicy), the width/height style fold, resizeMode/tintColor read from style,
// and the alt -> accessibilityLabel fold - no adapter, no Fabric slot.
//
// No Negative group: renderImage and its helpers are total over IImageViewProps (a missing source
// degrades to an empty source array, an invalid srcSet token is skipped, per the header's own "no
// source / src / srcSet provided" dlog) — nothing throws. Every scenario below is Positive.

import { afterEach, describe, expect, it } from 'vitest';
import { setImageSourceResolver } from '@symbiote-native/engine';
import { renderImage, type IImageViewProps } from './index';
import type { IViewStyle } from '@symbiote-native/engine';

function baseView(overrides: Partial<IImageViewProps> = {}): IImageViewProps {
  return { passthrough: {}, ...overrides };
}

// resizeMode/tintColor on `style` is a legacy Image pattern renderImage reads defensively
// (readStyleString) - IViewStyle itself doesn't declare these keys, so a widened local type
// is needed to construct the fixture without an `as` cast.
type ILegacyImageStyle = IViewStyle & { resizeMode?: string; tintColor?: string };

afterEach(() => {
  // Restore the identity resolver so tests don't leak state into one another.
  setImageSourceResolver(source => source);
});

describe('renderImage — source resolution (Positive)', () => {
  it('resolves an object `source` into a one-element array via the installed resolver', () => {
    setImageSourceResolver(source => ({ ...(source as object), scale: 2 }));
    const descriptor = renderImage(baseView({ source: { uri: 'http://x/a.png' } }));
    expect(descriptor.type).toBe('symbiote-image');
    expect(descriptor.props.source).toEqual([{ uri: 'http://x/a.png', scale: 2 }]);
  });

  it('passes an already-array source through the resolver untouched in shape', () => {
    const sources = [{ uri: 'http://x/a.png' }, { uri: 'http://x/a@2x.png' }];
    const descriptor = renderImage(baseView({ source: sources }));
    expect(descriptor.props.source).toEqual(sources);
  });

  // why: renderImage must never crash a caller that hasn't resolved an asset yet (e.g. a
  // conditionally-loaded image) — RN's own Image degrades to no source rather than throwing.
  it('resolves to an empty source array when source/src/srcSet are all absent', () => {
    const descriptor = renderImage(baseView());
    expect(descriptor.props.source).toEqual([]);
  });

  it('folds `src` into a single-element source array', () => {
    const descriptor = renderImage(baseView({ src: 'http://x/b.png', width: 10, height: 20 }));
    expect(descriptor.props.source).toEqual([
      { uri: 'http://x/b.png', width: 10, height: 20, headers: {} },
    ]);
  });

  it('expands `srcSet` into scaled sources and prefers srcSet over src/source', () => {
    const descriptor = renderImage(
      baseView({ src: 'http://x/fallback.png', srcSet: 'http://x/1x.png 1x, http://x/2x.png 2x' }),
    );
    expect(descriptor.props.source).toEqual([
      expect.objectContaining({ uri: 'http://x/1x.png', scale: 1 }),
      expect.objectContaining({ uri: 'http://x/2x.png', scale: 2 }),
    ]);
  });

  // why: srcSet's own 1x slot, when present, must win over the `src` fallback — falling back to
  // `src` too would silently double-resolve the default scale to two different URIs.
  it('does not fall back to `src` for the default scale when srcSet already covers 1x', () => {
    const descriptor = renderImage(
      baseView({ src: 'http://x/should-not-appear.png', srcSet: 'http://x/1x.png 1x' }),
    );
    expect(descriptor.props.source).toEqual([expect.objectContaining({ uri: 'http://x/1x.png' })]);
  });

  // why: srcSet omitting the 1x slot must still get a default-scale source — from `src` — or a
  // caller who wrote only 2x/3x entries loses the base image entirely.
  it('falls back to `src` for the default scale when srcSet has no 1x entry', () => {
    const descriptor = renderImage(
      baseView({ src: 'http://x/base.png', srcSet: 'http://x/2x.png 2x' }),
    );
    expect(descriptor.props.source).toEqual([
      expect.objectContaining({ uri: 'http://x/2x.png', scale: 2 }),
      expect.objectContaining({ uri: 'http://x/base.png', scale: 1 }),
    ]);
  });

  // why: a malformed descriptor entry (no trailing 'x') must be dropped rather than silently
  // misinterpreted as a scale — RN's own parser warns and skips, this mirrors that fail-safe.
  it('skips a srcSet entry whose scale token has no trailing "x"', () => {
    const descriptor = renderImage(baseView({ srcSet: 'http://x/bad.png 2, http://x/ok.png 2x' }));
    expect(descriptor.props.source).toEqual([expect.objectContaining({ uri: 'http://x/ok.png' })]);
  });

  // why: the twin malformed case — a trailing 'x' but a non-numeric scale — must also be dropped,
  // not turned into a NaN scale that would corrupt native's decode-time downsampling.
  it('skips a srcSet entry whose scale token is non-numeric', () => {
    const descriptor = renderImage(baseView({ srcSet: 'http://x/bad.png abcx, http://x/ok.png 2x' }));
    expect(descriptor.props.source).toEqual([expect.objectContaining({ uri: 'http://x/ok.png' })]);
  });
});

describe('renderImage — header aliases (Positive)', () => {
  // why: crossOrigin/referrerPolicy are W3C-style aliases that must reach native as request
  // headers on the resolved source, not as raw passthrough props Fabric wouldn't understand.
  it('adds a credentials header onto an `src`-resolved source when crossOrigin is use-credentials', () => {
    const descriptor = renderImage(
      baseView({ src: 'http://x/c.png', crossOrigin: 'use-credentials' }),
    );
    expect(descriptor.props.source).toEqual([
      expect.objectContaining({
        uri: 'http://x/c.png',
        headers: { 'Access-Control-Allow-Credentials': 'true' },
      }),
    ]);
  });

  it('adds a Referrer-Policy header onto an `src`-resolved source', () => {
    const descriptor = renderImage(baseView({ src: 'http://x/d.png', referrerPolicy: 'no-referrer' }));
    expect(descriptor.props.source).toEqual([
      expect.objectContaining({ uri: 'http://x/d.png', headers: { 'Referrer-Policy': 'no-referrer' } }),
    ]);
  });

  // why: `anonymous` (the RN default) must NOT add the credentials header — only the explicit
  // `use-credentials` opt-in does, or every image would leak credentials by default.
  it('adds no credentials header when crossOrigin is anonymous', () => {
    const descriptor = renderImage(baseView({ src: 'http://x/e.png', crossOrigin: 'anonymous' }));
    expect(descriptor.props.source).toEqual([
      expect.objectContaining({ uri: 'http://x/e.png', headers: {} }),
    ]);
  });

  // why: the same header fold must also apply to a plain object `source` (not just `src`) when it
  // resolves to a single `{uri}` object — matching RN's `source.uri && headers` branch.
  it('merges headers onto a single-object `source` resolved via the resolver, not just `src`', () => {
    const descriptor = renderImage(
      baseView({ source: { uri: 'http://x/f.png' }, crossOrigin: 'use-credentials' }),
    );
    expect(descriptor.props.source).toEqual([
      expect.objectContaining({
        uri: 'http://x/f.png',
        headers: { 'Access-Control-Allow-Credentials': 'true' },
      }),
    ]);
  });

  // why: the header merge is keyed on the resolved shape carrying a `uri` string — an already-array
  // source (multiple scales) must NOT be mutated with a top-level headers field it has no slot for.
  it('does not merge headers onto an already-array source', () => {
    const sources = [{ uri: 'http://x/g.png' }, { uri: 'http://x/g@2x.png' }];
    const descriptor = renderImage(baseView({ source: sources, crossOrigin: 'use-credentials' }));
    expect(descriptor.props.source).toEqual(sources);
  });
});

describe('renderImage — style folds (Positive)', () => {
  it('folds width/height aliases into style, with explicit style winning', () => {
    const descriptor = renderImage(
      baseView({ width: 10, height: 20, style: { width: 99 }, source: 1 }),
    );
    expect(descriptor.props.style).toEqual([{ width: 10, height: 20 }, { width: 99 }]);
  });

  // why: the fold is skipped ENTIRELY (not folded with undefined values) when neither width nor
  // height is set — a caller styling purely through `style` must get its object back unmodified,
  // not wrapped in a throwaway array.
  it('leaves style untouched when neither width nor height is set', () => {
    const style = { flex: 1 };
    const descriptor = renderImage(baseView({ style, source: 1 }));
    expect(descriptor.props.style).toBe(style);
  });

  it('reads resizeMode/tintColor out of a flattened style when not passed explicitly', () => {
    const style: ILegacyImageStyle = { resizeMode: 'contain', tintColor: 'red' };
    const descriptor = renderImage(baseView({ source: 1, style }));
    expect(descriptor.props.resizeMode).toBe('contain');
    expect(descriptor.props.tintColor).toBe('red');
  });

  it('an explicit resizeMode/tintColor prop wins over the style-derived one', () => {
    const style: ILegacyImageStyle = { resizeMode: 'contain' };
    const descriptor = renderImage(baseView({ source: 1, resizeMode: 'cover', style }));
    expect(descriptor.props.resizeMode).toBe('cover');
  });
});

describe('renderImage — alt / accessibility fold (Positive)', () => {
  it('folds `alt` into accessibilityLabel and marks the image accessible', () => {
    const descriptor = renderImage(baseView({ source: 1, alt: 'a cat' }));
    expect(descriptor.props.accessibilityLabel).toBe('a cat');
    expect(descriptor.props.accessible).toBe(true);
  });

  it('an explicit accessibilityLabel in passthrough wins over `alt`', () => {
    const descriptor = renderImage(
      baseView({ source: 1, alt: 'a cat', passthrough: { accessibilityLabel: 'explicit' } }),
    );
    expect(descriptor.props.accessibilityLabel).toBe('explicit');
  });
});

describe('renderImage — secondary sources (Positive)', () => {
  it('resolves loadingIndicatorSource to a bare uri string, not the array shape', () => {
    const descriptor = renderImage(
      baseView({ source: 1, loadingIndicatorSource: { uri: 'http://x/spinner.png' } }),
    );
    expect(descriptor.props.loadingIndicatorSrc).toBe('http://x/spinner.png');
  });

  // why: defaultSource (the Android placeholder shown while the main source loads) must go
  // through the SAME resolver + array-normalization as the main source — a raw asset id would
  // otherwise reach native unresolved.
  it('resolves defaultSource through the installed resolver into the array shape', () => {
    setImageSourceResolver(source => ({ ...(source as object), scale: 3 }));
    const descriptor = renderImage(
      baseView({ source: 1, defaultSource: { uri: 'http://x/placeholder.png' } }),
    );
    expect(descriptor.props.defaultSource).toEqual([{ uri: 'http://x/placeholder.png', scale: 3 }]);
  });

  it('omits defaultSource entirely when not provided', () => {
    const descriptor = renderImage(baseView({ source: 1 }));
    expect('defaultSource' in descriptor.props).toBe(false);
  });
});
