// Unit test for the SCSS/Sass, Less, and Stylus preprocessor layer. Each "real
// compile" case below drives the ACTUAL installed sass/less/stylus package (all three are
// devDependencies of this package, see package.json) rather than a mock, on purpose — a
// hand-ported mock of the compiler's output can pass while silently diverging from the real
// compiler's semantics (a pseudo-class edge case slipped through exactly that way once), so
// nesting/variables/mixins are verified against the real compiler output, then through the
// real (unmodified) compileCssToRules.
//
// Each preprocessor emits the SAME three selector shapes (`.card`, `.card .title`, `.card.active`),
// so the assertions read them back off `rules` by token list rather than by a flattened key.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { compileCssToRules } from '../lightning/rules.ts';

/** The style compiled for the rule whose selector names exactly `tokens`, in order. */
function styleFor(css: string, filename: string, tokens: readonly string[]) {
  const rule = compileCssToRules(css, { filename }).rules.find(
    candidate =>
      candidate.tokens.length === tokens.length &&
      candidate.tokens.every((token, index) => token === tokens[index]),
  );
  return rule?.style;
}
import {
  compileScss,
  compileSass,
  compileLess,
  compileStylus,
  compile,
  detectLanguage,
  isStyleFile,
} from './index';

describe('detectLanguage', () => {
  it('maps each recognized extension to its preprocessor language', () => {
    expect(detectLanguage('theme.css')).toBe('css');
    expect(detectLanguage('theme.scss')).toBe('scss');
    expect(detectLanguage('theme.sass')).toBe('scss');
    expect(detectLanguage('theme.less')).toBe('less');
    expect(detectLanguage('theme.styl')).toBe('stylus');
    expect(detectLanguage('theme.stylus')).toBe('stylus');
  });

  it('falls back to css for an unrecognized extension', () => {
    expect(detectLanguage('theme.txt')).toBe('css');
  });

  // why: Metro/the OS filesystem may hand this a mixed-case path (a case-insensitive filesystem,
  // or a filename literally typed uppercase) — the recognition table must match regardless.
  it('matches an uppercase extension the same as lowercase', () => {
    expect(detectLanguage('Theme.SCSS')).toBe('scss');
  });
});

describe('isStyleFile', () => {
  it('recognizes every preprocessor extension plus plain css', () => {
    for (const filename of [
      'a.css',
      'a.scss',
      'a.sass',
      'a.less',
      'a.styl',
      'a.stylus',
    ]) {
      expect(isStyleFile(filename)).toBe(true);
    }
  });

  it('rejects a non-style extension', () => {
    expect(isStyleFile('App.tsx')).toBe(false);
  });

  it('recognizes an uppercase extension the same as lowercase', () => {
    expect(isStyleFile('Theme.CSS')).toBe(true);
  });
});

describe('compileScss — nesting, variables, a mixin', () => {
  const SCSS_SOURCE = `
$primary: red;
$spacing: 10px;

@mixin padded($amount) {
  padding: $amount;
}

.card {
  @include padded($spacing);
  color: $primary;

  .title {
    font-weight: bold;
  }

  &.active {
    opacity: 1;
  }
}
`;

  it('compiles nesting, a variable, and a mixin down to plain CSS the compiler can read', async () => {
    const css = await compileScss(SCSS_SOURCE, 'Card.scss');
    expect(css).toContain('.card');
    expect(css).toContain('color: red');

    // `red` reads back as `#f00`: lightningcss canonicalizes a named color, so what the
    // preprocessor emitted as a keyword is compared after that normalization, not before.
    expect(styleFor(css, 'Card.scss', ['card'])).toEqual({
      padding: 10,
      color: '#f00',
    });
    expect(styleFor(css, 'Card.scss', ['card', 'title'])).toEqual({
      fontWeight: 'bold',
    });
    expect(styleFor(css, 'Card.scss', ['card', 'active'])).toEqual({
      opacity: 1,
    });
  });

  it('routes the indented syntax through .sass by file extension', async () => {
    const SASS_SOURCE = '.card\n  padding: 10px\n  color: red\n';
    const css = await compileSass(SASS_SOURCE, 'Card.sass');
    expect(styleFor(css, 'Card.sass', ['card'])).toEqual({
      padding: 10,
      color: '#f00',
    });
  });

  // why: filePath is optional (only used for loadPaths' relative @use/@import base and picking
  // indented-vs-SCSS syntax) — a caller compiling a source string with no file of its own (e.g. an
  // inline block a future adapter hands over directly) must still compile plain SCSS successfully.
  it('compiles without a filePath, defaulting to SCSS syntax with no import base', async () => {
    const css = await compileScss('.card { padding: 10px; }');
    expect(css).toContain('padding: 10px');
  });
});

