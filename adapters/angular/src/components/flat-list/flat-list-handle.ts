// The imperative scroll surface of the list, handed through to the list inside it

import { Directive } from '@angular/core';
import type {
  IScrollViewHandle,
  IVirtualizedListHandle,
} from '@symbiote-native/components';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { ListInputsBase } from '../virtualized-list/list-inputs';

@Directive()
export abstract class FlatListHandleBase<ItemT>
  extends ListInputsBase<ItemT>
  implements IVirtualizedListHandle
{
  // The composed inner list, whichever branch rendered, its instance is the scroll handle
  protected abstract readonly listRef?: IVirtualizedListHandle;

  scrollToOffset(params: { offset: number; animated?: boolean }): void {
    this.listRef?.scrollToOffset(params);
  }
  scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void {
    this.listRef?.scrollToIndex(params);
  }
  scrollToItem(params: {
    item: unknown;
    animated?: boolean;
    viewPosition?: number;
  }): void {
    this.listRef?.scrollToItem(params);
  }
  scrollToEnd(params?: { animated?: boolean }): void {
    this.listRef?.scrollToEnd(params);
  }
  flashScrollIndicators(): void {
    this.listRef?.flashScrollIndicators();
  }
  getNativeScrollRef(): ISymbioteNode | null {
    return this.listRef?.getNativeScrollRef() ?? null;
  }
  getScrollableNode(): IScrollViewHandle | null {
    return this.listRef?.getScrollableNode() ?? null;
  }
  getScrollResponder(): IScrollViewHandle | null {
    return this.listRef?.getScrollResponder() ?? null;
  }
  getScrollNode(): ISymbioteNode | null {
    return this.listRef?.getScrollNode() ?? null;
  }
  getScrollRef(): ISymbioteNode | null {
    return this.listRef?.getScrollRef() ?? null;
  }
  recordInteraction(): void {
    this.listRef?.recordInteraction();
  }
  setNativeProps(props: Record<string, unknown>): void {
    this.listRef?.setNativeProps(props);
  }
}
