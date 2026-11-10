// Item cell with its separators around it, as in RN's `ItemWithSeparator`
// Their state sits in a shared board, т.к. `highlight()` also lights the previous cell's one

import {
  createElement,
  Fragment,
  isValidElement,
  useEffect,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  createCellSeparators,
  type ISeparatorBoard,
  type ISeparatorGap,
} from '@symbiote-native/components';
import type { ISeparatorComponent, ISeparators } from '../virtualized-list';

export type ISectionItemCellProps<ItemT, SectionT> = {
  board: ISeparatorBoard<Record<string, unknown>>;
  cellKey: string;
  prevCellKey: string | undefined;
  item: ItemT;
  index: number;
  section: SectionT;
  renderItem: (info: {
    item: ItemT;
    index: number;
    section: SectionT;
    separators: ISeparators;
  }) => ReactNode;
  leadingGap: ISeparatorGap<ItemT, SectionT>;
  trailingGap: ISeparatorGap<ItemT, SectionT>;
  LeadingSeparatorComponent: ISeparatorComponent<ItemT> | undefined;
  TrailingSeparatorComponent: ISeparatorComponent<ItemT> | undefined;
  inverted: boolean;
};

type IPaintedSeparator<ItemT, SectionT> = {
  Component: ISeparatorComponent<ItemT> | undefined;
  gap: ISeparatorGap<ItemT, SectionT>;
  isHighlighted: boolean;
  override: object | undefined;
};

function paint<ItemT, SectionT>(
  separator: IPaintedSeparator<ItemT, SectionT>,
): ReactNode {
  const { Component, gap, isHighlighted, override } = separator;
  if (Component === undefined) return null;
  if (isValidElement(Component)) return Component;
  return createElement(Component, {
    highlighted: isHighlighted,
    ...gap.props,
    ...override,
  });
}

export function SectionItemCell<ItemT, SectionT>(
  props: ISectionItemCellProps<ItemT, SectionT>,
): ReactElement {
  const { board, cellKey, prevCellKey } = props;
  const state = useSyncExternalStore(
    listener => board.subscribe(cellKey, listener),
    () => board.read(cellKey),
  );
  useEffect(() => () => board.release(cellKey), [board, cellKey]);

  const separators = createCellSeparators(board, () => ({
    cellKey,
    prevCellKey,
    has: {
      leading: props.LeadingSeparatorComponent !== undefined,
      trailing: props.TrailingSeparatorComponent !== undefined,
    },
  }));
  const leading = paint({
    Component: props.LeadingSeparatorComponent,
    gap: props.leadingGap,
    isHighlighted: state.leadingHighlighted,
    override: state.leadingOverride,
  });
  const trailing = paint({
    Component: props.TrailingSeparatorComponent,
    gap: props.trailingGap,
    isHighlighted: state.trailingHighlighted,
    override: state.trailingOverride,
  });
  const element = props.renderItem({
    item: props.item,
    index: props.index,
    section: props.section,
    separators,
  });
  return createElement(
    Fragment,
    null,
    props.inverted ? trailing : leading,
    element,
    props.inverted ? leading : trailing,
  );
}
