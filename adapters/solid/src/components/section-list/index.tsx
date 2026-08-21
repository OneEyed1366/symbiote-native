// SectionList: the public preset over VirtualizedSectionList, mirroring RN's
// SectionList -> VirtualizedSectionList -> VirtualizedList layering. All section flattening,
// windowing and imperative-scroll logic lives one layer down; this re-exposes the same surface
// under the SectionList name, threading the imperative ref straight through.

import type { JSX } from '../../jsx-runtime';
import {
  VirtualizedSectionList,
  type IVirtualizedSectionListHandle,
  type IVirtualizedSectionListProps,
} from '../virtualized-section-list';

export type { ISection } from '../virtualized-section-list';

// Same shape as VirtualizedSectionList's surface, kept as a distinct name so the high-level
// contract has its own identity — exactly as adapters/react spells it.
export type ISectionListProps<ItemT> = IVirtualizedSectionListProps<ItemT>;
export type ISectionListHandle = IVirtualizedSectionListHandle;

export function SectionList<ItemT>(
  props: ISectionListProps<ItemT>,
): JSX.Element {
  return <VirtualizedSectionList<ItemT> {...props} />;
}
