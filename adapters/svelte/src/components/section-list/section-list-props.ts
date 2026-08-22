// SectionList's public surface is exactly VirtualizedSectionList's (RN layers them one-for-one).
// A thin re-export so consumers import from `section-list` without reaching into the lower layer.
export type {
  IVirtualizedSectionListProps as ISectionListProps,
  IVirtualizedSectionListHandle as ISectionListHandle,
  ISection,
} from '../virtualized-section-list/virtualized-section-list-props';
