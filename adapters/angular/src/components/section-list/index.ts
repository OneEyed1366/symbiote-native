// SectionList, a pure forwarder over VirtualizedSectionList, mirroring RN's layering
// A content query does not resolve across a second `<ng-content>` hop, so the app's templates are
// captured here and re-stamped onto the inner list

import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ElementRef,
  Input,
  ViewChild,
  inject,
} from '@angular/core';
import type {
  IScrollViewHandle,
  ISection,
  IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import {
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListSeparatorDirective,
  type IVListSeparatorContext,
} from '../virtualized-list';
import { VListOutletDirective } from '../virtualized-list/directives';
import { LIST_ACCESSIBILITY_FORWARD } from '../virtualized-list/list-a11y-forward';
import { ListEventsBase } from '../virtualized-list/list-events';
import { provideGateDemand } from '../../gate-demand';
import {
  stableAnchorStyle,
  SymbioteStyleInputDirective,
} from '../../primitives';
import {
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
  VirtualizedSectionList,
  type IVirtualizedSectionListProps,
} from '../virtualized-section-list';

// The separator context arrives typed `unknown`, the directive is matched structurally in the
// template with no type argument to pin the item type. The narrowest cast for that gap
function asItem<ItemT>(value: unknown): ItemT | undefined {
  return value as ItemT | undefined;
}

export type { ISection } from '@symbiote-native/components';
export type ISectionListHandle = IVirtualizedSectionListHandle;

// Re-exported so app code gets the whole `vSection*` and `vList*` authoring surface from here
export {
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
} from '../virtualized-section-list';
export {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListSeparatorDirective,
} from '../virtualized-list';

// RN layers the two one-for-one, so the prop type is shared verbatim
export type ISectionListProps<ItemT> = IVirtualizedSectionListProps<ItemT>;

// The plain inputs: the full surface minus the events exposed as real outputs
export type ISectionListInputs<ItemT> = Omit<
  ISectionListProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'SectionList',
  standalone: true,
  viewProviders: [provideGateDemand(() => SectionList)],
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  imports: [
    VirtualizedSectionList,
    VSectionItemDirective,
    VSectionHeaderDirective,
    VSectionFooterDirective,
    VSectionSeparatorDirective,
    VListHeaderDirective,
    VListFooterDirective,
    VListEmptyDirective,
    VListSeparatorDirective,
    VListOutletDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <VirtualizedSectionList
      [sections]="sections"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [stickySectionHeadersEnabled]="stickySectionHeadersEnabled"
      [extraData]="extraData"
      (endReached)="endReached.emit($event)"
      [onEndReachedThreshold]="onEndReachedThreshold"
      (startReached)="startReached.emit($event)"
      [onStartReachedThreshold]="onStartReachedThreshold"
      (refresh)="refresh.emit()"
      [refreshRequested]="refresh.observed"
      [refreshing]="refreshing"
      [progressViewOffset]="progressViewOffset"
      [initialNumToRender]="initialNumToRender"
      [initialScrollIndex]="initialScrollIndex"
      [maxToRenderPerBatch]="maxToRenderPerBatch"
      [updateCellsBatchingPeriod]="updateCellsBatchingPeriod"
      [windowSize]="windowSize"
      [inverted]="inverted"
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
      <ng-template
        vSectionItem
        let-item
        let-index="index"
        let-section="section"
        let-separators="separators"
      >
        <ng-container
          [vListOutlet]="sectionItemDir?.templateRef"
          [vListOutletContext]="{
            $implicit: item,
            item,
            index,
            section,
            separators,
          }"
        ></ng-container>
      </ng-template>
      @if (sectionHeaderDir !== undefined) {
        <ng-template vSectionHeader let-section>
          <ng-container
            [vListOutlet]="sectionHeaderDir.templateRef"
            [vListOutletContext]="{ $implicit: section, section }"
          ></ng-container>
        </ng-template>
      }
      @if (sectionFooterDir !== undefined) {
        <ng-template vSectionFooter let-section>
          <ng-container
            [vListOutlet]="sectionFooterDir.templateRef"
            [vListOutletContext]="{ $implicit: section, section }"
          ></ng-container>
        </ng-template>
      }
      @if (sectionSeparatorDir !== undefined) {
        <ng-template vSectionSeparator>
          <ng-container
            [vListOutlet]="sectionSeparatorDir.templateRef"
          ></ng-container>
        </ng-template>
      }
      @if (listHeaderDir !== undefined) {
        <ng-template vListHeader>
          <ng-container
            [vListOutlet]="listHeaderDir.templateRef"
          ></ng-container>
        </ng-template>
      }
      @if (listFooterDir !== undefined) {
        <ng-template vListFooter>
          <ng-container
            [vListOutlet]="listFooterDir.templateRef"
          ></ng-container>
        </ng-template>
      }
      @if (listEmptyDir !== undefined) {
        <ng-template vListEmpty>
          <ng-container [vListOutlet]="listEmptyDir.templateRef"></ng-container>
        </ng-template>
      }
      @if (itemSeparatorDir !== undefined) {
        <ng-template
          vListSeparator
          let-highlighted="highlighted"
          let-leadingItem="leadingItem"
          let-trailingItem="trailingItem"
        >
          <ng-container
            [vListOutlet]="itemSeparatorDir.templateRef"
            [vListOutletContext]="
              itemSeparatorContext(highlighted, leadingItem, trailingItem)
            "
          ></ng-container>
        </ng-template>
      }
    </VirtualizedSectionList>
  `,
})
export class SectionList<ItemT = unknown>
  extends ListEventsBase
  implements ISectionListInputs<ItemT>, IVirtualizedSectionListHandle
{
  @Input({ required: true }) sections!: ReadonlyArray<ISection<ItemT>>;
  @Input() keyExtractor?: (item: ItemT, index: number) => string;
  // Passed through flat, `VirtualizedSectionList` owns the sections-versus-entries wrapper
  @Input() getItemLayout?: (
    data: ReadonlyArray<ISection<ItemT>> | null,
    index: number,
  ) => { length: number; offset: number; index: number };
  @Input() stickySectionHeadersEnabled?: boolean;
  @Input() extraData?: unknown;
  @Input() onEndReachedThreshold?: number;
  @Input() onStartReachedThreshold?: number;
  @Input() refreshing?: boolean | null;
  @Input() progressViewOffset?: number;
  @Input() initialNumToRender?: number;
  @Input() initialScrollIndex?: number;
  @Input() maxToRenderPerBatch?: number;
  @Input() updateCellsBatchingPeriod?: number;
  @Input() windowSize?: number;
  @Input() inverted?: boolean;
  @Input() maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  @Input() onScroll?: (event: ISymbioteEvent) => void;
  @Input() onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  @Input() onScrollEndDrag?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  @Input() scrollEventThrottle?: number;
  @Input() keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  @Input() keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  @Input() removeClippedSubviews?: boolean;
  @Input() nestedScrollEnabled?: boolean;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() contentContainerStyle?: IStyleProp<IViewStyle>;
  @Input() testID?: string;
  @Input() nativeID?: string;

  // A flat object bound to `[style]`, merged with this host's own class-derived style. A fresh
  // object per read would defeat the inner list's dedup gate, `stableAnchorStyle` keeps it steady
  private cachedResolvedStyle: Record<string, unknown> | undefined;
  get resolvedStyle(): IViewStyle {
    this.cachedResolvedStyle = stableAnchorStyle(
      this.elementRef,
      this.style,
      this.cachedResolvedStyle,
    );
    return this.cachedResolvedStyle;
  }

  // The app's templates, captured from directly projected content and re-stamped above
  @ContentChild(VSectionItemDirective)
  sectionItemDir?: VSectionItemDirective<ItemT>;
  @ContentChild(VSectionHeaderDirective)
  sectionHeaderDir?: VSectionHeaderDirective<ItemT>;
  @ContentChild(VSectionFooterDirective)
  sectionFooterDir?: VSectionFooterDirective<ItemT>;
  @ContentChild(VSectionSeparatorDirective)
  sectionSeparatorDir?: VSectionSeparatorDirective;
  @ContentChild(VListHeaderDirective) listHeaderDir?: VListHeaderDirective;
  @ContentChild(VListFooterDirective) listFooterDir?: VListFooterDirective;
  @ContentChild(VListEmptyDirective) listEmptyDir?: VListEmptyDirective;
  @ContentChild(VListSeparatorDirective)
  itemSeparatorDir?: VListSeparatorDirective<ItemT>;

  // The inner list, whose instance is the scroll handle, reads lazily
  @ViewChild(VirtualizedSectionList)
  private list?: VirtualizedSectionList<ItemT>;

  // This component's own host, the anchor `class="..."` resolves onto, not the inner list's
  private readonly elementRef = inject(ElementRef);

  // The leading and trailing items arrive `unknown` from the template's `let` bindings, already
  // unwrapped to real items
  itemSeparatorContext(
    highlighted: unknown,
    leadingItem: unknown,
    trailingItem: unknown,
  ): IVListSeparatorContext<ItemT> {
    const isHighlighted = highlighted === true;
    return {
      $implicit: isHighlighted,
      highlighted: isHighlighted,
      leadingItem: asItem<ItemT>(leadingItem),
      trailingItem: asItem<ItemT>(trailingItem),
    };
  }

  scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void {
    this.list?.scrollToLocation(params);
  }

  flashScrollIndicators(): void {
    this.list?.flashScrollIndicators();
  }

  getNativeScrollRef(): IScrollViewHandle | null {
    return this.list?.getNativeScrollRef() ?? null;
  }

  getScrollableNode(): IScrollViewHandle | null {
    return this.list?.getScrollableNode() ?? null;
  }

  getScrollResponder(): IScrollViewHandle | null {
    return this.list?.getScrollResponder() ?? null;
  }

  getScrollNode(): ISymbioteNode | null {
    return this.list?.getScrollNode() ?? null;
  }

  recordInteraction(): void {
    this.list?.recordInteraction();
  }
}
