// Image's prop semantics, in the engine — the fourth behavior fold to move, and the FIRST whose
// rule does not move whole.
//
// WHY IT SPLITS, and the split is the interesting part. Everything Image does is a function of the
// tag except ONE step: `resolveAssetSource` turns the number `require('./logo.png')` returns into a
// `{uri, width, height, scale}` by asking METRO'S ASSET REGISTRY — a JS module populated at bundle
// time. There is no such table on this side of the wire and there should not be; it is the
// bundler's, not the platform's.
//
// So the asset lookup moves EARLIER instead of across: `routeProp` resolves the three source props
// on the way IN, exactly as it already resolves `boxShadow`/`filter`/`transform`
// (`structured-style.ts`), and for the identical reason — a value resolved at payload-build time is
// resolved HEADLESS ONLY, because the C++ builder has no JS to call. By the time the payload is
// built the bag holds resolved sources, and the rest of the rule is pure.
//
// WHAT MOVED: `srcSet` > `src` > `source` precedence, the W3C header decoration
// (`crossOrigin`/`referrerPolicy`), the `width`/`height` fold into style, `alt` becoming
// `accessibilityLabel` + `accessible`, `resizeMode`/`tintColor` falling back to style keys, and
// `loadingIndicatorSource` being plucked down to a bare `loadingIndicatorSrc` uri.
//
// NO TWIN: `mapImageProps` is deleted, not kept for the component path. Angular's `<Image>`
// component now hands its props to the tag instead of folding them itself, which is the browser
// model applied to our own last holdout.

import { registerImageBehavior } from '@symbiote-native/components';

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
const IMAGE_VIEW = 'RCTImageView';

registerImageBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

function commit(props: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(IMAGE_VIEW, false, 'image');
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('the image committed no payload');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

// A canonical string of the committed `source`: array order kept (native picks by scale), object
// keys sorted because a `folly::dynamic` object has no stable key order
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const entries = Object.entries({ ...value }).sort(([left], [right]) =>
    left < right ? -1 : 1,
  );
  const fields = entries.map(([key, held]) => key + ':' + canonical(held));
  return `{${fields.join(',')}}`;
}

const sourceOf = (payload: Readonly<Record<string, unknown>>): string =>
  canonical(payload.source);

