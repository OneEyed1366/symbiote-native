// A `['@', name, size condition]` leaf is answered by the size of the node's own container
// Without one the leaf is false, `not` inside the query included, as on the web

import { describe, expect, it } from 'vitest';
import {
  evaluateMedia,
  type IContainerSize,
  type IMediaCondition,
  type IMediaEnvironment,
} from './media-evaluate';

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

function holds(
  condition: IMediaCondition,
  size: IContainerSize | undefined,
  names: string[] = [],
): boolean {
  return evaluateMedia(condition, PHONE, name => {
    names.push(String(name));
    return size;
  });
}

describe('evaluateMedia - container leaf', () => {
  it('compares the container width, not the window width', () => {
    const wide: IMediaCondition = ['@', null, ['>=', 'width', 400]];

    expect(holds(wide, { width: 500, height: 100 })).toBe(true);
    expect(holds(wide, { width: 300, height: 100 })).toBe(false);
  });

  it('compares the container height', () => {
    const tall: IMediaCondition = ['@', null, ['>', 'height', 200]];

    expect(holds(tall, { width: 100, height: 201 })).toBe(true);
    expect(holds(tall, { width: 100, height: 200 })).toBe(false);
  });

  it('reads aspect-ratio as width over height', () => {
    const landscape: IMediaCondition = ['@', null, ['>', 'aspect-ratio', 1.5]];

    expect(holds(landscape, { width: 320, height: 160 })).toBe(true);
    expect(holds(landscape, { width: 150, height: 100 })).toBe(false);
  });

  it('calls a square container portrait', () => {
    const portrait: IMediaCondition = ['@', null, ['=', 'orientation', 'portrait']];
    const landscape: IMediaCondition = ['@', null, ['=', 'orientation', 'landscape']];

    expect(holds(portrait, { width: 100, height: 100 })).toBe(true);
    expect(holds(landscape, { width: 100, height: 100 })).toBe(false);
    expect(holds(landscape, { width: 200, height: 100 })).toBe(true);
  });

  it('treats a container with no height as an aspect-ratio that holds nothing', () => {
    const ratio: IMediaCondition = ['@', null, ['>', 'aspect-ratio', 0]];

    expect(holds(ratio, { width: 100, height: 0 })).toBe(false);
  });

  it('is false when no container answers, `not` inside the query included', () => {
    const narrow: IMediaCondition = ['@', null, ['!', ['<', 'width', 200]]];

    expect(holds(narrow, undefined)).toBe(false);
    expect(holds(narrow, { width: 300, height: 100 })).toBe(true);
  });

  it('is false without any resolver', () => {
    expect(evaluateMedia(['@', null, ['>=', 'width', 0]], PHONE)).toBe(false);
  });

  it('asks for the container by the name the query carries', () => {
    const asked: string[] = [];

    holds(['@', 'card', ['>=', 'width', 0]], { width: 1, height: 1 }, asked);
    holds(['@', null, ['>=', 'width', 0]], { width: 1, height: 1 }, asked);

    expect(asked).toEqual(['card', 'null']);
  });

  it('joins with a media leaf', () => {
    const both: IMediaCondition = [
      '&',
      [['@', null, ['>=', 'width', 400]], ['<=', 'width', 400]],
    ];

    expect(holds(both, { width: 500, height: 100 })).toBe(true);
    expect(holds(both, { width: 300, height: 100 })).toBe(false);
  });
});
