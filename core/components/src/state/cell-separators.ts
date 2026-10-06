// The `separators` handle `renderItem` gets for one section cell, bound to the shared board

import type { ISeparators } from './list-types';
import type {
  ISeparatorBoard,
  ISeparatorUpdate,
} from './section-separator-board';

type IProps = Record<string, unknown>;

export type ICellIdentity = Pick<
  ISeparatorUpdate<IProps>,
  'cellKey' | 'prevCellKey' | 'has'
>;

// The identity is read on each call, т.к. an adapter cell may be handed another key
export function createCellSeparators(
  board: ISeparatorBoard<IProps>,
  cell: () => ICellIdentity,
): ISeparators {
  return {
    highlight: () => board.highlight(cell().cellKey, cell().prevCellKey),
    unhighlight: () => board.unhighlight(cell().cellKey, cell().prevCellKey),
    updateProps: (side, props) => board.updateProps({ ...cell(), side, props }),
  };
}
