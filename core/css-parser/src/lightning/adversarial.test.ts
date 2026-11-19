// Attacks on the compiler: stylesheets from a package or a server that nobody reviewed
import { describe, expect, it, vi } from 'vitest';
import { compileCssToRules } from './rules.ts';

const SLOW_MS = 5_000;

function compile(css: string) {
  return compileCssToRules(css, { filename: 'adversarial.css' });
}

function elapsedMs(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

function nestedMedia(depth: number): string {
  return `${'@media (min-width: 1px) { '.repeat(depth)}.a { color: red }${' }'.repeat(depth)}`;
}

describe('a hostile stylesheet', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it.each([10, 100])(
    'compiles %i levels of nested `@media` in bounded time',
    depth => {
      expect(elapsedMs(() => compile(nestedMedia(depth)))).toBeLessThan(
        SLOW_MS,
      );
    },
  );

  it('names the file when nesting overflows the stack of `lightningcss`', () => {
    expect(() => compile(nestedMedia(500))).toThrow(
      /adversarial\.css: .*nest too deeply/,
    );
  });

  it('keeps a nested `@media` as one condition per level of `and`', () => {
    const { rules, conditions } = compile(nestedMedia(3));

    expect(rules).toHaveLength(1);
    expect(conditions).toHaveLength(1);
  });

  it('compiles a long `and` chain in one query in bounded time', () => {
    const query = Array.from({ length: 2_000 }, () => '(min-width: 1px)').join(
      ' and ',
    );

    expect(
      elapsedMs(() => compile(`@media ${query} { .a { color: red } }`)),
    ).toBeLessThan(SLOW_MS);
  });

  it('compiles a long comma list in one query in bounded time', () => {
    const query = Array.from(
      { length: 2_000 },
      (_, at) => `(min-width: ${at}px)`,
    ).join(', ');

    expect(
      elapsedMs(() => compile(`@media ${query} { .a { color: red } }`)),
    ).toBeLessThan(SLOW_MS);
  });

  it('compiles ten thousand distinct `@media` rules in bounded time', () => {
    const css = Array.from(
      { length: 10_000 },
      (_, at) => `@media (min-width: ${at}px) { .a${at} { color: red } }`,
    ).join('\n');

    expect(elapsedMs(() => compile(css))).toBeLessThan(SLOW_MS * 2);
  });

  it('shares one condition between rules that carry the same query', () => {
    const css = Array.from(
      { length: 1_000 },
      (_, at) => `@media (min-width: 600px) { .a${at} { color: red } }`,
    ).join('\n');

    expect(compile(css).conditions).toHaveLength(1);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'compiles a class named `%s` like any other and leaves the prototype alone',
    name => {
      const { rules } = compile(`.${name} { padding: 4px }`);

      expect(rules).toHaveLength(1);
      expect(Object.keys(Object.prototype)).toEqual([]);
      expect(Reflect.get({}, 'padding')).toBe(undefined);
    },
  );

  it.each(['--__proto__', '--constructor', '--length'])(
    'compiles a custom property named `%s` without touching the prototype',
    name => {
      compile(`:root { ${name}: 1px } .a { width: var(${name}) }`);

      expect(Object.keys(Object.prototype)).toEqual([]);
    },
  );

  it('compiles three thousand `@property` rules in bounded time', () => {
    const css = Array.from(
      { length: 3_000 },
      (_, at) =>
        `@property --p${at} {\n  syntax: '<length>';\n  inherits: true;\n  initial-value: 0px;\n}`,
    ).join('\n');

    const spent = elapsedMs(() => {
      expect(compile(css).properties).toHaveLength(3_000);
    });

    expect(spent).toBeLessThan(SLOW_MS);
  });

  it.each(['a}b', 'a;b', 'a/*b'])(
    'keeps the string %s whole in an initial value',
    text => {
      const { properties } = compile(
        `@property --s {\n  syntax: '<string>';\n  inherits: true;\n  initial-value: "${text}";\n}`,
      );

      expect(properties).toEqual([
        {
          name: '--s',
          syntax: '<string>',
          inherits: true,
          initialValue: `"${text}"`,
        },
      ]);
    },
  );

  it('survives an unterminated block, string and comment', () => {
    expect(() =>
      compile('@media (min-width: 1px) { .a { color: red'),
    ).not.toThrow();
    expect(() => compile('.a { content: "abc')).not.toThrow();
    expect(() => compile('/* never closed .a { color: red }')).not.toThrow();
  });

  it('survives a multi megabyte declaration value in bounded time', () => {
    const css = `.a { --big: ${'x'.repeat(5_000_000)}; width: var(--big, 1px) }`;

    expect(elapsedMs(() => compile(css))).toBeLessThan(SLOW_MS);
  });
});
