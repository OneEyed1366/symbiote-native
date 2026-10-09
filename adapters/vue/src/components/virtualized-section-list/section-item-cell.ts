// Item cell with its separators around it, as in RN's `ItemWithSeparator`
// Their state sits in a shared board, т.к. `highlight()` also lights the previous cell's one

import {
  defineComponent,
  Fragment,
  h,
  shallowRef,
  watch,
  type VNode,
} from '@vue/runtime-core';
import {
  createCellSeparators,
  type ISeparatorBoard,
  type ISeparators,
} from '@symbiote-native/components';

type IRendered = VNode[] | VNode;

// What a separator render closure is told, the rest of its props the closure knows itself
export type ISeparatorState = {
  isHighlighted: boolean;
  override: Record<string, unknown> | undefined;
};

export type ISectionItemCellProps = {
  board: ISeparatorBoard<Record<string, unknown>>;
  cellKey: string;
  prevCellKey: string | undefined;
  renderItem: (separators: ISeparators) => IRendered;
  leadingSeparator: ((state: ISeparatorState) => IRendered) | undefined;
  trailingSeparator: ((state: ISeparatorState) => IRendered) | undefined;
  inverted: boolean;
};

const CELL_PROPS: (keyof ISectionItemCellProps)[] = [
  'board',
  'cellKey',
  'prevCellKey',
  'renderItem',
  'leadingSeparator',
  'trailingSeparator',
  'inverted',
];

export const SectionItemCell = defineComponent(
  (props: ISectionItemCellProps) => {
    const state = shallowRef(props.board.read(props.cellKey));
    watch(
      () => [props.board, props.cellKey] as const,
      ([board, cellKey], _previous, onCleanup) => {
        state.value = board.read(cellKey);
        const unsubscribe = board.subscribe(cellKey, () => {
          state.value = board.read(cellKey);
        });
        onCleanup(() => {
          unsubscribe();
          board.release(cellKey);
        });
      },
      { immediate: true, flush: 'sync' },
    );

    const separators = createCellSeparators(props.board, () => ({
      cellKey: props.cellKey,
      prevCellKey: props.prevCellKey,
      has: {
        leading: props.leadingSeparator !== undefined,
        trailing: props.trailingSeparator !== undefined,
      },
    }));

    return () => {
      const { leadingHighlighted, leadingOverride } = state.value;
      const { trailingHighlighted, trailingOverride } = state.value;
      const leading =
        props.leadingSeparator?.({
          isHighlighted: leadingHighlighted,
          override: leadingOverride,
        }) ?? [];
      const trailing =
        props.trailingSeparator?.({
          isHighlighted: trailingHighlighted,
          override: trailingOverride,
        }) ?? [];
      const element = props.renderItem(separators);
      return h(Fragment, [
        props.inverted ? trailing : leading,
        element,
        props.inverted ? leading : trailing,
      ]);
    };
  },
  { name: 'SectionItemCell', props: CELL_PROPS },
);
