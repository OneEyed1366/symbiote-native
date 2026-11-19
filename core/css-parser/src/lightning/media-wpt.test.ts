// The wpt media query suite, `css/mediaqueries/test_media_queries.html`, run through our compiler
// A check holds when `@media <query>` compiles to a rule (or not) and evaluates as the browser says
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { evaluateMedia } from '../../../engine/src/style-registry/media-evaluate.ts';
import { compileCssToRules } from './rules.ts';

type ICheck = readonly [string, string, number, number];

const CORPUS: { checks: ICheck[] } = JSON.parse(
  readFileSync(new URL('./wpt-media-queries.json', import.meta.url), 'utf8'),
);

// The deprecated screen size, which the environment does not hold
const isDeviceFeature = ([, query]: ICheck) => query.includes('device-');

// Absolute units make a query unknown by decision 58
const isAbsoluteUnit = ([, query]: ICheck) =>
  /[0-9.](cm|mm|in|pt|pc|q)\b/i.test(query);

// An unknown query drops the rule like a broken one, so "parseable but unknown" cannot be seen
const isParseableOnly = ([check]: ICheck) =>
  check === 'expression_should_be_parseable';

// Features RN cannot answer drop the rule (decision 16)
const isUnanswerable = ([, query]: ICheck) =>
  /\b(min-|max-)?(color|monochrome|color-index|scan|grid|overflow-block|overflow-inline|update|hover|pointer|any-hover|any-pointer)\b/.test(
    query,
  );

// One unknown part drops the whole rule (decision 58), and `calc()` in a feature is unsupported
const isUnknownPart = ([, query]: ICheck) =>
  /unknown|badmedium|badexpression|badsyntax|calc\(/.test(query);

// lightningcss reads `(min-width)` as `(width)` and `> =` as `>=`, which the web calls unknown
const isLooselyParsed = ([, query]: ICheck) =>
  /\((min|max)-[a-z-]+\)|[<>] =/.test(query);

// The suite finds the device resolution by probing, which a stub harness cannot reproduce
const isProbedResolution = ([check, query]: ICheck) =>
  /resolution/.test(query) && check.startsWith('should_');

// Web error recovery inside a malformed comma list, which this compiler does not attempt
const isMalformedList = ([, query]: ICheck) =>
  /^,|,$|,,|\(\(\(|\($|[:(]$|\(grid$|\(orientation$/.test(query);

const LEFT_OUT = [
  isDeviceFeature,
  isAbsoluteUnit,
  isParseableOnly,
  isUnanswerable,
  isUnknownPart,
  isLooselyParsed,
  isProbedResolution,
  isMalformedList,
];

function conditionOf(query: string) {
  const { rules, conditions } = compileCssToRules(
    `@media ${query} { .a { color: red } }`,
    {
      filename: 'wpt-media.css',
    },
  );
  const cond = rules[0]?.cond;
  return cond === undefined ? undefined : conditions[cond];
}

function applies(query: string, width: number, height: number): boolean {
  const condition = conditionOf(query);
  if (condition === undefined) return false;
  return evaluateMedia(condition, {
    width,
    height,
    resolution: 1,
    orientation: height >= width ? 'portrait' : 'landscape',
    'prefers-color-scheme': 'light',
    'prefers-reduced-motion': 'no-preference',
    'prefers-contrast': 'no-preference',
    'prefers-reduced-transparency': 'no-preference',
    platform: 'ios',
    dir: 'ltr',
  });
}

function holds([check, query, width, height]: ICheck): boolean {
  const isParseable = conditionOf(query) !== undefined;
  switch (check) {
    case 'query_should_be_parseable':
      return isParseable;
    case 'query_should_not_be_parseable':
      return !isParseable;
    case 'should_apply':
    case 'expression_should_be_known':
      return applies(query, width, height);
    default:
      return !applies(query, width, height);
  }
}

describe('wpt css/mediaqueries test_media_queries', () => {
  it('holds for every check the ledger does not leave out', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kept = CORPUS.checks.filter(check =>
      LEFT_OUT.every(isLeftOut => !isLeftOut(check)),
    );
    const failing = kept
      .filter(check => !holds(check))
      .map(check => check.join(' | '));

    expect(kept.length).toBeGreaterThan(400);
    expect(failing).toEqual([]);
  });
});
