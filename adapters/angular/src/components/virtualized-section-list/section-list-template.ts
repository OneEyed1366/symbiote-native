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
    [horizontal]="horizontal"
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
    [disableVirtualization]="disableVirtualization"
    [maintainVisibleContentPosition]="maintainVisibleContentPosition"
    [onScroll]="onScroll"
    [onScrollBeginDrag]="onScrollBeginDrag"
    [onScrollEndDrag]="onScrollEndDrag"
    [onMomentumScrollBegin]="onMomentumScrollBegin"
    [onMomentumScrollEnd]="onMomentumScrollEnd"
    [onContentSizeChange]="onContentSizeChange"
    [scrollEventThrottle]="scrollEventThrottle"
    [keyboardShouldPersistTaps]="keyboardShouldPersistTaps"
    [keyboardDismissMode]="keyboardDismissMode"
    [removeClippedSubviews]="removeClippedSubviews"
    [nestedScrollEnabled]="nestedScrollEnabled"
    [stickyHeaderHiddenOnScroll]="stickyHeaderHiddenOnScroll"
    [innerViewRef]="innerViewRef"
    [style]="resolvedStyle"
    [contentContainerStyle]="contentContainerStyle"
    [listHeaderComponentStyle]="listHeaderComponentStyle"
    [listFooterComponentStyle]="listFooterComponentStyle"
    [cellRendererTemplate]="cellRendererTpl"
    [testID]="testID"
    [nativeID]="nativeID"
    ${LIST_ACCESSIBILITY_FORWARD}
  >
    <!-- The single synthesized cell template: dispatch per flattened entry tag -->
    <ng-template vListItem let-entry let-index="index">
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
        @case ('item') {
          @let plan = cellPlanOf(entry, index);
          @if (plan !== undefined) {
            <ng-container
              vSectionCell
              #cell="vSectionCell"
              [board]="board"
              [cellKey]="plan.cellKey"
              [prevCellKey]="plan.prevCellKey"
              [hasLeading]="plan.hasLeading"
              [hasTrailing]="plan.hasTrailing"
            >
              <ng-container
                [vListOutlet]="plan.first.template"
                [vListOutletContext]="cell.contextOf(plan.first)"
              ></ng-container>
              <ng-container
                [vListOutlet]="plan.itemTemplate"
                [vListOutletContext]="itemContextOf(entry, cell.separators)"
              ></ng-container>
              <ng-container
                [vListOutlet]="plan.second.template"
                [vListOutletContext]="cell.contextOf(plan.second)"
              ></ng-container>
            </ng-container>
          }
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
  </VirtualizedList>
`;
