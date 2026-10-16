// Separator state that crosses cells, after `VirtualizedSectionList.js` `ItemWithSeparator`.
// A cell's `separators.highlight()` also lights the trailing separator of the cell before it, so
// the state lives here, keyed by cell, and each adapter cell subscribes to its own key
import { SEPARATOR_SIDE, type ISeparatorSide } from './list-types';

export type ICellSeparatorState<P> = {
  leadingHighlighted: boolean;
  trailingHighlighted: boolean;
  // Overlaid on the props derived from the entry, so a re-render with new data still wins
  leadingOverride: Partial<P> | undefined;
  trailingOverride: Partial<P> | undefined;
};

export type ISeparatorUpdate<P> = {
  cellKey: string;
  prevCellKey: string | undefined;
  side: ISeparatorSide;
  // Which separators the cell paints; a leading update without one goes to the cell before
  has: { leading: boolean; trailing: boolean };
  props: Partial<P>;
};

export type ISeparatorBoard<P> = {
  read(cellKey: string): ICellSeparatorState<P>;
  subscribe(cellKey: string, listener: () => void): () => void;
  highlight(cellKey: string, prevCellKey: string | undefined): void;
  unhighlight(cellKey: string, prevCellKey: string | undefined): void;
  updateProps(update: ISeparatorUpdate<P>): void;
  // A recycled cell starts clean, as a remounted RN cell does
  release(cellKey: string): void;
};

export function createSeparatorBoard<P>(): ISeparatorBoard<P> {
  const idle: ICellSeparatorState<P> = {
    leadingHighlighted: false,
    trailingHighlighted: false,
    leadingOverride: undefined,
    trailingOverride: undefined,
  };
  const states = new Map<string, ICellSeparatorState<P>>();
  const listeners = new Map<string, Set<() => void>>();

  const read = (cellKey: string): ICellSeparatorState<P> =>
    states.get(cellKey) ?? idle;

  function patch(
    cellKey: string,
    change: Partial<ICellSeparatorState<P>>,
  ): void {
    states.set(cellKey, { ...read(cellKey), ...change });
    listeners.get(cellKey)?.forEach(listener => listener());
  }

  function setHighlight(
    cellKey: string,
    prevCellKey: string | undefined,
    isLit: boolean,
  ): void {
    patch(cellKey, { leadingHighlighted: isLit, trailingHighlighted: isLit });
    if (prevCellKey !== undefined)
      patch(prevCellKey, { trailingHighlighted: isLit });
  }

  return {
    read,
    subscribe(cellKey, listener) {
      const own = listeners.get(cellKey) ?? new Set<() => void>();
      own.add(listener);
      listeners.set(cellKey, own);
      return () => {
        own.delete(listener);
      };
    },
    highlight: (cellKey, prevCellKey) =>
      setHighlight(cellKey, prevCellKey, true),
    unhighlight: (cellKey, prevCellKey) =>
      setHighlight(cellKey, prevCellKey, false),
    updateProps({ cellKey, prevCellKey, side, has, props }) {
      if (side === SEPARATOR_SIDE.trailing) {
        if (has.trailing)
          patch(cellKey, {
            trailingOverride: { ...read(cellKey).trailingOverride, ...props },
          });
        return;
      }
      if (has.leading) {
        patch(cellKey, {
          leadingOverride: { ...read(cellKey).leadingOverride, ...props },
        });
      } else if (prevCellKey !== undefined) {
        // RN sets the cell before to a whole new props object, so its earlier override is dropped
        patch(prevCellKey, { trailingOverride: { ...props } });
      }
    },
    release(cellKey) {
      states.delete(cellKey);
    },
  };
}
