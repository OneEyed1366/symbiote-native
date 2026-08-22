// SectionList: public wrapper over VirtualizedSectionList, mirroring RN's
// SectionList -> VirtualizedSectionList -> VirtualizedList layering. All
// section-flattening / windowing / imperative-scroll logic lives in
// VirtualizedSectionList; this re-exposes the same surface under the
// SectionList name, threading the imperative ref straight through.

import { createElement, type ReactElement, type Ref } from 'react';
import {
  VirtualizedSectionList,
  type IVirtualizedSectionListHandle,
  type IVirtualizedSectionListProps,
} from '../virtualized-section-list';

export type { ISection } from '../virtualized-section-list';

// Same shape as VirtualizedSectionList's surface; kept as a distinct name so the
// high-level contract has its own identity.
export type ISectionListProps<ItemT> = IVirtualizedSectionListProps<ItemT>;
export type ISectionListHandle = IVirtualizedSectionListHandle;

export function SectionList<ItemT>(
  props: ISectionListProps<ItemT> & { ref?: Ref<ISectionListHandle> },
): ReactElement {
  return createElement(VirtualizedSectionList<ItemT>, props);
}
