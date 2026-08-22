// Co-located unit test: compileCssFile is the framework-agnostic twin of the Vue SFC
// transformer's inline <style>/<style module> handling — a plain .css file registers globally
// (no default export), a .module.css file always scopes its classes and exports a name->
// scopedName map any adapter can pass through resolveClassName.
//
// No Negative group: isCssModuleFile is a total string predicate and compileCssFile's own
// failure mode (a malformed preprocessor source rejecting) is preprocessors.ts's contract,
// exercised in preprocessors.test.ts and generate-dts.test.ts (which shares this same compile
// step) — duplicating it here would only re-prove compile() propagates its rejection, already
// covered by both. `.module.sass`/plain `.sass` compilation is intentionally not re-exercised
// here either: `sass` is a plain alias of the same `compileScss` function the `.scss` cases below
// already drive (see preprocessors.ts), so a dedicated `.sass` case would only re-confirm
// detectLanguage's extension mapping, already proven by the isCssModuleFile recognition test.

import { describe, expect, it } from 'vitest';
import { compileCssFile, isCssModuleFile } from './index';

function extractRegisteredRules(code: string): Array<Record<string, unknown>> {
  const match = code.match(/registerRules\((\[.*\])\);/);
  if (!match?.[1])
    throw new Error('no registerRules(...) call found in compiled output');
  return JSON.parse(match[1]) as Array<Record<string, unknown>>;
}

// A rule carries the class-token SET its selector was written with, so the style is keyed here by
// those tokens joined with a space — the same string the markup puts in the class prop. Most cells
// only care about that pairing; the two that pin the whole rule shape read
// extractRegisteredRules directly.
function stylesByTokens(code: string): Record<string, unknown> {
  const byTokens: Record<string, unknown> = {};
  for (const { tokens, style } of extractRegisteredRules(code)) {
    if (!Array.isArray(tokens)) throw new Error('a rule carries no token list');
    byTokens[tokens.join(' ')] = style;
  }
  return byTokens;
}

function extractDefaultExport(code: string): Record<string, string> {
  const match = code.match(/export default (\{[\s\S]*?\});/);
  if (!match?.[1])
    throw new Error('no default export found in compiled output');
  return JSON.parse(match[1]) as Record<string, string>;
}

describe('isCssModuleFile', () => {
  it('recognizes the .module.css extension only', () => {
    expect(isCssModuleFile('Card.module.css')).toBe(true);
    expect(isCssModuleFile('Card.css')).toBe(false);
  });

  it('recognizes a .module.* preprocessor extension the same way', () => {
    expect(isCssModuleFile('Card.module.scss')).toBe(true);
    expect(isCssModuleFile('Card.module.sass')).toBe(true);
    expect(isCssModuleFile('Card.module.less')).toBe(true);
    expect(isCssModuleFile('Card.module.styl')).toBe(true);
    expect(isCssModuleFile('Card.scss')).toBe(false);
  });

  // why: path.extname returns '' for an extensionless path — the guard must short-circuit false
  // rather than let `''.slice(0, -0)` (a no-op slice) accidentally match on the whole filename.
  it('is false for a filename with no extension at all', () => {
    expect(isCssModuleFile('theme')).toBe(false);
  });
});

describe('compileCssFile — plain .css', () => {
  it('registers classes globally with no default export', async () => {
    const { code } = await compileCssFile(
      '.card { padding: 10px; }',
      'theme.css',
    );

    expect(code).toContain("from '@symbiote-native/engine'");
    // The whole rule, not just its style: an exact-shape equality is also what catches
    // `combinators` leaking into the bundle (see the dedicated cell below).
    expect(extractRegisteredRules(code)).toEqual([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
    ]);
    expect(code).not.toContain('export default');
  });

  // why: a stylesheet with no class rules (a file that's only comments, or not yet written to)
  // must compile to a valid, empty registerRules() call, not crash the Metro transform.
  it('compiles an empty stylesheet to an empty registerRules() call', async () => {
    const { code } = await compileCssFile('', 'empty.css');
    expect(extractRegisteredRules(code)).toEqual([]);
  });

  // why: a rule's `combinators` (one per gap between tokens) is compile-time-only — the registry
  // matches by token subset and never reads it — so shipping it would put a dead array in every
  // app bundle. A descendant selector is the one shape that has any to strip.
  it('strips `combinators` from every shipped rule', async () => {
    const { code } = await compileCssFile(
      '.card .title { padding: 10px; }',
      'theme.css',
    );

    for (const rule of extractRegisteredRules(code)) {
      expect(rule).not.toHaveProperty('combinators');
    }
  });
});

