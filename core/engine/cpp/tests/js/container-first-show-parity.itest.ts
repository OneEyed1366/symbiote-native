// The container condition a node holds in its first commit is the one the JS evaluator answers
// Both read the same literals: the commit hook in C++ against `evaluateMedia` in this bundle

import {
  appendChild,
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createSurface,
  registerRules,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  evaluateMedia,
  type IMediaCondition,
  type IMediaEnvironment,
} from '../../../src/style-registry/media-evaluate';
import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const PLAIN_PADDING = 4;
const HELD_PADDING = 16;

const ENV: IMediaEnvironment = {
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
};

const QUERIES: readonly IMediaCondition[] = [
  ['>=', 'width', 400],
  ['>', 'height', 100],
  ['<=', 'width', 300],
  ['=', 'width', 300],
  ['>', 'aspect-ratio', 1.5],
  ['=', 'orientation', 'portrait'],
  ['=', 'orientation', 'landscape'],
  ['!', ['<', 'width', 400]],
  ['&', [['>=', 'width', 300], ['<', 'height', 100]]],
  ['|', [['<', 'width', 200], ['>=', 'height', 150]]],
];

const SIZES: readonly (readonly [number, number])[] = [
  [500, 100],
  [300, 100],
  [300, 300],
  [100, 300],
  [320, 160],
  [400, 1],
];

function paddingOfCard(query: IMediaCondition, containerStyle: Record<string, unknown>): unknown {
  clearGlobalStyles();
  registerRules(
    [
      { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: PLAIN_PADDING } },
      { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: HELD_PADDING }, cond: 0 },
    ],
    [['@', null, query]],
  );
  const container: ISymbioteNode = createElement('RCTView', false);
  routeProp(container, 'style', { ...containerStyle, containerType: 'size' });
  const card: ISymbioteNode = createElement('RCTView', false);
  routeProp(card, 'class', 'card');
  appendChild(container, card);
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(container);
  surface.commit();
  mounted();
  return committedPayloadOf(card)?.padding;
}

describe('the first commit against the JS evaluator', () => {
  for (const query of QUERIES) {
    it(`agrees on ${JSON.stringify(query)} at every container size`, () => {
      for (const [width, height] of SIZES) {
        const holds = evaluateMedia(['@', null, query], ENV, () => ({ width, height }));

        expect(paddingOfCard(query, { width, height })).toBe(holds ? HELD_PADDING : PLAIN_PADDING);
      }
    });
  }
});

// The axis a style leaves out is open, so only the fixed one has a size a query may read
const OPEN_CASES: readonly (readonly [string, Record<string, unknown>, 'width' | 'height'])[] = [
  ['no width', { height: 300 }, 'width'],
  ['no height', { width: 300 }, 'height'],
];

describe('a container that leaves an axis to its content', () => {
  for (const [label, style, open] of OPEN_CASES) {
    for (const query of QUERIES) {
      it(`agrees on ${JSON.stringify(query)} with ${label}`, () => {
        const size = { width: 300, height: 300, open: [open] };
        const holds = evaluateMedia(['@', null, query], ENV, () => size);

        expect(paddingOfCard(query, style)).toBe(holds ? HELD_PADDING : PLAIN_PADDING);
      });
    }
  }

  it('keeps every query false when neither axis is fixed', () => {
    for (const query of QUERIES) {
      expect(paddingOfCard(query, {})).toBe(PLAIN_PADDING);
    }
  });

  it('keeps a class width when an inline undefined mentions it, as the JS side does', () => {
    clearGlobalStyles();
    registerRules(
      [
        { tokens: ['box'], specificity: [0, 1, 0], order: 0, style: { width: 300, height: 80 } },
        { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: PLAIN_PADDING } },
        { tokens: ['card'], specificity: [0, 1, 0], order: 2, style: { padding: HELD_PADDING }, cond: 0 },
      ],
      [['@', null, ['>=', 'width', 0]]],
    );
    const paddings = [{}, { width: undefined }].map(inline => {
      const container: ISymbioteNode = createElement('RCTView', false);
      routeProp(container, 'class', 'box');
      routeProp(container, 'style', { ...inline, containerType: 'size' });
      const card: ISymbioteNode = createElement('RCTView', false);
      routeProp(card, 'class', 'card');
      appendChild(container, card);
      const surface = createSurface(ROOT_TAG);
      surface.appendChild(container);
      surface.commit();
      mounted();
      return committedPayloadOf(card)?.padding;
    });

    expect(paddings).toEqual([HELD_PADDING, HELD_PADDING]);
  });

  it('counts a flex or an aspect ratio as fixing the axes', () => {
    expect(paddingOfCard(['>=', 'width', 0], { flex: 1 })).toBe(HELD_PADDING);
    expect(paddingOfCard(['>=', 'width', 0], { aspectRatio: 2 })).toBe(HELD_PADDING);
  });
});

report();
