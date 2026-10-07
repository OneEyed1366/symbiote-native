import { Directive, Input } from '@angular/core';
import type { IImageProps } from '@symbiote-native/components';
import type { IAngularImageBackgroundProps } from './components/image-background-props';
import type { IAngularScrollViewProps } from './components/scroll-view-props';
import { SymbioteElement } from './element-base';

@Directive({ selector: 'image, symbiote-image', standalone: true })
export class ImageElement extends SymbioteElement {
  @Input() source?: IImageProps['source'];
  @Input() src?: IImageProps['src'];
  @Input() srcSet?: IImageProps['srcSet'];
  @Input() alt?: IImageProps['alt'];
  @Input() width?: IImageProps['width'];
  @Input() height?: IImageProps['height'];
  @Input() resizeMode?: IImageProps['resizeMode'];
  @Input() resizeMethod?: IImageProps['resizeMethod'];
  @Input() defaultSource?: IImageProps['defaultSource'];
  @Input() loadingIndicatorSource?: IImageProps['loadingIndicatorSource'];
  @Input() blurRadius?: IImageProps['blurRadius'];
  @Input() capInsets?: IImageProps['capInsets'];
  @Input() crossOrigin?: IImageProps['crossOrigin'];
  @Input() referrerPolicy?: IImageProps['referrerPolicy'];
  @Input() fadeDuration?: IImageProps['fadeDuration'];
  @Input()
  progressiveRenderingEnabled?: IImageProps['progressiveRenderingEnabled'];
  @Input() tintColor?: IImageProps['tintColor'];
  @Input() onLoad?: IImageProps['onLoad'];
  @Input() onLoadStart?: IImageProps['onLoadStart'];
  @Input() onLoadEnd?: IImageProps['onLoadEnd'];
  @Input() onError?: IImageProps['onError'];
  @Input() onProgress?: IImageProps['onProgress'];
  @Input() onPartialLoad?: IImageProps['onPartialLoad'];
}

// The box, not the image. Every Image prop below rides the engine's `slotPropsExcept` redirect onto
// the absolutely-filled image the behavior builds, exactly as RN's own `...props` spread does
// (ImageBackground.js:81) — so this directive declares them to make the BINDING legal, and the
// engine decides which node each lands on.
@Directive({ selector: 'image-background', standalone: true })
export class ImageBackgroundElement extends SymbioteElement {
  @Input() imageStyle?: IAngularImageBackgroundProps['imageStyle'];
  @Input() source?: IImageProps['source'];
  @Input() src?: IImageProps['src'];
  @Input() srcSet?: IImageProps['srcSet'];
  @Input() alt?: IImageProps['alt'];
  @Input() width?: IImageProps['width'];
  @Input() height?: IImageProps['height'];
  @Input() resizeMode?: IImageProps['resizeMode'];
  @Input() resizeMethod?: IImageProps['resizeMethod'];
  @Input() defaultSource?: IImageProps['defaultSource'];
  @Input() loadingIndicatorSource?: IImageProps['loadingIndicatorSource'];
  @Input() blurRadius?: IImageProps['blurRadius'];
  @Input() capInsets?: IImageProps['capInsets'];
  @Input() crossOrigin?: IImageProps['crossOrigin'];
  @Input() referrerPolicy?: IImageProps['referrerPolicy'];
  @Input() fadeDuration?: IImageProps['fadeDuration'];
  @Input()
  progressiveRenderingEnabled?: IImageProps['progressiveRenderingEnabled'];
  @Input() tintColor?: IImageProps['tintColor'];
  @Input() onLoad?: IImageProps['onLoad'];
  @Input() onLoadStart?: IImageProps['onLoadStart'];
  @Input() onLoadEnd?: IImageProps['onLoadEnd'];
  @Input() onError?: IImageProps['onError'];
  @Input() onProgress?: IImageProps['onProgress'];
  @Input() onPartialLoad?: IImageProps['onPartialLoad'];
}

@Directive({ selector: 'scroll-view', standalone: true })
export class ScrollViewElement extends SymbioteElement {
  // No `horizontal` @Input: the axis is the TAG you write, never a prop — see
  // `../components/scroll-view-props.ts`'s header. `HorizontalScrollViewElement` below is the
  // other spelling, not a variant of this one.
  @Input() scrollEnabled?: IAngularScrollViewProps['scrollEnabled'];
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
  @Input() stickyHeaderIndices?: IAngularScrollViewProps['stickyHeaderIndices'];
  @Input() onScroll?: IAngularScrollViewProps['onScroll'];
  @Input() onScrollBeginDrag?: IAngularScrollViewProps['onScrollBeginDrag'];
  @Input() onScrollEndDrag?: IAngularScrollViewProps['onScrollEndDrag'];
  @Input()
  onMomentumScrollBegin?: IAngularScrollViewProps['onMomentumScrollBegin'];
  @Input() onMomentumScrollEnd?: IAngularScrollViewProps['onMomentumScrollEnd'];
  @Input() onScrollToTop?: IAngularScrollViewProps['onScrollToTop'];
  @Input() onContentSizeChange?: IAngularScrollViewProps['onContentSizeChange'];
  @Input()
  onKeyboardWillShow?: IAngularScrollViewProps['onKeyboardWillShow'];
  @Input()
  onKeyboardWillHide?: IAngularScrollViewProps['onKeyboardWillHide'];
  @Input() onKeyboardDidShow?: IAngularScrollViewProps['onKeyboardDidShow'];
  @Input() onKeyboardDidHide?: IAngularScrollViewProps['onKeyboardDidHide'];
  @Input()
  automaticallyAdjustContentInsets?: IAngularScrollViewProps['automaticallyAdjustContentInsets'];
  @Input()
  automaticallyAdjustsScrollIndicatorInsets?: IAngularScrollViewProps['automaticallyAdjustsScrollIndicatorInsets'];
  @Input()
  canCancelContentTouches?: IAngularScrollViewProps['canCancelContentTouches'];
  @Input()
  experimental_endDraggingSensitivityMultiplier?: IAngularScrollViewProps['experimental_endDraggingSensitivityMultiplier'];
  @Input() innerViewRef?: IAngularScrollViewProps['innerViewRef'];
  @Input()
  onScrollAnimationEnd?: IAngularScrollViewProps['onScrollAnimationEnd'];
  @Input() scrollPerfTag?: IAngularScrollViewProps['scrollPerfTag'];
  @Input()
  scrollToOverflowEnabled?: IAngularScrollViewProps['scrollToOverflowEnabled'];
  @Input()
  scrollsChildToFocus?: IAngularScrollViewProps['scrollsChildToFocus'];
  @Input() scrollsToTop?: IAngularScrollViewProps['scrollsToTop'];
  @Input()
  stickyHeaderHiddenOnScroll?: IAngularScrollViewProps['stickyHeaderHiddenOnScroll'];
}

@Directive({ selector: 'horizontal-scroll-view', standalone: true })
export class HorizontalScrollViewElement extends ScrollViewElement {}

@Directive({ selector: 'scroll-content', standalone: true })
export class ScrollContentElement extends SymbioteElement {}

@Directive({ selector: 'horizontal-scroll-content', standalone: true })
export class HorizontalScrollContentElement extends SymbioteElement {}
