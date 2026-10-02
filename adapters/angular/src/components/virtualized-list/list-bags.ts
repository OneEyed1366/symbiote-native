// The prop bags the list writes onto its scroll tag and refresh control, with the native callbacks
// that feed them, kept apart from the windowing lifecycle of the component

import { Directive, computed, signal, type OnChanges } from '@angular/core';
import {
  LIST_ACTION_KIND,
  readLayoutLength,
  readScrollOffset,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote-native/components';
import {
  dlog,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { countAngular } from '../../diagnostics';
import { VirtualizedListHandleBase } from './list-handle';

@Directive()
export abstract class VirtualizedListBagsBase<ItemT>
  extends VirtualizedListHandleBase<ItemT>
  implements OnChanges
{
  resolvedStyle: IViewStyle | undefined = undefined;
  resolvedContentContainerStyle: IStyleProp<IViewStyle> | undefined = undefined;
  resolvedMaintainVisibleContentPosition:
    | { minIndexForVisible: number; autoscrollToTopThreshold?: number }
    | undefined = undefined;
  // A fresh object per push, so the commit re-applies a repeated offset
  commandedOffset: { x: number; y: number } | undefined = undefined;

  // Only inputs may feed this signal, window state changes skip `ngOnChanges`
  private readonly inputsRevision = signal(0);

  // A computed hands back one object until an input changes, a getter rebuilt it per binding
  readonly foldedAccessibility = computed<
    IAccessibilityProps & IAriaProps & Record<string, unknown>
  >(() => {
    this.inputsRevision();
    return resolveAccessibilityProps({
      testID: this.testID,
      nativeID: this.nativeID,
      ...this.accessibilityInputProps(),
    });
  });

  // The one moment every changed input is written, before `ngDoCheck`
  ngOnChanges(): void {
    this.inputsRevision.update(revision => revision + 1);
  }

  get shouldRenderRefreshControl(): boolean {
    return this.refreshRequested ?? this.refresh.observed;
  }

  // A method, not a computed: most fields are plain and the directive diffs per key anyway
  scrollViewBag(): Record<string, unknown> {
    return {
      ...this.foldedAccessibility(),
      style: this.resolvedStyle,
      contentContainerStyle: this.resolvedContentContainerStyle,
      onScroll: this.onScrollTick,
      onLayout: this.onLayoutTick,
      onScrollBeginDrag: this.onScrollBeginDrag,
      onScrollEndDrag: this.onScrollEndDrag,
      onMomentumScrollBegin: this.onMomentumScrollBegin,
      onMomentumScrollEnd: this.onMomentumScrollEnd,
      scrollEventThrottle: this.scrollEventThrottle,
      keyboardShouldPersistTaps: this.keyboardShouldPersistTaps,
      keyboardDismissMode: this.keyboardDismissMode,
      removeClippedSubviews: this.removeClippedSubviews,
      nestedScrollEnabled: this.nestedScrollEnabled,
      // Android moves the scrollbar back after the `scale: -1` flip
      isInvertedVirtualizedList: this.isInverted ? true : undefined,
      contentOffset: this.commandedOffset,
      // `stickyHeaderIndices` is not forwarded, the cells carry the `sticky-header` tag instead
      maintainVisibleContentPosition:
        this.resolvedMaintainVisibleContentPosition,
      // The tag has no `.observed`, so `wantsGate` decides whether the flag reaches Fabric
      onAccessibilityAction: this.wantsGate('accessibilityAction')
        ? this.accessibilityActionTick
        : undefined,
      onAccessibilityTap: this.wantsGate('accessibilityTap')
        ? this.accessibilityTapTick
        : undefined,
      onMagicTap: this.wantsGate('magicTap') ? this.magicTapTick : undefined,
      onAccessibilityEscape: this.wantsGate('accessibilityEscape')
        ? this.accessibilityEscapeTick
        : undefined,
    };
  }

  refreshControlBag(): Record<string, unknown> {
    return {
      refreshing: this.refreshing ?? false,
      progressViewOffset: this.progressViewOffset,
      onRefresh: this.handleRefresh,
    };
  }

  // `onScroll` stays a callback so an `Animated.event` target can flow through it
  onScrollTick = (event: ISymbioteEvent): void => {
    countAngular('scrollTicks');
    const offset = readScrollOffset(event, this.isHorizontal);
    if (offset === undefined) return;
    dlog(`Angular VirtualizedList onScroll offset=${offset}`);
    // A real native scroll supersedes any pending commanded offset
    this.commandedOffset = undefined;
    this.dispatch({ kind: LIST_ACTION_KIND.scroll, offset });
    this.onScroll?.(event);
  };

  onLayoutTick = (event: ISymbioteEvent): void => {
    const length = readLayoutLength(event, this.isHorizontal);
    if (length === undefined) return;
    dlog(`Angular VirtualizedList onLayout viewport=${length}`);
    this.dispatch({ kind: LIST_ACTION_KIND.layout, length });
  };

  handleRefresh = (): void => {
    this.refresh.emit();
  };

  accessibilityActionTick = (event: ISymbioteEvent): void => {
    this.accessibilityAction.emit(event);
  };

  accessibilityTapTick = (event: ISymbioteEvent): void => {
    this.accessibilityTap.emit(event);
  };

  magicTapTick = (event: ISymbioteEvent): void => {
    this.magicTap.emit(event);
  };

  accessibilityEscapeTick = (event: ISymbioteEvent): void => {
    this.accessibilityEscape.emit(event);
  };
}
