import { createComponent, createMemo, mergeProps, splitProps } from 'solid-js';
import { FlatList } from '@symbiote-native/solid';
import type {
  ICellRendererProps,
  IFlatListProps,
  IViewProps,
} from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import type { ISymbioteNode } from '@symbiote-native/engine';
import type { IAnimatedHostProps } from './animated-host-props';
import { hostNode } from './host-node';
import { LayoutAnimationConfig } from './layout-animation-config';

// One scroll event per frame, so an animation that follows the scroll has a value every frame
const EVERY_FRAME = 1;

type IRowStyle = IAnimatedHostProps<IViewProps>['style'];
type IRowLayout = IAnimatedHostProps<IViewProps>['layout'];

export type IAnimatedFlatListProps<ItemT> = Omit<
  IFlatListProps<ItemT>,
  'CellRendererComponent'
> & {
  // Works for a single column only, as upstream's does
  itemLayoutAnimation?: IRowLayout;
  // Rows neither animate in nor out while the list mounts or unmounts
  skipEnteringExitingAnimations?: boolean;
  // A style for every row, or one made from the item and its index
  CellRendererComponentStyle?:
    IRowStyle | ((info: { item: unknown; index: number }) => IRowStyle);
};

type IOwnProps = Pick<
  IAnimatedFlatListProps<unknown>,
  | 'itemLayoutAnimation'
  | 'skipEnteringExitingAnimations'
  | 'CellRendererComponentStyle'
>;

function rowStyleOf(
  source: IOwnProps['CellRendererComponentStyle'],
  cell: ICellRendererProps<unknown>,
) {
  return typeof source === 'function'
    ? source({ item: cell.item, index: cell.index })
    : source;
}

export function AnimatedFlatList<ItemT>(
  props: IAnimatedFlatListProps<ItemT>,
): JSX.Element {
  const [own, rest] = splitProps(props, [
    'itemLayoutAnimation',
    'skipEnteringExitingAnimations',
    'CellRendererComponentStyle',
  ]);
  // Built once and reading the latest props when it renders, so a change never remounts the rows
  const Row = (cell: ICellRendererProps<unknown>): ISymbioteNode =>
    hostNode(
      'view',
      () => ({
        layout: own.itemLayoutAnimation,
        onLayout: cell.onLayout,
        onFocus: cell.onFocus,
        style: [cell.style, rowStyleOf(own.CellRendererComponentStyle, cell)],
      }),
      () => cell.children,
    );
  const list = () =>
    createComponent(
      FlatList<ItemT>,
      mergeProps({ scrollEventThrottle: EVERY_FRAME }, rest, {
        CellRendererComponent: Row,
      }),
    );
  const isSkipping = createMemo(
    () => own.skipEnteringExitingAnimations !== undefined,
  );
  return createMemo(() =>
    isSkipping()
      ? createComponent(LayoutAnimationConfig, {
          skipEntering: true,
          skipExiting: true,
          get children() {
            return list();
          },
        })
      : list(),
  );
}
