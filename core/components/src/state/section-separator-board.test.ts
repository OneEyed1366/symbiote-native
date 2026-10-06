// Cross-cell separator state after `ItemWithSeparator`: `highlight` lights the cell's own two
// separators and the trailing one of the cell before it, `updateProps` falls back to that cell
import { describe, expect, it, vi } from 'vitest';

import { createSeparatorBoard } from './section-separator-board';

type IProps = { trailingItem: string };

describe('createSeparatorBoard', () => {
  it('starts every cell unhighlighted with no overrides', () => {
    const board = createSeparatorBoard<IProps>();

    expect(board.read('a')).toEqual({
      leadingHighlighted: false,
      trailingHighlighted: false,
      leadingOverride: undefined,
      trailingOverride: undefined,
    });
  });

  it('highlights both own separators and the previous cell trailing one', () => {
    const board = createSeparatorBoard<IProps>();

    board.highlight('b', 'a');

    expect(board.read('b')).toMatchObject({
      leadingHighlighted: true,
      trailingHighlighted: true,
    });
    expect(board.read('a')).toMatchObject({
      leadingHighlighted: false,
      trailingHighlighted: true,
    });
  });

  it('unhighlights the same three', () => {
    const board = createSeparatorBoard<IProps>();
    board.highlight('b', 'a');

    board.unhighlight('b', 'a');

    expect(board.read('b').trailingHighlighted).toBe(false);
    expect(board.read('a').trailingHighlighted).toBe(false);
  });

  it('tells only the cells that changed', () => {
    const board = createSeparatorBoard<IProps>();
    const onA = vi.fn();
    const onC = vi.fn();
    board.subscribe('a', onA);
    board.subscribe('c', onC);

    board.highlight('b', 'a');

    expect(onA).toHaveBeenCalledTimes(1);
    expect(onC).not.toHaveBeenCalled();
  });

  it('routes a leading update to the cell before when there is no leading separator', () => {
    const board = createSeparatorBoard<IProps>();

    board.updateProps({
      cellKey: 'b',
      prevCellKey: 'a',
      side: 'leading',
      has: { leading: false, trailing: true },
      props: { trailingItem: 'x' },
    });

    expect(board.read('a').trailingOverride).toEqual({ trailingItem: 'x' });
    expect(board.read('b').leadingOverride).toBeUndefined();
  });

  it('keeps a leading update on its own cell when it paints a leading separator', () => {
    const board = createSeparatorBoard<IProps>();

    board.updateProps({
      cellKey: 'b',
      prevCellKey: 'a',
      side: 'leading',
      has: { leading: true, trailing: true },
      props: { trailingItem: 'x' },
    });

    expect(board.read('b').leadingOverride).toEqual({ trailingItem: 'x' });
  });

  it('ignores a trailing update when the cell paints no trailing separator', () => {
    const board = createSeparatorBoard<IProps>();

    board.updateProps({
      cellKey: 'b',
      prevCellKey: 'a',
      side: 'trailing',
      has: { leading: false, trailing: false },
      props: { trailingItem: 'x' },
    });

    expect(board.read('b').trailingOverride).toBeUndefined();
  });

  it('forgets a released cell', () => {
    const board = createSeparatorBoard<IProps>();
    board.highlight('b', undefined);

    board.release('b');

    expect(board.read('b').trailingHighlighted).toBe(false);
  });
});