describe('compileLess — nesting, variables, a mixin', () => {
  const LESS_SOURCE = `
@primary: red;
@spacing: 10px;

.padded(@amount) {
  padding: @amount;
}

.card {
  .padded(@spacing);
  color: @primary;

  .title {
    font-weight: bold;
  }

  &.active {
    opacity: 1;
  }
}
`;

  it('compiles nesting, a variable, and a mixin down to plain CSS the compiler can read', async () => {
    const css = await compileLess(LESS_SOURCE, 'Card.less');

    expect(styleFor(css, 'Card.less', ['card'])).toEqual({
      padding: 10,
      color: '#f00',
    });
    expect(styleFor(css, 'Card.less', ['card', 'title'])).toEqual({
      fontWeight: 'bold',
    });
    expect(styleFor(css, 'Card.less', ['card', 'active'])).toEqual({
      opacity: 1,
    });
  });
});

describe('compileStylus — nesting, variables, a function', () => {
  const STYLUS_SOURCE = [
    'primary = red',
    'spacing = 10px',
    '',
    'padded(amount)',
    '  padding amount',
    '',
    '.card',
    '  padded(spacing)',
    '  color primary',
    '',
    '  .title',
    '    font-weight bold',
    '',
    '  &.active',
    '    opacity 1',
    '',
  ].join('\n');

  it('compiles nesting, a bare-assignment variable, and a function down to plain CSS the compiler can read', async () => {
    const css = await compileStylus(STYLUS_SOURCE, 'Card.styl');

    // Stylus canonicalizes `red` -> `#f00` itself, where SCSS/Less leave the keyword; both land
    // on `#f00` here anyway, since lightningcss normalizes the color either way.
    expect(styleFor(css, 'Card.styl', ['card'])).toEqual({
      padding: 10,
      color: '#f00',
    });
    expect(styleFor(css, 'Card.styl', ['card', 'title'])).toEqual({
      fontWeight: 'bold',
    });
    expect(styleFor(css, 'Card.styl', ['card', 'active'])).toEqual({
      opacity: 1,
    });
  });
});

describe('compile — unified entry point', () => {
  it('passes plain CSS through unchanged', async () => {
    const css = await compile('.card { padding: 10px; }', 'css');
    expect(css).toBe('.card { padding: 10px; }');
  });

  it('dispatches to the right compiler for each language', async () => {
    expect(
      await compile('.card { padding: 10px; }', 'scss', 'Card.scss'),
    ).toContain('padding');
    expect(
      await compile('.card { padding: 10px; }', 'less', 'Card.less'),
    ).toContain('padding');
    expect(
      await compile('.card\n  padding 10px\n', 'stylus', 'Card.styl'),
    ).toContain('padding');
  });
});

describe('malformed source (Negative — the real compiler rejects, distinct from a missing package)', () => {
  // why: an author's actual syntax mistake (unclosed brace) must surface as a real compiler
  // error the Metro build fails loudly on — not get swallowed into empty/wrong CSS that ships
  // silently broken styles.
  it('compileScss rejects unclosed SCSS', async () => {
    await expect(
      compileScss('.card { padding: 10px', 'Card.scss'),
    ).rejects.toThrow();
  });

  it('compileLess rejects a syntax error', async () => {
    await expect(
      compileLess('.card { .padded(); }', 'Card.less'),
    ).rejects.toThrow();
  });

  it('compileStylus rejects a syntax error', async () => {
    await expect(
      compileStylus('.card\n  padding: : 10px\n', 'Card.styl'),
    ).rejects.toThrow();
  });
});

describe('missing-package errors', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws an install hint when sass is not installed', async () => {
    vi.doMock('sass', () => {
      throw new Error("Cannot find module 'sass'");
    });
    const { compileScss: compileScssFresh } = await import('./index');
    await expect(compileScssFresh('.card { padding: 10px; }')).rejects.toThrow(
      /sass is required for \.scss\/\.sass files\. Install it: npm i -D sass/,
    );
  });

  it('throws an install hint when less is not installed', async () => {
    vi.doMock('less', () => {
      throw new Error("Cannot find module 'less'");
    });
    const { compileLess: compileLessFresh } = await import('./index');
    await expect(compileLessFresh('.card { padding: 10px; }')).rejects.toThrow(
      /less is required for \.less files\. Install it: npm i -D less/,
    );
  });

  it('throws an install hint when stylus is not installed', async () => {
    vi.doMock('stylus', () => {
      throw new Error("Cannot find module 'stylus'");
    });
    const { compileStylus: compileStylusFresh } = await import('./index');
    await expect(compileStylusFresh('.card\n  padding 10px\n')).rejects.toThrow(
      /stylus is required for \.styl files\. Install it: npm i -D stylus/,
    );
  });
});
