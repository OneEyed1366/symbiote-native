// The imperative scroll surface of the list, kept apart so the component stays on windowing

import { Directive } from '@angular/core';
import {
  EMPTY_OFFSET,
  FIRST_INDEX,
  LIST_ACTION_KIND,
  type IListAction,
  type IScrollViewHandle,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { VirtualizedListInputs } from './list-inputs';

@Directive()
export abstract class VirtualizedListHandleBase<ItemT>
  extends VirtualizedListInputs<ItemT>
  implements IVirtualizedListHandle
{
  protected abstract readonly scrollHandle: IScrollViewHandle;

  protected abstract get scrollNode(): ISymbioteNode | null;

  protected abstract dispatch(action: IListAction<ItemT>): void;

  scrollToOffset(params: { offset: number; animated?: boolean }): void {
    this.dispatch({
      kind: LIST_ACTION_KIND.scrollToOffset,
      offset: params.offset,
      animated: params.animated ?? true,
    });
  }

  scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void {
    this.dispatch({
      kind: LIST_ACTION_KIND.scrollToIndex,
      index: params.index,
      animated: params.animated ?? true,
      viewPosition: params.viewPosition ?? FIRST_INDEX,
      viewOffset: params.viewOffset ?? EMPTY_OFFSET,
    });
  }

  scrollToItem(params: {
    item: unknown;
    animated?: boolean;
    viewPosition?: number;
  }): void {
    this.dispatch({
      kind: LIST_ACTION_KIND.scrollToItem,
      item: params.item,
      animated: params.animated ?? true,
      viewPosition: params.viewPosition ?? FIRST_INDEX,
    });
  }

  scrollToEnd(params?: { animated?: boolean }): void {
    this.dispatch({
      kind: LIST_ACTION_KIND.scrollToEnd,
      animated: params?.animated ?? true,
    });
  }

  flashScrollIndicators(): void {
    this.scrollHandle.flashScrollIndicators();
  }

  // Null until the scroll tag commits, RN's "no scroll view yet" answer
  private handleOrNull(): IScrollViewHandle | null {
    return this.scrollNode === null ? null : this.scrollHandle;
  }

  getNativeScrollRef(): IScrollViewHandle | null {
    return this.handleOrNull();
  }

  getScrollableNode(): IScrollViewHandle | null {
    return this.handleOrNull();
  }

  getScrollResponder(): IScrollViewHandle | null {
    return this.handleOrNull();
  }

  getScrollNode(): ISymbioteNode | null {
    return this.scrollHandle.getScrollNode();
  }

  getScrollRef(): ISymbioteNode | null {
    return this.scrollHandle.getScrollNode();
  }

  recordInteraction(): void {
    this.dispatch({ kind: LIST_ACTION_KIND.recordInteraction });
  }

  setNativeProps(props: Record<string, unknown>): void {
    this.scrollNode?.setNativeProps(props);
  }
}