describe('compileCssFile — .module.css', () => {
  it('scopes every class and exports a name->scopedName map', async () => {
    const { code } = await compileCssFile(
      '.card { padding: 10px; }',
      'Card.module.css',
    );
    const classMap = extractDefaultExport(code);

    expect(Object.keys(classMap)).toEqual(['card']);
    expect(classMap.card).toMatch(/^card__module__[a-z0-9]+$/);
    expect(stylesByTokens(code)).toEqual({
      [classMap.card ?? '']: { padding: 10 },
    });
  });

  it('derives the same scope id for the same file path, a different one for a different path', async () => {
    const css = '.card { padding: 10px; }';
    const a1 = extractDefaultExport(
      (await compileCssFile(css, 'Card.module.css')).code,
    );
    const a2 = extractDefaultExport(
      (await compileCssFile(css, 'Card.module.css')).code,
    );
    const b = extractDefaultExport(
      (await compileCssFile(css, 'Other.module.css')).code,
    );

    expect(a1.card).toBe(a2.card);
    expect(a1.card).not.toBe(b.card);
  });

  it('does not scope a :global(...) selector', async () => {
    const { code } = await compileCssFile(
      ':global(.reset) { margin: 0; }',
      'Card.module.css',
    );

    expect(stylesByTokens(code)).toEqual({ reset: { margin: 0 } });
    // Exported as ITSELF, unsuffixed. lightningcss omits a global name (it renamed nothing, so it
    // has nothing to map) and so does every other CSS Modules implementation; we deliberately go
    // wider, because the omission would force the author to a bare `class="reset"` string literal
    // and lose the typed `styles.x` access this map exists for.
    expect(extractDefaultExport(code)).toEqual({ reset: 'reset' });
  });
});

describe('compileCssFile — standalone preprocessor files', () => {
  it('preprocesses a plain .scss file before registering it globally', async () => {
    const { code } = await compileCssFile(
      '.card { .title { padding: 10px; } }',
      'theme.scss',
    );

    // `.card .title` registers as the TOKEN SET it was written with, not as a name collapsed out
    // of it — the element carries both classes and the registry matches by subset.
    expect(stylesByTokens(code)).toEqual({
      'card title': { padding: 10 },
    });
    expect(code).not.toContain('export default');
  });

  it('preprocesses a .module.scss file and scopes its classes', async () => {
    const { code } = await compileCssFile(
      '.card { padding: 10px; }',
      'Card.module.scss',
    );
    const classMap = extractDefaultExport(code);

    expect(classMap.card).toMatch(/^card__module__[a-z0-9]+$/);
    expect(stylesByTokens(code)).toEqual({
      [classMap.card ?? '']: { padding: 10 },
    });
  });

  it('preprocesses a .less file', async () => {
    const { code } = await compileCssFile(
      '@spacing: 10px;\n.card { padding: @spacing; }',
      'theme.less',
    );
    expect(stylesByTokens(code)).toEqual({ card: { padding: 10 } });
  });

  it('preprocesses a .styl file', async () => {
    const { code } = await compileCssFile(
      '.card\n  padding 10px\n',
      'theme.styl',
    );
    expect(stylesByTokens(code)).toEqual({ card: { padding: 10 } });
  });
});

// A token appearing ONLY inside a compound selector still has to reach the export map, or the
// author cannot write the markup the compound rule was authored to match: `styles.loud` would be
// `undefined` and the element would carry the string "undefined" as a class. Measured 2026-08-19
// — it was missing, which made every `.a.b` rule in a `.module.css` unusable even after the
// runtime learned to resolve the key. lightningcss renames per token and exports every class the
// author actually wrote — the collapsed `badgeLoud` key is ours, not a class in the source, and
// is no longer exported: the markup spelling is `${styles.badge} ${styles.loud}`.
describe('compound-only tokens reach the export map', () => {
  it('exports a token that has no standalone rule', async () => {
    const compiled = await compileCssFile(
      '.badge { border-color: grey } .badge.loud { border-color: red }',
      '/app/Card.module.css',
    );
    const classMap = extractDefaultExport(compiled.code);

    expect(Object.keys(classMap).sort()).toEqual(['badge', 'loud']);
    expect(classMap.loud).toMatch(/^loud__module__[a-z0-9]+$/);
  });

  it('scopes it with the SAME id as the tokens that do have rules', async () => {
    // Two tokens carrying different suffixes have no single scope to factor out, so the compound
    // key rebuilt at runtime would never match.
    const compiled = await compileCssFile(
      '.badge { border-color: grey } .badge.loud { border-color: red }',
      '/app/Card.module.css',
    );
    const classMap = extractDefaultExport(compiled.code);
    const scopeOf = (token: string): string =>
      token.slice(token.indexOf('__module__'));

    expect(scopeOf(classMap.loud)).toBe(scopeOf(classMap.badge));
  });

  it('leaves a :global() token unscoped even when it is compound-only', async () => {
    // The escape hatch names markup this file does not own; suffixing it breaks the match it was
    // reaching for.
    const compiled = await compileCssFile(
      '.card :global(.reset) { margin: 3px }',
      '/app/Card.module.css',
    );
    const classMap = extractDefaultExport(compiled.code);

    // `reset` stays unsuffixed in the rule's token set while `card` carries the scope, so the
    // rule still matches an element whose second class came from outside this file.
    expect(Object.keys(stylesByTokens(compiled.code))).toEqual([
      `${classMap.card} reset`,
    ]);
    expect(classMap.card).toMatch(/^card__module__[a-z0-9]+$/);
  });
});
