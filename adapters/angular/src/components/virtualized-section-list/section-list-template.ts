// One synthesized `vListItem` template switches on the flattened entry kind and stamps the matching
// app template, since the inner list renders every cell through a single one

import { LIST_ACCESSIBILITY_FORWARD } from '../virtualized-list/list-a11y-forward';

export const VIRTUALIZED_SECTION_LIST_TEMPLATE = `
  <VirtualizedList
    [data]="flatEntries"
    [getItem]="getEntry"
    [getItemCount]="getEntryCount"
    [keyExtractor]="entryKeyExtractor"
    [getItemLayout]="entryItemLayout"
    [stickyHeaderIndices]="stickyHeaderIndices"
    [extraData]="extraData"
    [inverted]="inverted"
    [refreshing]="refreshing"
    [progressViewOffset]="progressViewOffset"
    [refreshRequested]="refreshRequested ?? refresh.observed"
    (refresh)="resolvedOnRefresh?.()"
    (endReached)="resolvedOnEndReached?.($event)"
    [onEndReachedThreshold]="onEndReachedThreshold"
    (startReached)="resolvedOnStartReached?.($event)"
    [onStartReachedThreshold]="onStartReachedThreshold"
    [initialNumToRender]="initialNumToRender"
    [initialScrollIndex]="initialScrollIndex"
    [maxToRenderPerBatch]="maxToRenderPerBatch"
    [updateCellsBatchingPeriod]="updateCellsBatchingPeriod"
    [windowSize]="windowSize"
    [maintainVisibleContentPosition]="maintainVisibleContentPosition"
    [onScroll]="onScroll"
    [onScrollBeginDrag]="onScrollBeginDrag"
    [onScrollEndDrag]="onScrollEndDrag"
    [onMomentumScrollBegin]="onMomentumScrollBegin"
    [onMomentumScrollEnd]="onMomentumScrollEnd"
    [scrollEventThrottle]="scrollEventThrottle"
    [keyboardShouldPersistTaps]="keyboardShouldPersistTaps"
    [keyboardDismissMode]="keyboardDismissMode"
    [removeClippedSubviews]="removeClippedSubviews"
    [nestedScrollEnabled]="nestedScrollEnabled"
    [style]="resolvedStyle"
    [contentContainerStyle]="contentContainerStyle"
    [testID]="testID"
    [nativeID]="nativeID"
    ${LIST_ACCESSIBILITY_FORWARD}
  >
    <!-- The single synthesized cell template: dispatch per flattened entry tag -->
    <ng-template vListItem let-entry let-separators="separators">
      @switch (entryKind(entry)) {
        @case ('header') {
          <ng-container
            [vListOutlet]="sectionHeaderDir?.templateRef"
            [vListOutletContext]="sectionContextOf(entry)"
          ></ng-container>
        }
        @case ('footer') {
          <ng-container
            [vListOutlet]="sectionFooterDir?.templateRef"
            [vListOutletContext]="sectionContextOf(entry)"
          ></ng-container>
        }
        @case ('section-separator') {
          <ng-container
            [vListOutlet]="sectionSeparatorDir?.templateRef"
          ></ng-container>
        }
        @case ('item') {
          <ng-container
            [vListOutlet]="sectionItemDir?.templateRef"
            [vListOutletContext]="itemContextOf(entry, separators)"
          ></ng-container>
        }
      }
    </ng-template>

    <!-- List-level slots: forward the app's directives to the inner list -->
    @if (listHeaderDir !== undefined) {
      <ng-template vListHeader>
        <ng-container [vListOutlet]="listHeaderDir.templateRef"></ng-container>
      </ng-template>
    }
    @if (listFooterDir !== undefined) {
      <ng-template vListFooter>
        <ng-container [vListOutlet]="listFooterDir.templateRef"></ng-container>
      </ng-template>
    }
    @if (listEmptyDir !== undefined) {
      <ng-template vListEmpty>
        <ng-container [vListOutlet]="listEmptyDir.templateRef"></ng-container>
      </ng-template>
    }
    <!-- Item separator: unwrap each flattened entry back to its item -->
    @if (itemSeparatorDir !== undefined) {
      <ng-template
        vListSeparator
        let-highlighted
        let-leadingItem="leadingItem"
        let-trailingItem="trailingItem"
      >
        <ng-container
          [vListOutlet]="itemSeparatorDir.templateRef"
          [vListOutletContext]="
            itemSeparatorContextOf(highlighted, leadingItem, trailingItem)
          "
        ></ng-container>
      </ng-template>
    }
  </VirtualizedList>
`;
