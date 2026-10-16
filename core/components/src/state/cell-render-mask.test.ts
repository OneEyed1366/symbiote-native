// Port of RN's CellRenderMask-test.js
import { describe, expect, it } from 'vitest';
import { CellRenderMask } from './cell-render-mask';

describe('CellRenderMask', () => {
  it('throws when constructed with invalid size', () => {
    expect(() => new CellRenderMask(-1)).toThrow();
  });

  it('allows creation of empty mask', () => {
    const renderMask = new CellRenderMask(0);
    expect(renderMask.enumerateRegions()).toEqual([]);
  });

  it('allows creation of single-cell mask', () => {
    const renderMask = new CellRenderMask(1);
    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 0, isSpacer: true },
    ]);
  });

  it('throws when adding invalid cell ranges', () => {
    const renderMask = new CellRenderMask(5);

    expect(() => renderMask.addCells({ first: -2, last: -1 })).toThrow();
    expect(() => renderMask.addCells({ first: -2, last: 0 })).toThrow();
    expect(() => renderMask.addCells({ first: 0, last: 5 })).toThrow();
    expect(() => renderMask.addCells({ first: 6, last: 7 })).toThrow();
  });

  it('allows adding single cell at beginning', () => {
    const renderMask = new CellRenderMask(5);
    renderMask.addCells({ first: 0, last: 0 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 0, isSpacer: false },
      { first: 1, last: 4, isSpacer: true },
    ]);
  });

  it('allows adding single cell at end', () => {
    const renderMask = new CellRenderMask(5);
    renderMask.addCells({ first: 4, last: 4 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 3, isSpacer: true },
      { first: 4, last: 4, isSpacer: false },
    ]);
  });

  it('allows adding single cell in middle', () => {
    const renderMask = new CellRenderMask(5);
    renderMask.addCells({ first: 2, last: 2 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 1, isSpacer: true },
      { first: 2, last: 2, isSpacer: false },
      { first: 3, last: 4, isSpacer: true },
    ]);
  });

  it('allows marking entire cell range', () => {
    const renderMask = new CellRenderMask(5);
    renderMask.addCells({ first: 0, last: 4 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 4, isSpacer: false },
    ]);
  });

  it('allows adding empty cell range', () => {
    const renderMask = new CellRenderMask(5);
    renderMask.addCells({ first: 0, last: -1 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 4, isSpacer: true },
    ]);
  });

  it('correctly replaces fragmented cell ranges', () => {
    const renderMask = new CellRenderMask(10);

    renderMask.addCells({ first: 3, last: 3 });
    renderMask.addCells({ first: 5, last: 7 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 2, isSpacer: true },
      { first: 3, last: 3, isSpacer: false },
      { first: 4, last: 4, isSpacer: true },
      { first: 5, last: 7, isSpacer: false },
      { first: 8, last: 9, isSpacer: true },
    ]);

    renderMask.addCells({ first: 3, last: 7 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 2, isSpacer: true },
      { first: 3, last: 7, isSpacer: false },
      { first: 8, last: 9, isSpacer: true },
    ]);
  });

  it('left-expands region', () => {
    const renderMask = new CellRenderMask(5);
    renderMask.addCells({ first: 3, last: 3 });
    renderMask.addCells({ first: 2, last: 3 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 1, isSpacer: true },
      { first: 2, last: 3, isSpacer: false },
      { first: 4, last: 4, isSpacer: true },
    ]);
  });

  it('right-expands region', () => {
    const renderMask = new CellRenderMask(5);
    renderMask.addCells({ first: 3, last: 3 });
    renderMask.addCells({ first: 3, last: 4 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 2, isSpacer: true },
      { first: 3, last: 4, isSpacer: false },
    ]);
  });

  it('left+right expands region', () => {
    const renderMask = new CellRenderMask(5);
    renderMask.addCells({ first: 3, last: 3 });
    renderMask.addCells({ first: 2, last: 4 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 1, isSpacer: true },
      { first: 2, last: 4, isSpacer: false },
    ]);
  });

  it('does nothing when adding existing cells', () => {
    const renderMask = new CellRenderMask(5);
    renderMask.addCells({ first: 2, last: 3 });
    renderMask.addCells({ first: 3, last: 3 });

    expect(renderMask.enumerateRegions()).toEqual([
      { first: 0, last: 1, isSpacer: true },
      { first: 2, last: 3, isSpacer: false },
      { first: 4, last: 4, isSpacer: true },
    ]);
  });

  it('compares masks by their regions', () => {
    const left = new CellRenderMask(5);
    const right = new CellRenderMask(5);
    left.addCells({ first: 1, last: 2 });
    right.addCells({ first: 1, last: 2 });
    expect(left.equals(right)).toBe(true);

    right.addCells({ first: 4, last: 4 });
    expect(left.equals(right)).toBe(false);
    expect(left.equals(new CellRenderMask(6))).toBe(false);
  });
});
