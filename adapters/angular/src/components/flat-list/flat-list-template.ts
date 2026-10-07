// A content query does not resolve across a second `<ng-content>` hop, so both branches re-stamp
// the app's templates instead of projecting them (see `flat-list.test.ts`)

import { LIST_ACCESSIBILITY_FORWARD } from '../virtualized-list/list-a11y-forward';

export const FLAT_LIST_TEMPLATE = `
  @if (isMultiColumn) {
    <VirtualizedList
      [data]="rows"
      [getItem]="getRow"
      [getItemCount]="getRowCount"
      [keyExtractor]="rowKey"
      [getItemLayout]="getItemLayout"
      [horizontal]="horizontal"
      [inverted]="inverted"
      [extraData]="extraData"
      (endReached)="endReached.emit($event)"
      [onEndReachedThreshold]="onEndReachedThreshold"
      (startReached)="startReached.emit($event)"
      [onStartReachedThreshold]="onStartReachedThreshold"
      (refresh)="refresh.emit()"
      [refreshRequested]="refresh.observed"
      [refreshing]="refreshing"
      [progressViewOffset]="progressViewOffset"
      (viewableItemsChanged)="rowViewableItemsChanged($event)"
      [viewabilityConfig]="viewabilityConfig"
      [viewabilityConfigCallbackPairs]="rowViewabilityPairs"
      (scrollToIndexFailed)="scrollToIndexFailed.emit($event)"
      [initialNumToRender]="initialNumToRender"
      [initialScrollIndex]="initialScrollIndex"
      [maxToRenderPerBatch]="maxToRenderPerBatch"
      [updateCellsBatchingPeriod]="updateCellsBatchingPeriod"
      [windowSize]="windowSize"
      [disableVirtualization]="disableVirtualization"
      [stickyHeaderIndices]="stickyHeaderIndices"
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
      [removeClippedSubviews]="resolvedRemoveClippedSubviews"
      [nestedScrollEnabled]="nestedScrollEnabled"
      [stickyHeaderHiddenOnScroll]="stickyHeaderHiddenOnScroll"
      [innerViewRef]="innerViewRef"
      [testID]="testID"
      [nativeID]="nativeID"
      [style]="resolvedStyle"
      [contentContainerStyle]="contentContainerStyle"
      [listHeaderComponentStyle]="listHeaderComponentStyle"
      [listFooterComponentStyle]="listFooterComponentStyle"
      [cellRendererTemplate]="cellDir?.templateRef"
      ${LIST_ACCESSIBILITY_FORWARD}
    >
      <ng-template vListItem let-row let-separators="separators">
        <view [style]="rowStyle">
          @for (cell of rowCells(row, separators); track cell.key) {
            <view [style]="columnCellStyle">
              <ng-container
                [vListOutlet]="itemDir?.templateRef"
                [vListOutletComponent]="itemComponent"
                [vListOutletContext]="cell.context"
              ></ng-container>
            </view>
          }
        </view>
      </ng-template>
      @if (headerDir !== undefined) {
        <ng-template vListHeader>
          <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
        </ng-template>
      }
      @if (footerDir !== undefined) {
        <ng-template vListFooter>
          <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
        </ng-template>
      }
      @if (emptyDir !== undefined) {
        <ng-template vListEmpty>
          <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
        </ng-template>
      }
      @if (separatorDir !== undefined) {
        <ng-template
          vListSeparator
          let-highlighted="highlighted"
          let-leadingItem="leadingItem"
          let-trailingItem="trailingItem"
        >
          <ng-container
            [vListOutlet]="separatorDir.templateRef"
            [vListOutletContext]="
              rowSeparatorContext(highlighted, leadingItem, trailingItem)
            "
          ></ng-container>
        </ng-template>
      }
    </VirtualizedList>
  } @else {
    <VirtualizedList
      [data]="data"
      [getItem]="getFlatItem"
      [getItemCount]="getFlatCount"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [horizontal]="horizontal"
      [inverted]="inverted"
      [extraData]="extraData"
      (endReached)="endReached.emit($event)"
      [onEndReachedThreshold]="onEndReachedThreshold"
      (startReached)="startReached.emit($event)"
      [onStartReachedThreshold]="onStartReachedThreshold"
      (refresh)="refresh.emit()"
      [refreshRequested]="refresh.observed"
      [refreshing]="refreshing"
      [progressViewOffset]="progressViewOffset"
      (viewableItemsChanged)="viewableItemsChanged.emit($event)"
      [viewabilityConfig]="viewabilityConfig"
      [viewabilityConfigCallbackPairs]="viewabilityConfigCallbackPairs"
      (scrollToIndexFailed)="scrollToIndexFailed.emit($event)"
      [initialNumToRender]="initialNumToRender"
      [initialScrollIndex]="initialScrollIndex"
      [maxToRenderPerBatch]="maxToRenderPerBatch"
      [updateCellsBatchingPeriod]="updateCellsBatchingPeriod"
      [windowSize]="windowSize"
      [disableVirtualization]="disableVirtualization"
      [stickyHeaderIndices]="stickyHeaderIndices"
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
      [removeClippedSubviews]="resolvedRemoveClippedSubviews"
      [nestedScrollEnabled]="nestedScrollEnabled"
      [stickyHeaderHiddenOnScroll]="stickyHeaderHiddenOnScroll"
      [innerViewRef]="innerViewRef"
      [testID]="testID"
      [nativeID]="nativeID"
      [style]="resolvedStyle"
      [contentContainerStyle]="contentContainerStyle"
      [listHeaderComponentStyle]="listHeaderComponentStyle"
      [listFooterComponentStyle]="listFooterComponentStyle"
      [cellRendererTemplate]="cellDir?.templateRef"
      [itemTemplate]="itemDir?.templateRef"
      [listItemComponent]="listItemComponent"
      [itemSeparatorTemplate]="separatorDir?.templateRef"
      ${LIST_ACCESSIBILITY_FORWARD}
    >
      @if (headerDir !== undefined) {
        <ng-template vListHeader>
          <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
        </ng-template>
      }
      @if (footerDir !== undefined) {
        <ng-template vListFooter>
          <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
        </ng-template>
      }
      @if (emptyDir !== undefined) {
        <ng-template vListEmpty>
          <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
        </ng-template>
      }
    </VirtualizedList>
  }
`;
