// The app's own scroll listeners, read off the narrowed props and the attrs forwarded with them

import type { IUserScrollHandlers } from '@symbiote-native/components';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type { INarrowedProps } from './narrow-props';

function listenerOf(
  forwarded: Record<string, unknown>,
  name: string,
): ((event: ISymbioteEvent) => void) | undefined {
  const listener = forwarded[name];
  return typeof listener === 'function'
    ? (event: ISymbioteEvent): void => void listener(event)
    : undefined;
}

function sizeListenerOf(
  forwarded: Record<string, unknown>,
): ((width: number, height: number) => void) | undefined {
  const listener = forwarded.onContentSizeChange;
  return typeof listener === 'function'
    ? (width: number, height: number): void => void listener(width, height)
    : undefined;
}

export function userHandlersOf<ItemT>(
  props: INarrowedProps<ItemT>,
): IUserScrollHandlers {
  const { forwarded } = props;
  return {
    onContentSizeChange: sizeListenerOf(forwarded),
    onScroll: props.userOnScroll,
    onScrollBeginDrag: listenerOf(forwarded, 'onScrollBeginDrag'),
    onScrollEndDrag: listenerOf(forwarded, 'onScrollEndDrag'),
    onMomentumScrollBegin: listenerOf(forwarded, 'onMomentumScrollBegin'),
    onMomentumScrollEnd: listenerOf(forwarded, 'onMomentumScrollEnd'),
  };
}
