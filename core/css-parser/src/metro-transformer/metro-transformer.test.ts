// Co-located unit test: createCssMetroTransformer is the ready-made wrapper every adapter's
// metro-css-parser.cjs re-exports (adapters/{react,vue,angular}/metro-css-parser.cjs) — a
// consuming app's own metro-css-transformer.js just calls this with its resolved upstream
// transformer, instead of hand-rolling the "compile .css, delegate everything else" branch.
//
// No Negative group: the transformer itself never throws for a recognized/unrecognized filename
// (both are valid branches); a malformed style source's rejection is compileCssFile's own
// contract, already covered in metro-css-module.test.ts and preprocessors.test.ts — retesting it
// here would only re-prove the `await` propagates a rejection, not add new coverage. `.less`/
// `.styl`/`.sass` recognition is isStyleFile's own contract (preprocessors.ts), exercised in
// preprocessors.test.ts; only `.css`/`.scss` are re-driven here since this file's job is the
// WRAPPING behavior (filename suffixing, param passthrough, upstream delegation), not
// re-enumerating every recognized extension a second time.

import { describe, expect, it, vi } from 'vitest';
import { createCssMetroTransformer } from './index';

function fakeUpstream() {
  return {
    transform: vi.fn((params: { filename: string; src: string }) => ({ received: params })),
    getCacheKey: vi.fn(() => 'cache-key'),
  };
}

describe('createCssMetroTransformer', () => {
  it('compiles a .css file before handing it to the upstream transformer', async () => {
    const upstream = fakeUpstream();
    const transformer = createCssMetroTransformer(upstream);

    await transformer.transform({ filename: 'theme.css', src: '.card { padding: 10px; }' });

    expect(upstream.transform).toHaveBeenCalledTimes(1);
    const forwarded = upstream.transform.mock.calls[0]?.[0] as { filename: string; src: string };
    expect(forwarded.filename).toBe('theme.css.js');
    expect(forwarded.src).toContain('registerStyles(');
  });

  it('compiles a .scss file before handing it to the upstream transformer', async () => {
    const upstream = fakeUpstream();
    const transformer = createCssMetroTransformer(upstream);

    await transformer.transform({
      filename: 'theme.scss',
      src: '.card { .title { padding: 10px; } }',
    });

    expect(upstream.transform).toHaveBeenCalledTimes(1);
    const forwarded = upstream.transform.mock.calls[0]?.[0] as { filename: string; src: string };
    expect(forwarded.filename).toBe('theme.scss.js');
    expect(forwarded.src).toContain('registerStyles(');
    expect(forwarded.src).toContain('cardTitle');
  });

  // why: a .module.css file's compiled output (an `export default` name map, not just
  // registerStyles) must reach the upstream transformer just like a plain style file's does — the
  // wrapper must not special-case away the module branch.
  it('compiles a .module.css file, forwarding its default-export map to the upstream transformer', async () => {
    const upstream = fakeUpstream();
    const transformer = createCssMetroTransformer(upstream);

    await transformer.transform({ filename: 'Card.module.css', src: '.card { padding: 10px; }' });

    const forwarded = upstream.transform.mock.calls[0]?.[0] as { filename: string; src: string };
    expect(forwarded.filename).toBe('Card.module.css.js');
    expect(forwarded.src).toContain('export default');
  });

  // why: Metro's own transform params carry more than filename/src (options, config…) — the
  // wrapper must forward everything it was given, not just the two fields it reads, or an app
  // relying on Metro's other transform-time context would silently lose it.
  it('preserves every other param field it was given, not just filename/src', async () => {
    const upstream = fakeUpstream();
    const transformer = createCssMetroTransformer(upstream);

    await transformer.transform({
      filename: 'theme.css',
      src: '.card {}',
      options: { dev: true },
    });

    const forwarded = upstream.transform.mock.calls[0]?.[0] as { options: unknown };
    expect(forwarded.options).toEqual({ dev: true });
  });

  it('passes a non-style file straight through unmodified', async () => {
    const upstream = fakeUpstream();
    const transformer = createCssMetroTransformer(upstream);

    await transformer.transform({ filename: 'App.tsx', src: 'export default 1;' });

    expect(upstream.transform).toHaveBeenCalledWith({
      filename: 'App.tsx',
      src: 'export default 1;',
    });
  });

  it('surfaces the upstream getCacheKey unchanged', () => {
    const upstream = fakeUpstream();
    const transformer = createCssMetroTransformer(upstream);

    expect(transformer.getCacheKey).toBe(upstream.getCacheKey);
  });

  it('resolves @react-native/metro-babel-transformer itself when no upstream is given', () => {
    // A real transform() call needs a full Metro transform-worker context (projectRoot, config…)
    // that only Metro itself constructs — resolving without throwing is what this guards against
    // the app-local `paths`-anchored require.resolve workaround this replaces.
    const transformer = createCssMetroTransformer();

    expect(typeof transformer.getCacheKey).toBe('function');
  });
});
