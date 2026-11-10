import {
  createElement,
  useMemo,
  useRef,
  type ReactElement,
  type Ref,
  type RefObject,
} from 'react';
import {
  FlatList,
  type ICellRendererProps,
  type IFlatListHandle,
  type IFlatListProps,
  type IViewProps,
} from '@symbiote-native/react';
import type { IAnimatedHostProps } from './animated-host-props';
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
  // The list wraps its rows in its own cell component, which the author cannot replace
  CellRendererComponent?: never;
  // A style for every row, or one made from the item and its index
  CellRendererComponentStyle?:
    IRowStyle | ((info: { item: ItemT; index: number }) => IRowStyle);
  ref?: Ref<IFlatListHandle>;
};

type IRowStyleOf = (index: number) => IRowStyle;

// Read from the list's own data, so the item the author's function gets keeps its type
function cellStyleResolver<ItemT>(
  source: IAnimatedFlatListProps<ItemT>['CellRendererComponentStyle'],
  data: readonly ItemT[],
): IRowStyleOf {
  return index => {
    if (typeof source !== 'function') return source;
    const item = data[index];
    return item === undefined ? undefined : source({ item, index });
  };
}

// Built once and reading the latest props through refs, so a prop change never remounts the rows
function createRowComponent(
  layoutRef: RefObject<IRowLayout>,
  styleRef: RefObject<IRowStyleOf>,
) {
  return (props: ICellRendererProps<unknown>): ReactElement =>
    createElement(
      'view',
      {
        layout: layoutRef.current,
        onLayout: props.onLayout,
        onFocus: props.onFocus,
        style: [props.style, styleRef.current(props.index)],
      },
      props.children,
    );
}

export function AnimatedFlatList<ItemT>({
  itemLayoutAnimation,
  skipEnteringExitingAnimations,
  CellRendererComponentStyle,
  ...rest
}: IAnimatedFlatListProps<ItemT>): ReactElement {
  const layoutRef = useRef(itemLayoutAnimation);
  layoutRef.current = itemLayoutAnimation;
  const resolver = cellStyleResolver(CellRendererComponentStyle, rest.data);
  const styleRef = useRef(resolver);
  styleRef.current = resolver;
  const CellRendererComponent = useMemo(
    () => createRowComponent(layoutRef, styleRef),
    [],
  );

  const list = createElement(FlatList<ItemT>, {
    scrollEventThrottle: EVERY_FRAME,
    ...rest,
    CellRendererComponent,
  });
  if (skipEnteringExitingAnimations === undefined) return list;
  return createElement(
    LayoutAnimationConfig,
    { skipEntering: true, skipExiting: true },
    list,
  );
}
