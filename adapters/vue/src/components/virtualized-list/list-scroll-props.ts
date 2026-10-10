// The props handed to the scroll tag: the shared list set over the attrs the consumer passed

import { buildListScrollProps } from '@symbiote-native/components';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type { INarrowedProps } from './narrow-props';

export type IScrollTagInputs<ItemT> = {
  props: INarrowedProps<ItemT>;
  total: number;
  hasHeader: boolean;
  // The handlers that also reach the nested lists replace the app's own, which they call
  onScroll: (event: ISymbioteEvent) => void;
  onScrollBeginDrag: (event: ISymbioteEvent) => void;
  onScrollEndDrag: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd: (event: ISymbioteEvent) => void;
  onContentSizeChange: (width: number, height: number) => void;
  onLayout: (event: ISymbioteEvent) => void;
  setRef: (el: unknown) => void;
  commandedOffset: { x: number; y: number } | undefined;
};

export function buildScrollProps<ItemT>(
  inputs: IScrollTagInputs<ItemT>,
): Record<string, unknown> {
  const { props, setRef, ...tagInputs } = inputs;
  return {
    ...buildListScrollProps({ ...props, ...tagInputs }, props.forwarded),
    ref: setRef,
  };
}
