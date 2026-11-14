// A query string parses into the `media` text of `matchMedia` and into the compiler's tuple tree
// The serialization cases are web-platform-tests `match-media-parsing`

import { describe, expect, it } from 'vitest';

import { parseMediaQueryList } from './parse-media-query';

function mediaOf(query: string): string {
  return parseMediaQueryList(query).text;
}

describe('the serialized form of a query list', () => {
  it.each([
    ['', ''],
    [' ', ''],
    ['all', 'all'],
    ['   all   ', 'all'],
    ['all,all', 'all, all'],
    [' all , all ', 'all, all'],
    ['(color)', '(color)'],
    ['(color', '(color)'],
    [' ( color  )  ', '(color)'],
    [' ( color   ', '(color)'],
    [' foo ', 'foo'],
    ['(min-resolution: 1x)', '(min-resolution: 1x)'],
    ['(resolution: 600dpi)', '(resolution: 600dpi)'],
    ['(aspect-ratio: 59/80)', '(aspect-ratio: 59 / 80)'],
    ['(width)', '(width)'],
    ['(min-width: calc(10px + 10em))', '(min-width: calc(10px + 10em))'],
    ['(width < max(10px, 10em))', '(width < max(10px, 10em))'],
  ])('reads %j as %j', (query, expected) => {
    expect(mediaOf(query)).toBe(expected);
  });

  it.each([
    ['color)', 'not all'],
    ['  color ), ( color', 'not all, (color)'],
    [',', 'not all, not all'],
    [' , ', 'not all, not all'],
    [',,', 'not all, not all, not all'],
    ['  ,  ,  ', 'not all, not all, not all'],
    [' foo,', 'foo, not all'],
  ])('turns the unreadable part of %j into `not all`', (query, expected) => {
    expect(mediaOf(query)).toBe(expected);
  });

  it('folds the case of names and units, and spaces the colon', () => {
    expect(mediaOf('(MIN-Width:600PX)')).toBe('(min-width: 600px)');
  });

  it('keeps a media type and drops a leading `all and`', () => {
    expect(mediaOf('screen and (color)')).toBe('screen and (color)');
    expect(mediaOf('all and (color)')).toBe('(color)');
    expect(mediaOf('not screen')).toBe('not screen');
  });
});

describe('the tuple tree of a query list', () => {
  it.each([
    ['(min-width: 600px)', ['>=', 'width', 600]],
    ['(max-height: 40em)', ['<=', 'height', 640]],
    ['(width: 320px)', ['=', 'width', 320]],
    ['(width >= 600px)', ['>=', 'width', 600]],
    ['(600px <= width)', ['>=', 'width', 600]],
    ['(min-resolution: 2dppx)', ['>=', 'resolution', 2]],
    ['(min-resolution: 192dpi)', ['>=', 'resolution', 2]],
    ['(orientation: landscape)', ['=', 'orientation', 'landscape']],
    ['(prefers-color-scheme: DARK)', ['=', 'prefers-color-scheme', 'dark']],
    ['screen and (min-width: 600px)', ['>=', 'width', 600]],
    ['only screen and (min-width: 600px)', ['>=', 'width', 600]],
    ['((min-width: 600px))', ['>=', 'width', 600]],
    ['(width)', ['>', 'width', 0]],
    ['(orientation)', ['&', []]],
    ['(prefers-reduced-motion)', ['!', ['=', 'prefers-reduced-motion', 'no-preference']]],
    ['(aspect-ratio: 59/80)', ['=', 'aspect-ratio', 59 / 80]],
    ['(min-aspect-ratio: 1 / 2)', ['>=', 'aspect-ratio', 0.5]],
    ['(max-aspect-ratio: 1/0)', ['<=', 'aspect-ratio', Number.MAX_VALUE]],
    ['(aspect-ratio >= 2)', ['>=', 'aspect-ratio', 2]],
    ['(1/2 < aspect-ratio < 2/1)', ['&', [['>', 'aspect-ratio', 0.5], ['<', 'aspect-ratio', 2]]]],
    ['(min-width: calc(10px + 10em))', ['>=', 'width', 170]],
    ['(width < max(10px, 10em))', ['<', 'width', 160]],
    ['(min-width: clamp(1px, 50em, 100px))', ['>=', 'width', 100]],
    ['(min-width: calc(min(10px, 20px) + (1em - 6px)))', ['>=', 'width', 20]],
    [
      '(calc(10px + 10em) < width < max(30px, 30em))',
      ['&', [['>', 'width', 170], ['<', 'width', 480]]],
    ],
  ])('reads %j', (query, expected) => {
    expect(parseMediaQueryList(query).condition).toEqual(expected);
  });

  it('joins `and` and `or` chains and a comma list', () => {
    expect(
      parseMediaQueryList('(min-width: 600px) and (max-width: 900px)').condition,
    ).toEqual(['&', [['>=', 'width', 600], ['<=', 'width', 900]]]);
    expect(
      parseMediaQueryList('(orientation: landscape) or (width > 900px)').condition,
    ).toEqual(['|', [['=', 'orientation', 'landscape'], ['>', 'width', 900]]]);
    expect(
      parseMediaQueryList('(orientation: landscape), not (prefers-color-scheme: dark)')
        .condition,
    ).toEqual([
      '|',
      [['=', 'orientation', 'landscape'], ['!', ['=', 'prefers-color-scheme', 'dark']]],
    ]);
  });

  it('reads an interval as two comparisons', () => {
    expect(parseMediaQueryList('(400px <= width <= 700px)').condition).toEqual([
      '&',
      [['>=', 'width', 400], ['<=', 'width', 700]],
    ]);
  });

  it('negates a query with `not`', () => {
    expect(parseMediaQueryList('not screen').condition).toEqual(['!', ['&', []]]);
    expect(parseMediaQueryList('not (width > 900px)').condition).toEqual([
      '!',
      ['>', 'width', 900],
    ]);
  });

  it('holds always for an empty list and never for an unreadable one', () => {
    expect(parseMediaQueryList('').condition).toEqual(['&', []]);
    expect(parseMediaQueryList('color)').condition).toEqual(['!', ['&', []]]);
  });

  it.each([
    'print',
    '(hover: hover)',
    '(color)',
    '(min-width: 600px) and (hover: hover)',
    '(min-width: 600px), print',
    '(min-orientation: landscape)',
    '(min-width: 5cm)',
    '(min-width: 600)',
    '(aspect-ratio: -1/1)',
    '(resolution: -3dpi)',
    '(min-orientation)',
    '(min-width: calc(1em + 5vw))',
    '(min-width: max(10px, 5%))',
    '(min-width: clamp(1px, 2px))',
    '(min-width: calc(10px + ))',
  ])('cannot answer %j, so it has no tuple tree', query => {
    expect(parseMediaQueryList(query).condition).toBeUndefined();
  });
});