describe('what an image sends native, resolved by the engine', () => {
  // why: THE PRICE. Every case below would pass with the rule still in a JS closure; this is the
  // one that says it moved.
  it('costs no trip into JS at all', () => {
    const plain = commit({ source: { uri: 'https://a/1.png' } });
    print(`DEBUG image folds=${plain.folds}`);
    print(`payload keys: ${Object.keys(plain.payload).sort().join(' ')}`);
    expect(plain.folds).toBe(0);

    const loaded = commit({
      srcSet: 'https://a/1.png 1x, https://a/2.png 2x',
      crossOrigin: 'use-credentials',
      alt: 'a logo',
      width: 40,
      height: 20,
    });
    expect(loaded.folds).toBe(0);
  });

  // why: native reads `source` and nothing else, always as an ARRAY. A bare object reaching Fabric
  // paints nothing and reports nothing — worse than an image that is simply absent.
  it('sends a plain source as the array shape native expects', () => {
    const payload = commit({ source: { uri: 'https://a/1.png' } }).payload;

    expect(sourceOf(payload)).toBe('[{uri:"https://a/1.png"}]');
  });

  // Без источника RN шлёт одну пустую запись, т.к. нативу нужны scale 1 и type remote
  it('sends one empty source for an image with none', () => {
    expect(sourceOf(commit({}).payload)).toBe('[{}]');
  });

  // why: ImageSourceUtils.js:81 — `src` is the W3C spelling and it wins over `source`. An app
  // migrating from the web writes `src` and would otherwise see nothing paint.
  it('prefers src over source, and carries the size hints with it', () => {
    const payload = commit({
      source: { uri: 'https://a/ignored.png' },
      src: 'https://a/used.png',
      width: 40,
      height: 20,
    }).payload;

    // `headers:{}` rides along even when empty, and that is upstream rather than ours:
    // ImageSourceUtils.js:82 pushes `{uri, headers, width, height}` unconditionally on the `src`
    // branch. Pinned so a future tidy-up of it is a deliberate divergence rather than a slip.
    expect(sourceOf(payload)).toBe(
      '[{headers:{},height:20,uri:"https://a/used.png",width:40}]',
    );
  });

  // why: ImageSourceUtils.js:48-79 — `srcSet` wins over both, each descriptor becomes its own
  // scaled source, and `src` fills the 1x slot only when the set omits it. Native picks by screen
  // scale, so a missing 1x is a blank image on a non-retina device.
  it('expands srcSet into scaled sources, with src as the 1x fallback', () => {
    const payload = commit({
      src: 'https://a/1x.png',
      srcSet: 'https://a/2x.png 2x, https://a/3x.png 3x',
    }).payload;

    expect(sourceOf(payload)).toBe(
      '[{headers:{},scale:2,uri:"https://a/2x.png"},' +
        '{headers:{},scale:3,uri:"https://a/3x.png"},' +
        '{headers:{},scale:1,uri:"https://a/1x.png"}]',
    );
  });

  // why: and when the set DOES carry a 1x, `src` is ignored — otherwise the same scale arrives
  // twice and which one native picks is undefined.
  it('drops src when srcSet already carries a 1x', () => {
    const payload = commit({
      src: 'https://a/other.png',
      srcSet: 'https://a/1x.png 1x, https://a/2x.png 2x',
    }).payload;

    expect(sourceOf(payload)).toBe(
      '[{headers:{},scale:1,uri:"https://a/1x.png"},' +
        '{headers:{},scale:2,uri:"https://a/2x.png"}]',
    );
  });

  // why: ImageSourceUtils.js:57-60 — a scale token that is not `<n>x` is SKIPPED rather than
  // guessed at. Guessing would fetch the wrong asset at the wrong density, silently.
  it('skips a srcSet entry whose scale token is not a scale', () => {
    const payload = commit({
      srcSet: 'https://a/ok.png 2x, https://a/bad.png 100w',
    }).payload;

    expect(sourceOf(payload)).toBe(
      '[{headers:{},scale:2,uri:"https://a/ok.png"}]',
    );
  });

  // An entry of `srcSet` with no descriptor is 1x
  it('reads a srcSet entry with no descriptor as 1x', () => {
    const payload = commit({
      srcSet: 'https://a/1.png, https://a/2.png 2x',
    }).payload;

    expect(sourceOf(payload)).toBe(
      '[{headers:{},scale:1,uri:"https://a/1.png"},' +
        '{headers:{},scale:2,uri:"https://a/2.png"}]',
    );
  });

  // RN режет запись по одиночному пробелу и берёт второй токен, лишние токены игнорируются
  it('reads the second space-separated token of a srcSet entry as the scale', () => {
    const payload = commit({ srcSet: 'https://a/2.png 2x extra' }).payload;

    expect(sourceOf(payload)).toBe(
      '[{headers:{},scale:2,uri:"https://a/2.png"}]',
    );
  });

  // Двойной пробел даёт пустой токен масштаба, он не кончается на `x`, запись пропускается
  it('skips a srcSet entry with an empty scale token', () => {
    const payload = commit({
      srcSet: 'https://a/2.png  2x, https://a/3.png 3x',
    }).payload;

    expect(sourceOf(payload)).toBe(
      '[{headers:{},scale:3,uri:"https://a/3.png"}]',
    );
  });

  // Пустая строка это одна запись с пустым uri и масштабом 1x, как `''.split(', ')` в RN
  it('keeps the empty entry of an empty srcSet', () => {
    const payload = commit({ srcSet: '' }).payload;

    expect(sourceOf(payload)).toBe('[{headers:{},scale:1,uri:""}]');
  });

  // `width` and `height` ride on every `srcSet` source, not only on the `src` shape
  it('carries width and height onto the srcSet sources', () => {
    const payload = commit({
      srcSet: 'https://a/2x.png 2x',
      width: 40,
      height: 20,
    }).payload;

    expect(sourceOf(payload)).toBe(
      '[{headers:{},height:20,scale:2,uri:"https://a/2x.png",width:40}]',
    );
  });

  // why: ImageSourceUtils.js:40-46 — the two W3C aliases are HTTP headers, not props. Without them
  // a credentialed image 401s and the failure looks like a broken URL.
  it('turns the W3C aliases into request headers', () => {
    const payload = commit({
      src: 'https://a/1.png',
      crossOrigin: 'use-credentials',
      referrerPolicy: 'no-referrer',
    }).payload;

    expect(sourceOf(payload)).toBe(
      '[{headers:{Access-Control-Allow-Credentials:"true",' +
        'Referrer-Policy:"no-referrer"},uri:"https://a/1.png"}]',
    );
  });

  // why: `anonymous` is the DEFAULT browser behaviour, so it contributes no header —
  // ImageSourceUtils.js:41 checks for `use-credentials` specifically.
  it('adds no credentials header for crossOrigin anonymous', () => {
    const payload = commit({
      src: 'https://a/1.png',
      crossOrigin: 'anonymous',
    }).payload;

    expect(sourceOf(payload)).toBe('[{headers:{},uri:"https://a/1.png"}]');
  });

  // why: a header-decorated single `source` object gets them merged in too (`:84`), so the aliases
  // work on the RN spelling and not only on the web one.
  it('merges headers into a single object source', () => {
    const payload = commit({
      source: { uri: 'https://a/1.png' },
      referrerPolicy: 'origin',
    }).payload;

    expect(sourceOf(payload)).toBe(
      '[{headers:{Referrer-Policy:"origin"},uri:"https://a/1.png"}]',
    );
  });

  // why: ImageProps.js:195,202 — `width`/`height` are style, not props, and an explicit style key
  // WINS. RN spells it `{width, height}, ...style`, so the aliases are the fallback.
  it('folds width and height into the style, under an explicit one', () => {
    const payload = commit({
      src: 'https://a/1.png',
      width: 40,
      height: 20,
      style: { height: 99 },
    }).payload;

    expect(payload.width).toBe(40);
    expect(payload.height).toBe(99);
  });

  // why: `alt` is the accessibility text (Image.ios.js / Image.android.js) — it sets
  // `accessibilityLabel` AND marks the image accessible, which is what puts it in the reader's
  // order at all. An explicit label still wins.
  it('makes alt the accessibility label, and the image accessible', () => {
    const payload = commit({ src: 'https://a/1.png', alt: 'a logo' }).payload;

    expect(payload.accessibilityLabel).toBe('a logo');
    expect(payload.accessible).toBe(true);
    expect(payload.alt).toBe(undefined);

    const labelled = commit({
      src: 'https://a/1.png',
      alt: 'a logo',
      accessibilityLabel: 'the real one',
    }).payload;
    expect(labelled.accessibilityLabel).toBe('the real one');
    expect(labelled.accessible).toBe(true);
  });

  // why: and an image with no `alt` must NOT be marked accessible — a decorative image announcing
  // itself is noise a screen-reader user cannot skip.
  it('leaves a source-only image out of the accessibility order', () => {
    const payload = commit({ src: 'https://a/1.png' }).payload;

    expect(payload.accessible).toBe(undefined);
  });

  // `aria-hidden` beats the accessible-true that `alt` forces, not the other way round
  it('lets aria-hidden override the accessible-true that alt would otherwise force', () => {
    const payload = commit({
      src: 'https://a/1.png',
      alt: 'decorative',
      'aria-hidden': true,
    }).payload;

    expect(payload.accessible).toBe(false);
  });

  // why: RN accepts `resizeMode` and `tintColor` as STYLE keys as well as props. Reading only the
  // prop drops a style that authors legitimately write.
  it('reads resizeMode and tintColor out of the style', () => {
    const payload = commit({
      src: 'https://a/1.png',
      style: { resizeMode: 'contain', tintColor: '#ff0000' },
    }).payload;

    expect(payload.resizeMode).toBe('contain');
    expect(payload.tintColor).toBe(0xff_ff_00_00);
  });

  // `Image.ios.js:141`: объект из `objectFit`, затем prop, затем ключ стиля, затем `cover`
  it('lets the resizeMode prop beat the style key', () => {
    const payload = commit({
      src: 'https://a/1.png',
      resizeMode: 'cover',
      style: { resizeMode: 'contain' },
    }).payload;

    expect(payload.resizeMode).toBe('cover');
  });

  it('defaults resizeMode to cover', () => {
    expect(commit({ src: 'https://a/1.png' }).payload.resizeMode).toBe('cover');
  });

  it('maps objectFit onto resizeMode ahead of the prop and the style key', () => {
    const payload = commit({
      src: 'https://a/1.png',
      resizeMode: 'center',
      style: { objectFit: 'fill', resizeMode: 'contain' },
    }).payload;

    expect(payload.resizeMode).toBe('stretch');
  });

  // why: Android's loading indicator is a bare uri STRING under a different name, not the array
  // shape the main source uses. Sending the array paints no placeholder and says nothing.
  it('plucks the loading indicator down to a bare uri', () => {
    const payload = commit({
      src: 'https://a/1.png',
      loadingIndicatorSource: { uri: 'https://a/spinner.gif' },
    }).payload;

    expect(payload.loadingIndicatorSrc).toBe('https://a/spinner.gif');
    expect(payload.loadingIndicatorSource).toBe(undefined);
  });

  // Native reads `defaultSource` as a bare map, the engine wraps every source in an array
  // So it gets the same unwrap as `loadingIndicatorSource`
  it('unwraps defaultSource to the bare object native expects', () => {
    const payload = commit({
      src: 'https://a/1.png',
      defaultSource: { uri: 'https://a/placeholder.png' },
    }).payload;

    expect(payload.defaultSource).toEqual({ uri: 'https://a/placeholder.png' });
    expect(Array.isArray(payload.defaultSource)).toBe(false);
  });

  // why: the consumed W3C names are not Fabric props. Leaving one in the payload is how a reader
  // concludes the rule ran when it did not.
  it('does not send the names it consumed', () => {
    const payload = commit({
      src: 'https://a/1.png',
      srcSet: 'https://a/2.png 2x',
      crossOrigin: 'use-credentials',
      referrerPolicy: 'origin',
      alt: 'a logo',
    }).payload;

    for (const key of [
      'src',
      'srcSet',
      'crossOrigin',
      'referrerPolicy',
      'alt',
    ]) {
      expect(payload[key]).toBe(undefined);
    }
  });

  // why: THE CONTROL. Every absence assertion above would be satisfied by a payload with no rule at
  // all, so pin that the same props on a behaviorless tag ride through untouched.
  it('folds nothing on a tag with no behavior', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement(IMAGE_VIEW, false, 'view');
    setProp(node, 'src', 'https://a/1.png');
    setProp(node, 'alt', 'a logo');
    surface.appendChild(node);
    surface.commit();
    mounted();

    const payload = committedPayloadOf(node);
    if (payload === undefined) throw new Error('nothing committed');
    expect(payload.src).toBe('https://a/1.png');
    expect(payload.alt).toBe('a logo');
    expect(payload.source).toBe(undefined);
    expect(payload.accessibilityLabel).toBe(undefined);
  });
});

