import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Input,
  ViewChild,
  type SimpleChanges,
  type TemplateRef,
} from '@angular/core';
import {
  FLAT_LIST_TEMPLATE,
  FlatList,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
  View,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListOutletDirective,
  VListSeparatorDirective,
  VirtualizedList,
  provideGateDemand,
  type IFlatListProps,
  type IVListCellContext,
} from '@symbiote-native/angular';
import type { IAnimatedHostProps, IViewLike } from './animated-host-props';
import { LayoutAnimationConfig } from './layout-animation-config';

// One scroll event per frame, so an animation that follows the scroll has a value every frame
const EVERY_FRAME = 1;

type IRowStyle = IAnimatedHostProps<IViewLike>['style'];
type IRowLayout = IAnimatedHostProps<IViewLike>['layout'];
type ICellStyle =
  IRowStyle | ((info: { item: unknown; index: number }) => IRowStyle);

export type IAnimatedFlatListProps<ItemT> = IFlatListProps<ItemT> & {
  // Works for a single column only, as upstream's does
  itemLayoutAnimation?: IRowLayout;
  // Rows neither animate in nor out while the list mounts or unmounts
  skipEnteringExitingAnimations?: boolean;
  // A style for every row, or one made from the item and its index
  cellRendererComponentStyle?: ICellStyle;
};

// `FlatList` with a template of its own, so its inputs, outputs, slots and scroll handle stay
// The view around each cell is drawn here, in place of the app's `vListCell`
@Component({
  selector: 'AnimatedFlatList',
  standalone: true,
  viewProviders: [provideGateDemand(() => AnimatedFlatList)],
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    VirtualizedList,
    VListItemDirective,
    VListHeaderDirective,
    VListFooterDirective,
    VListEmptyDirective,
    VListSeparatorDirective,
    VListOutletDirective,
    View,
    SymbioteHostPropsDirective,
    LayoutAnimationConfig,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (skipEnteringExitingAnimations === undefined) {
      ${FLAT_LIST_TEMPLATE}
    } @else {
      <LayoutAnimationConfig [skipEntering]="true" [skipExiting]="true">
        ${FLAT_LIST_TEMPLATE}
      </LayoutAnimationConfig>
    }
    <ng-template
      #animatedCell
      let-item
      let-index="index"
      let-style="style"
      let-layout="layout"
      let-focus="focus"
      let-content="content"
      let-body="contentContext"
    >
      <view
        [symbioteHostProps]="rowProps(item, index, { style, layout, focus })"
      >
        <ng-container
          [vListOutlet]="content"
          [vListOutletContext]="body"
        ></ng-container>
      </view>
    </ng-template>
  `,
})
export class AnimatedFlatList<ItemT = unknown> extends FlatList<ItemT> {
  @Input() itemLayoutAnimation?: IRowLayout;
  @Input() skipEnteringExitingAnimations?: boolean;
  @Input() cellRendererComponentStyle?: ICellStyle;

  @ViewChild('animatedCell', { static: true })
  private animatedCell?: TemplateRef<IVListCellContext>;

  override get cellRendererTpl(): TemplateRef<IVListCellContext> | undefined {
    return this.animatedCell;
  }

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    this.scrollEventThrottle ??= EVERY_FRAME;
  }

  rowProps(
    item: unknown,
    index: number,
    cell: Pick<IVListCellContext, 'style' | 'layout' | 'focus'>,
  ): Record<string, unknown> {
    const own = this.cellRendererComponentStyle;
    return {
      layout: this.itemLayoutAnimation,
      onLayout: cell.layout,
      onFocus: cell.focus,
      style: [
        cell.style,
        typeof own === 'function' ? own({ item, index }) : own,
      ],
    };
  }
}
