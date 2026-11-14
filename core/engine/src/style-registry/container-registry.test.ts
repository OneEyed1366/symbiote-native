// A rule behind a `['@', ...]` condition applies by the size of the container the node answers to
// The class cache is keyed by class and container truth bits, so equal answers share one object

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  IContainerLookup,
  IMediaCondition,
  IMediaEnvironment,
} from './media-evaluate';
import {
  clearGlobalStyles,
  conditionIdsOf,
  registerRules,
  resolveClassName,
  setMediaEnvironment,
} from './index';

const PHONE: IMediaEnvironment = {
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

const WIDE_CARD: IMediaCondition = ['@', null, ['>=', 'width', 400]];
const DARK: IMediaCondition = ['=', 'prefers-color-scheme', 'dark'];

function rule(token: string, style: Record<string, unknown>, cond?: number, order = 0) {
  return { tokens: [token], specificity: [0, 1, 0] as const, order, style, cond };
}

function containerOf(width: number): IContainerLookup {
  return () => ({ width, height: 100 });
}

beforeEach(() => {
  clearGlobalStyles();
  setMediaEnvironment(PHONE);
  registerRules(
    [rule('card', { padding: 4 }), rule('card', { padding: 16 }, 0, 1)],
    [WIDE_CARD],
  );
});

afterEach(() => clearGlobalStyles());

describe('resolveClassName - container conditions', () => {
  it('applies the rule while the node container is wide enough', () => {
    expect(resolveClassName('card', containerOf(500))).toEqual({ padding: 16 });
    expect(resolveClassName('card', containerOf(300))).toEqual({ padding: 4 });
  });

  it('leaves the rule off for a node without a container or without a lookup', () => {
    expect(resolveClassName('card', () => undefined)).toEqual({ padding: 4 });
    expect(resolveClassName('card')).toEqual({ padding: 4 });
  });

  it('hands two nodes with the same answer the very same object', () => {
    expect(resolveClassName('card', containerOf(500))).toBe(
      resolveClassName('card', containerOf(900)),
    );
  });

  it('hands back the plain object when every container condition is false', () => {
    expect(resolveClassName('card', containerOf(300))).toBe(resolveClassName('card'));
  });

  it('merges the answers of a class list per item', () => {
    registerRules([rule('frame', { margin: 8 }, 0)], [WIDE_CARD]);

    expect(resolveClassName(['card', 'frame'], containerOf(500))).toEqual({
      padding: 16,
      margin: 8,
    });
  });

  it('reports the condition to a node that reads the class', () => {
    resolveClassName('card', containerOf(500));

    expect(conditionIdsOf('card')).toEqual([0]);
  });

  it('asks for the container the query names', () => {
    clearGlobalStyles();
    setMediaEnvironment(PHONE);
    registerRules(
      [rule('card', { padding: 16 }, 0)],
      [['@', 'sidebar', ['>=', 'width', 400]]],
    );
    const asked: Array<string | null> = [];

    resolveClassName('card', name => {
      asked.push(name);
      return { width: 500, height: 100 };
    });

    expect([...new Set(asked)]).toEqual(['sidebar']);
  });
});

describe('setMediaEnvironment - container conditions', () => {
  it('reports a container condition when the environment changes, since it may read it', () => {
    clearGlobalStyles();
    setMediaEnvironment(PHONE);
    registerRules(
      [rule('card', { padding: 16 }, 0)],
      [['&', [WIDE_CARD, DARK]]],
    );

    expect(setMediaEnvironment({ ...PHONE, 'prefers-color-scheme': 'dark' })).toEqual([0]);
    expect(resolveClassName('card', containerOf(500))).toEqual({ padding: 16 });
    expect(resolveClassName('card', containerOf(300))).toEqual({});
  });

  it('reports nothing when the environment is the same', () => {
    expect(setMediaEnvironment({ ...PHONE })).toEqual([]);
  });

  it('drops the keyed entry when a media half flips', () => {
    clearGlobalStyles();
    setMediaEnvironment(PHONE);
    registerRules(
      [rule('card', { padding: 16 }, 0)],
      [['&', [WIDE_CARD, DARK]]],
    );
    expect(resolveClassName('card', containerOf(500))).toEqual({});

    setMediaEnvironment({ ...PHONE, 'prefers-color-scheme': 'dark' });

    expect(resolveClassName('card', containerOf(500))).toEqual({ padding: 16 });
  });
});