// Image's render hands native its own subset of the aria aliases (`Image.ios.js:134-160`)
describe('the aria aliases an image reads', () => {
  const source = 'https://a/1.png';

  it('drops the aliases Image never reads', () => {
    const payload = commit({
      src: source,
      role: 'img',
      'aria-live': 'polite',
      'aria-modal': true,
      'aria-valuenow': 3,
    }).payload;

    expect(payload.accessibilityRole).toBe(undefined);
    expect(payload.accessibilityLiveRegion).toBe(undefined);
    expect(payload.accessibilityViewIsModal).toBe(undefined);
    expect(payload.accessibilityValue).toBe(undefined);
  });

  it('hides a non-alt image from accessibility with aria-hidden', () => {
    const payload = commit({
      src: source,
      accessible: true,
      'aria-hidden': true,
    }).payload;

    expect(payload.accessible).toBe(false);
  });

  it('still maps aria-label and the state aliases', () => {
    const payload = commit({
      src: source,
      'aria-label': 'x',
      'aria-busy': true,
    }).payload;

    expect(payload.accessibilityLabel).toBe('x');
    expect(
      typeof payload.accessibilityState === 'object'
        ? Reflect.get({ ...payload.accessibilityState }, 'busy')
        : undefined,
    ).toBe(true);
  });
});

report();
