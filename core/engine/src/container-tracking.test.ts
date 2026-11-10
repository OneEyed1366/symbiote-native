// Which container a node answers to, how big it is, and who restyles when that size moves
// Nodes are plain objects here: the module keys everything by identity and never reads a field

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  containerLookup,
  declareContainer,
  linkConsumer,
  reportContainerSize,
  resetContainerTracking,
  revokeContainer,
  setContainerRestyler,
  unlinkConsumer,
} from './container-tracking';

const restyle = vi.fn();

function node(): object {
  return {};
}

beforeEach(() => {
  resetContainerTracking();
  restyle.mockReset();
  setContainerRestyler(restyle);
});

describe('containerLookup', () => {
  it('answers nothing before the container has a size', () => {
    const card = node();
    const child = node();
    declareContainer(card, []);
    linkConsumer(child, [card]);

    expect(containerLookup(child)(null)).toBeUndefined();
  });

  it('answers the size the container reported', () => {
    const card = node();
    const child = node();
    declareContainer(card, []);
    linkConsumer(child, [card]);

    reportContainerSize(card, { width: 320, height: 90 });

    expect(containerLookup(child)(null)).toEqual({ width: 320, height: 90 });
  });

  it('takes the nearest container for an unnamed query', () => {
    const outer = node();
    const inner = node();
    const child = node();
    declareContainer(outer, ['page']);
    declareContainer(inner, ['card']);
    linkConsumer(child, [inner, outer]);
    reportContainerSize(outer, { width: 800, height: 600 });
    reportContainerSize(inner, { width: 300, height: 100 });

    expect(containerLookup(child)(null)).toEqual({ width: 300, height: 100 });
  });

  it('skips a nearer container whose name the query does not carry', () => {
    const outer = node();
    const inner = node();
    const child = node();
    declareContainer(outer, ['page']);
    declareContainer(inner, ['card']);
    linkConsumer(child, [inner, outer]);
    reportContainerSize(outer, { width: 800, height: 600 });
    reportContainerSize(inner, { width: 300, height: 100 });

    expect(containerLookup(child)('page')).toEqual({ width: 800, height: 600 });
    expect(containerLookup(child)('missing')).toBeUndefined();
  });

  it('matches any of the names a container carries', () => {
    const card = node();
    const child = node();
    declareContainer(card, ['card', 'tile']);
    linkConsumer(child, [card]);
    reportContainerSize(card, { width: 10, height: 10 });

    expect(containerLookup(child)('tile')).toEqual({ width: 10, height: 10 });
  });

  it('answers nothing for a node with no container above it', () => {
    expect(containerLookup(node())(null)).toBeUndefined();
  });
});

describe('reportContainerSize', () => {
  it('restyles each consumer of the container once when the size moves', () => {
    const card = node();
    const first = node();
    const second = node();
    declareContainer(card, []);
    linkConsumer(first, [card]);
    linkConsumer(second, [card]);

    reportContainerSize(card, { width: 100, height: 50 });

    expect(restyle).toHaveBeenCalledWith(first);
    expect(restyle).toHaveBeenCalledWith(second);
    expect(restyle).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when the size is the one it already had', () => {
    const card = node();
    declareContainer(card, []);
    linkConsumer(node(), [card]);
    reportContainerSize(card, { width: 100, height: 50 });
    restyle.mockClear();

    expect(reportContainerSize(card, { width: 100, height: 50 })).toBe(false);
    expect(restyle).not.toHaveBeenCalled();
  });

  it('does not restyle a consumer of another container', () => {
    const card = node();
    const other = node();
    declareContainer(card, []);
    declareContainer(other, []);
    linkConsumer(node(), [other]);

    reportContainerSize(card, { width: 1, height: 1 });

    expect(restyle).not.toHaveBeenCalled();
  });
});

describe('linking', () => {
  it('moves a consumer from the old container to the new one', () => {
    const before = node();
    const after = node();
    const child = node();
    declareContainer(before, []);
    declareContainer(after, []);
    linkConsumer(child, [before]);
    linkConsumer(child, [after]);

    reportContainerSize(before, { width: 1, height: 1 });

    expect(restyle).not.toHaveBeenCalled();
    reportContainerSize(after, { width: 1, height: 1 });
    expect(restyle).toHaveBeenCalledWith(child);
  });

  it('forgets a consumer that left', () => {
    const card = node();
    const child = node();
    declareContainer(card, []);
    linkConsumer(child, [card]);
    unlinkConsumer(child);

    reportContainerSize(card, { width: 1, height: 1 });

    expect(restyle).not.toHaveBeenCalled();
    expect(containerLookup(child)(null)).toBeUndefined();
  });

  it('restyles the consumers of a container that stopped being one', () => {
    const card = node();
    const child = node();
    declareContainer(card, []);
    linkConsumer(child, [card]);
    reportContainerSize(card, { width: 5, height: 5 });
    restyle.mockClear();

    revokeContainer(card);

    expect(restyle).toHaveBeenCalledWith(child);
    expect(containerLookup(child)(null)).toBeUndefined();
  });
});
