// Item cell with its separators around it, as in RN's `ItemWithSeparator`
// Their state sits in a shared board, т.к. `highlight()` also lights the previous cell's one

import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  createCellSeparators,
  type ISeparatorBoard,
  type ISeparators,
} from '@symbiote-native/components';

// What a separator render closure is told, the rest of its props the closure knows itself
export type ISeparatorState = {
  isHighlighted: boolean;
  override: Record<string, unknown> | undefined;
};

export type ISeparatorRender = (state: ISeparatorState) => JSX.Element;

export type ISectionItemCellProps = {
  board: ISeparatorBoard<Record<string, unknown>>;
  cellKey: Accessor<string>;
  prevCellKey: Accessor<string | undefined>;
  // Called once, so the row it builds stays alive while its inputs move
  renderItem: (separators: ISeparators) => JSX.Element;
  leadingSeparator: Accessor<ISeparatorRender | undefined>;
  trailingSeparator: Accessor<ISeparatorRender | undefined>;
  isInverted: boolean;
};

export function SectionItemCell(props: ISectionItemCellProps): JSX.Element {
  const { board } = props;
  const [state, setState] = createSignal(
    untrack(() => board.read(props.cellKey())),
  );
  createEffect(() => {
    const cellKey = props.cellKey();
    setState(board.read(cellKey));
    const unsubscribe = board.subscribe(cellKey, () =>
      setState(board.read(cellKey)),
    );
    onCleanup(() => {
      unsubscribe();
      board.release(cellKey);
    });
  });

  const separators = createCellSeparators(board, () => ({
    cellKey: props.cellKey(),
    prevCellKey: props.prevCellKey(),
    has: {
      leading: props.leadingSeparator() !== undefined,
      trailing: props.trailingSeparator() !== undefined,
    },
  }));
  const content = untrack(() => props.renderItem(separators));
  const leading = (): JSX.Element =>
    props.leadingSeparator()?.({
      isHighlighted: state().leadingHighlighted,
      override: state().leadingOverride,
    });
  const trailing = (): JSX.Element =>
    props.trailingSeparator()?.({
      isHighlighted: state().trailingHighlighted,
      override: state().trailingOverride,
    });
  return props.isInverted
    ? [trailing, content, leading]
    : [leading, content, trailing];
}
