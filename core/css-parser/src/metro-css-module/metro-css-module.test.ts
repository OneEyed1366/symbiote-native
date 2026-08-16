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

function extractRegisterStylesArg(code: string): Record<string, Record<string, unknown>> {
  const match = code.match(/registerStyles\((\{[\s\S]*?\})\);/);
  if (!match?.[1]) throw new Error('no registerStyles(...) call found in compiled output');
  return JSON.parse(match[1]) as Record<string, Record<string, unknown>>;
}

function extractDefaultExport(code: string): Record<string, string> {
  const match = code.match(/export default (\{[\s\S]*?\});/);
  if (!match?.[1]) throw new Error('no default export found in compiled output');
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
    const { code } = await compileCssFile('.card { padding: 10px; }', 'theme.css');

    expect(code).toContain("from '@symbiote-native/engine'");
    expect(extractRegisterStylesArg(code)).toEqual({ card: { padding: 10 } });
    expect(code).not.toContain('export default');
  });

  // why: a stylesheet with no class rules (a file that's only comments, or not yet written to)
  // must compile to a valid, empty registerStyles() call, not crash the Metro transform.
  it('compiles an empty stylesheet to an empty registerStyles() call', async () => {
    const { code } = await compileCssFile('', 'empty.css');
    expect(extractRegisterStylesArg(code)).toEqual({});
  });
});

describe('compileCssFile — .module.css', () => {
  it('scopes every class and exports a name->scopedName map', async () => {
    const { code } = await compileCssFile('.card { padding: 10px; }', 'Card.module.css');
    const classMap = extractDefaultExport(code);

    expect(Object.keys(classMap)).toEqual(['card']);
    expect(classMap.card).toMatch(/^card__module__[a-z0-9]+$/);
    expect(extractRegisterStylesArg(code)).toEqual({
      [classMap.card ?? '']: { padding: 10 },
    });
  });

  it('derives the same scope id for the same file path, a different one for a different path', async () => {
    const css = '.card { padding: 10px; }';
    const a1 = extractDefaultExport((await compileCssFile(css, 'Card.module.css')).code);
    const a2 = extractDefaultExport((await compileCssFile(css, 'Card.module.css')).code);
    const b = extractDefaultExport((await compileCssFile(css, 'Other.module.css')).code);

    expect(a1.card).toBe(a2.card);
    expect(a1.card).not.toBe(b.card);
  });

  it('does not scope a :global(...) selector', async () => {
    const { code } = await compileCssFile(':global(.reset) { margin: 0; }', 'Card.module.css');
    const classMap = extractDefaultExport(code);

    expect(classMap.reset).toBe('reset');
    expect(extractRegisterStylesArg(code)).toEqual({ reset: { margin: 0 } });
  });
});

describe('compileCssFile — standalone preprocessor files', () => {
  it('preprocesses a plain .scss file before registering it globally', async () => {
    const { code } = await compileCssFile('.card { .title { padding: 10px; } }', 'theme.scss');

    expect(extractRegisterStylesArg(code)).toEqual({ cardTitle: { padding: 10 } });
    expect(code).not.toContain('export default');
  });

  it('preprocesses a .module.scss file and scopes its classes', async () => {
    const { code } = await compileCssFile('.card { padding: 10px; }', 'Card.module.scss');
    const classMap = extractDefaultExport(code);

    expect(classMap.card).toMatch(/^card__module__[a-z0-9]+$/);
    expect(extractRegisterStylesArg(code)).toEqual({
      [classMap.card ?? '']: { padding: 10 },
    });
  });

  it('preprocesses a .less file', async () => {
    const { code } = await compileCssFile(
      '@spacing: 10px;\n.card { padding: @spacing; }',
      'theme.less',
    );
    expect(extractRegisterStylesArg(code)).toEqual({ card: { padding: 10 } });
  });

  it('preprocesses a .styl file', async () => {
    const { code } = await compileCssFile('.card\n  padding 10px\n', 'theme.styl');
    expect(extractRegisterStylesArg(code)).toEqual({ card: { padding: 10 } });
  });
});
