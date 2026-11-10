// Shapes shared by every list state module and the adapters' public list surface

import type {
  ISymbioteEvent,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IScrollRoutingHandle } from './scroll-routing-handle';

// What RN hands a `CellRendererComponent`, each adapter adds its own `children`
// RN names the last one `onFocusCapture`, our host reports a focus inside the cell as `onFocus`
export type ICellRendererBaseProps<ItemT> = {
  cellKey: string;
  index: number;
  item: ItemT;
  style: IStyleProp<IViewStyle> | undefined;
  onLayout: (event: ISymbioteEvent) => void;
  onFocus: () => void;
};

// RN's `onContentSizeChange`, positional like the ScrollView's own
export type IContentSizeHandler = (width: number, height: number) => void;

export type ICellLayout = {
  length: number;
  offset: number;
};

// What RN passes to `ItemSeparatorComponent`, `section` is optional since a flat list has none
export type ISeparatorProps<ItemT> = {
  highlighted: boolean;
  leadingItem?: ItemT;
  trailingItem?: ItemT;
  section?: unknown;
  [key: string]: unknown;
};

export const SEPARATOR_SIDE = {
  leading: 'leading',
  trailing: 'trailing',
} as const;

export type ISeparatorSide =
  (typeof SEPARATOR_SIDE)[keyof typeof SEPARATOR_SIDE];

// Passed to `renderItem`, `highlight` flips the flanking separators, `updateProps` merges into one
export type ISeparators = {
  highlight(): void;
  unhighlight(): void;
  updateProps(select: ISeparatorSide, newProps: Record<string, unknown>): void;
};

// The `scrollTo*` family is this handle's own, the rest is shared with `VirtualizedSectionList`
export type IVirtualizedListHandle = IScrollRoutingHandle & {
  scrollToOffset(params: { offset: number; animated?: boolean }): void;
  scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
    // The length of this cell joins `viewOffset`, a sticky section header covering the target
    offsetByCellLength?: number;
  }): void;
  scrollToItem(params: {
    item: unknown;
    animated?: boolean;
    viewPosition?: number;
  }): void;
  scrollToEnd(params?: { animated?: boolean }): void;
};
