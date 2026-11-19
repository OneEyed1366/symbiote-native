// The wpt container query parsing tables, run through our compiler
// Conditions come from at-container-parsing, the container properties from their own files
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { evaluateMedia } from '../../../engine/src/style-registry/media-evaluate.ts';
import { compileCssToRules } from './rules.ts';

type IPair = readonly [string, string];
type ITriple = readonly [string, string, string];

const CORPUS: {
  conditions: IPair[];
  rules: IPair[];
  properties: ITriple[];
  names: IPair[];
} = JSON.parse(
  readFileSync(
    new URL('./wpt-container-queries.json', import.meta.url),
    'utf8',
  ),
);

// Skipped until lightningcss parses a comma list of containers
const isCommaList = (query: string) =>
  query.includes(',') && !query.startsWith('container');

// A rule with only names has no condition, so the compiler drops it like a broken one
const isNameOnly = (query: string) => !query.includes('(');

// A class rule has no parent style to read, so `inherit` and `revert` are dropped with a warning
const isParentKeyword = (value: string) => /^(inherit|revert)$/.test(value);

function compile(css: string) {
  return compileCssToRules(css, { filename: 'wpt-container.css' });
}

function keepsRule(prelude: string): boolean {
  return (
    compile(`@container ${prelude} { .a { color: red } }`).rules.length === 1
  );
}

function keepsDeclaration(property: string, value: string): boolean {
  return compile(`.a { ${property}: ${value} }`).rules.length === 1;
}

// size-feature-evaluation.html, horizontal writing mode, a container 100px wide and 200px tall
const SIZE_EVALUATION: ReadonlyArray<readonly [string, boolean]> = [
  ['(width < 100px)', false],
  ['(width >= 100px)', true],
  ['(min-width: 100px)', true],
  ['(min-width: 101px)', false],
  ['(max-width: 100px)', true],
  ['(max-width: 99px)', false],
  ['(height < 200px)', false],
  ['(height >= 200px)', true],
  ['(min-height: 200px)', true],
  ['(min-height: 201px)', false],
  ['(max-height: 200px)', true],
  ['(max-height: 199px)', false],
  ['(inline-size < 100px)', false],
  ['(inline-size >= 100px)', true],
  ['(min-inline-size: 100px)', true],
  ['(min-inline-size: 101px)', false],
  ['(max-inline-size: 100px)', true],
  ['(max-inline-size: 99px)', false],
  ['(block-size < 200px)', false],
  ['(block-size >= 200px)', true],
  ['(min-block-size: 200px)', true],
  ['(min-block-size: 201px)', false],
  ['(max-block-size: 200px)', true],
  ['(max-block-size: 199px)', false],
  ['(orientation: landscape)', false],
  ['(orientation: portrait)', true],
  ['(aspect-ratio: 1/2)', true],
  ['(aspect-ratio: 2/1)', false],
];

const WINDOW = {
  width: 390,
  height: 844,
  resolution: 3,
  orientation: 'portrait',
  'prefers-color-scheme': 'light',
  'prefers-reduced-motion': 'no-preference',
  'prefers-contrast': 'no-preference',
  'prefers-reduced-transparency': 'no-preference',
  platform: 'ios',
  dir: 'ltr',
} as const;

function holdsInContainer(query: string): boolean {
  const { rules, conditions } = compile(
    `@container ${query} { .a { color: red } }`,
  );
  const cond = rules[0]?.cond;
  const condition = cond === undefined ? undefined : conditions[cond];
  if (condition === undefined) throw new Error(`${query} did not compile`);
  return evaluateMedia(condition, WINDOW, () => ({ width: 100, height: 200 }));
}

describe('wpt css-conditional container-queries parsing', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('keeps a known condition and drops an unknown or invalid one', () => {
    const failing = CORPUS.conditions.filter(
      ([kind, condition]) =>
        keepsRule(`name ${condition}`) !== (kind === 'known'),
    );

    expect(CORPUS.conditions.length).toBeGreaterThan(70);
    expect(failing).toEqual([]);
  });

  it('accepts a container name that is not reserved and drops a reserved one', () => {
    const failing = CORPUS.names.filter(
      ([kind, name]) => keepsRule(`${name} not (width)`) !== (kind === 'valid'),
    );

    expect(failing).toEqual([]);
  });

  it('drops a malformed prelude and keeps a valid one with a condition', () => {
    const checked = CORPUS.rules.filter(
      ([, query]) => !isCommaList(query) && !isNameOnly(query),
    );
    const failing = checked.filter(
      ([kind, query]) => keepsRule(query) !== (kind === 'valid'),
    );

    expect(checked.length).toBeGreaterThan(1);
    expect(failing).toEqual([]);
  });

  it('keeps a valid container property value and drops an invalid one', () => {
    const checked = CORPUS.properties.filter(row => !isParentKeyword(row[2]));
    const failing = checked.filter(
      ([kind, property, value]) =>
        keepsDeclaration(property, value) !== (kind === 'valid'),
    );

    expect(checked.length).toBeGreaterThan(80);
    expect(failing).toEqual([]);
  });

  it.each(SIZE_EVALUATION)(
    'evaluates %s against a 100 x 200 container as %s',
    (query, expected) => {
      expect(holdsInContainer(query)).toBe(expected);
    },
  );

  // container-selection-unknown-features.html: an unknown part never makes the rule apply
  it.each([
    '(width > 0px) or (foo: bar)',
    '(width > 0px) or foo(bar)',
    'style(--foo: bar) or (foo: bar)',
  ])('leaves a rule with the unknown part in `%s` unapplied', query => {
    expect(keepsRule(query)).toBe(false);
  });
});
