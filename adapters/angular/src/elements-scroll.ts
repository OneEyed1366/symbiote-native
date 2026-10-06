// The scroll view directives, split from `./elements` for file size
import { Directive, Input } from '@angular/core';
import { SymbioteElement } from './element-base';
import type { IAngularScrollViewProps } from './components/scroll-view-props';

@Directive({ selector: 'scroll-view', standalone: true })
export class ScrollViewElement extends SymbioteElement {
  // No `horizontal` input: the axis is the tag you write (`../components/scroll-view-props.ts`)
  @Input() scrollEnabled?: IAngularScrollViewProps['scrollEnabled'];
  @Input()
  automaticallyAdjustContentInsets?: IAngularScrollViewProps['automaticallyAdjustContentInsets'];
  @Input()
  automaticallyAdjustsScrollIndicatorInsets?: IAngularScrollViewProps['automaticallyAdjustsScrollIndicatorInsets'];
  @Input()
  canCancelContentTouches?: IAngularScrollViewProps['canCancelContentTouches'];
  @Input()
  scrollToOverflowEnabled?: IAngularScrollViewProps['scrollToOverflowEnabled'];
  @Input() scrollsToTop?: IAngularScrollViewProps['scrollsToTop'];
  @Input()
  scrollsChildToFocus?: IAngularScrollViewProps['scrollsChildToFocus'];
  @Input() scrollPerfTag?: IAngularScrollViewProps['scrollPerfTag'];
  @Input()
  onScrollAnimationEnd?: IAngularScrollViewProps['onScrollAnimationEnd'];
  @Input() scrollEventThrottle?: IAngularScrollViewProps['scrollEventThrottle'];
  @Input()
  contentContainerStyle?: IAngularScrollViewProps['contentContainerStyle'];
  @Input() contentInset?: IAngularScrollViewProps['contentInset'];
  @Input()
  contentInsetAdjustmentBehavior?: IAngularScrollViewProps['contentInsetAdjustmentBehavior'];
  @Input() contentOffset?: IAngularScrollViewProps['contentOffset'];
  @Input()
  scrollIndicatorInsets?: IAngularScrollViewProps['scrollIndicatorInsets'];
  @Input()
  showsHorizontalScrollIndicator?: IAngularScrollViewProps['showsHorizontalScrollIndicator'];
  @Input()
  showsVerticalScrollIndicator?: IAngularScrollViewProps['showsVerticalScrollIndicator'];
  @Input()
  alwaysBounceHorizontal?: IAngularScrollViewProps['alwaysBounceHorizontal'];
  @Input()
  alwaysBounceVertical?: IAngularScrollViewProps['alwaysBounceVertical'];
  @Input() bounces?: IAngularScrollViewProps['bounces'];
  @Input() bouncesZoom?: IAngularScrollViewProps['bouncesZoom'];
  @Input() centerContent?: IAngularScrollViewProps['centerContent'];
  @Input() decelerationRate?: IAngularScrollViewProps['decelerationRate'];
  @Input()
  directionalLockEnabled?: IAngularScrollViewProps['directionalLockEnabled'];
  @Input()
  disableIntervalMomentum?: IAngularScrollViewProps['disableIntervalMomentum'];
  @Input() endFillColor?: IAngularScrollViewProps['endFillColor'];
  @Input() fadingEdgeLength?: IAngularScrollViewProps['fadingEdgeLength'];
  @Input() indicatorStyle?: IAngularScrollViewProps['indicatorStyle'];
  @Input() invertStickyHeaders?: IAngularScrollViewProps['invertStickyHeaders'];
  @Input() keyboardDismissMode?: IAngularScrollViewProps['keyboardDismissMode'];
  @Input()
  keyboardShouldPersistTaps?: IAngularScrollViewProps['keyboardShouldPersistTaps'];
  @Input()
  automaticallyAdjustKeyboardInsets?: IAngularScrollViewProps['automaticallyAdjustKeyboardInsets'];
  @Input()
  maintainVisibleContentPosition?: IAngularScrollViewProps['maintainVisibleContentPosition'];
  @Input() maximumZoomScale?: IAngularScrollViewProps['maximumZoomScale'];
  @Input() minimumZoomScale?: IAngularScrollViewProps['minimumZoomScale'];
  @Input() zoomScale?: IAngularScrollViewProps['zoomScale'];
  @Input() nestedScrollEnabled?: IAngularScrollViewProps['nestedScrollEnabled'];
  @Input() overScrollMode?: IAngularScrollViewProps['overScrollMode'];
  @Input() pagingEnabled?: IAngularScrollViewProps['pagingEnabled'];
  @Input() persistentScrollbar?: IAngularScrollViewProps['persistentScrollbar'];
  @Input() pinchGestureEnabled?: IAngularScrollViewProps['pinchGestureEnabled'];
  @Input() snapToAlignment?: IAngularScrollViewProps['snapToAlignment'];
  @Input() snapToEnd?: IAngularScrollViewProps['snapToEnd'];
  @Input() snapToInterval?: IAngularScrollViewProps['snapToInterval'];
  @Input() snapToOffsets?: IAngularScrollViewProps['snapToOffsets'];
  @Input() snapToStart?: IAngularScrollViewProps['snapToStart'];
  @Input()
  experimental_endDraggingSensitivityMultiplier?: IAngularScrollViewProps['experimental_endDraggingSensitivityMultiplier'];
  @Input() stickyHeaderIndices?: IAngularScrollViewProps['stickyHeaderIndices'];
  @Input()
  stickyHeaderHiddenOnScroll?: IAngularScrollViewProps['stickyHeaderHiddenOnScroll'];
  @Input() innerViewRef?: IAngularScrollViewProps['innerViewRef'];
  @Input() onScroll?: IAngularScrollViewProps['onScroll'];
  @Input() onScrollBeginDrag?: IAngularScrollViewProps['onScrollBeginDrag'];
  @Input() onScrollEndDrag?: IAngularScrollViewProps['onScrollEndDrag'];
  @Input()
  onMomentumScrollBegin?: IAngularScrollViewProps['onMomentumScrollBegin'];
  @Input() onMomentumScrollEnd?: IAngularScrollViewProps['onMomentumScrollEnd'];
  @Input() onScrollToTop?: IAngularScrollViewProps['onScrollToTop'];
  @Input() onContentSizeChange?: IAngularScrollViewProps['onContentSizeChange'];
}

@Directive({ selector: 'horizontal-scroll-view', standalone: true })
export class HorizontalScrollViewElement extends ScrollViewElement {}

@Directive({ selector: 'scroll-content', standalone: true })
export class ScrollContentElement extends SymbioteElement {}

@Directive({ selector: 'horizontal-scroll-content', standalone: true })
export class HorizontalScrollContentElement extends SymbioteElement {}
