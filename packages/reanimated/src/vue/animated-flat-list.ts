import {
  defineComponent,
  h,
  type FunctionalComponent,
} from '@vue/runtime-core';
import {
  FlatList,
  type IFlatListProps,
  type IViewProps,
} from '@symbiote-native/vue';
import type { IAnimatedHostProps } from './animated-host-props';
import { LayoutAnimationConfig } from './layout-animation-config';

// One scroll event per frame, so an animation that follows the scroll has a value every frame
const EVERY_FRAME = 1;

type IRowStyle = IAnimatedHostProps<IViewProps>['style'];
type IRowLayout = IAnimatedHostProps<IViewProps>['layout'];

export type IAnimatedFlatListProps<ItemT> = Omit<
  IFlatListProps<ItemT>,
  'cellRendererComponent'
> & {
  // Works for a single column only, as upstream's does
  itemLayoutAnimation?: IRowLayout;
  // Rows neither animate in nor out while the list mounts or unmounts
  skipEnteringExitingAnimations?: boolean;
  // A style for every row, or one made from the item and its index. Spelled as the other props
  // of the Vue list, which start with a small letter
  cellRendererComponentStyle?:
    IRowStyle | ((info: { item: unknown; index: number }) => IRowStyle);
};

type IOwnProps = Pick<
  IAnimatedFlatListProps<unknown>,
  | 'itemLayoutAnimation'
  | 'skipEnteringExitingAnimations'
  | 'cellRendererComponentStyle'
>;

type ICell = { item: unknown; index: number };

// The generic construct signature of the list is what `h` cannot resolve
function isLooseList(
  _list: unknown,
): _list is FunctionalComponent<Record<string, unknown>> {
  return true;
}

function looseList(): FunctionalComponent<Record<string, unknown>> {
  if (!isLooseList(FlatList)) throw new Error('unreachable');
  return FlatList;
}

function rowStyleOf(
  source: IOwnProps['cellRendererComponentStyle'],
  cell: ICell,
) {
  return typeof source === 'function' ? source(cell) : source;
}

export const AnimatedFlatList = defineComponent({
  name: 'AnimatedFlatList',
  inheritAttrs: false,
  props: [
    'itemLayoutAnimation',
    'skipEnteringExitingAnimations',
    'cellRendererComponentStyle',
  ],
  setup(props: IOwnProps, { attrs, slots }) {
    // Built once and reading the latest props when it renders, so a change never remounts the rows
    const Row = defineComponent({
      name: 'AnimatedFlatListRow',
      props: ['cellKey', 'index', 'item', 'style', 'onLayout', 'onFocus'],
      setup(cell: ICell & Record<string, unknown>, { slots: cellSlots }) {
        return () =>
          h(
            'view',
            {
              layout: props.itemLayoutAnimation,
              onLayout: cell.onLayout,
              onFocus: cell.onFocus,
              style: [
                cell.style,
                rowStyleOf(props.cellRendererComponentStyle, cell),
              ],
            },
            cellSlots.default?.(),
          );
      },
    });
    const List = looseList();
    return () => {
      const list = h(
        List,
        {
          scrollEventThrottle: EVERY_FRAME,
          ...attrs,
          cellRendererComponent: Row,
        },
        slots,
      );
      if (props.skipEnteringExitingAnimations === undefined) return list;
      return h(
        LayoutAnimationConfig,
        { skipEntering: true, skipExiting: true },
        () => list,
      );
    };
  },
});
