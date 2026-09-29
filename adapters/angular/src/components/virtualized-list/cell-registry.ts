// Everything a windowed list keeps per cell between passes: the context objects (reused by
// identity), the measure closures, and the separator overrides a row drives through `separators`

import {
  isSeparatorGapInRange,
  readLayoutLength,
  readLayoutOffset,
  type ISeparatorProps,
  type ISeparators,
} from '@symbiote-native/components';
import { dlog, type ISymbioteEvent } from '@symbiote-native/engine';
import type { IVListItemContext, IVListSeparatorContext } from './directives';

// One in-window cell, assembled per pass and stamped by the template's `@for`
export interface IWindowCell<ItemT> {
  key: string;
  index: number;
  context: IVListItemContext<ItemT>;
  measure: (event: ISymbioteEvent) => void;
  separatorContext?: IVListSeparatorContext<ItemT>;
  // Picks the cell's TAG in the template: `sticky-header` pins, `view` does not. Stable per cell
  // key, so the `@if` never swaps an element type under a live cell as the window slides
  isSticky: boolean;
}

export type ICellHost<ItemT> = {
  itemAt: (index: number) => ItemT;
  itemCount: () => number;
  isHorizontal: () => boolean;
  markForCheck: () => void;
  measured: (index: number, length: number, offset: number | undefined) => void;
};

// The gap a cell's `updateProps` side addresses, relative to the cell's own index
const SEPARATOR_GAP_OFFSET = { leading: -1, trailing: 0 } as const;

export class CellRegistry<ItemT> {
  // A cell's context is the only thing its stamped view reads, and the outlet refreshes that view
  // whenever the object's identity changes. Handing back the same object for a cell whose item and
  // index did not move keeps a window slide from refreshing every cell in it
  private contexts = new Map<string, IVListItemContext<ItemT>>();
  private nextContexts = new Map<string, IVListItemContext<ItemT>>();
  // What a cell's content can depend on besides its own item: an `extraData` flip has to drop
  // every reused context or nothing would repaint
  private epoch: unknown[] | undefined = undefined;
  private readonly separatorOverrides = new Map<
    number,
    Partial<ISeparatorProps<unknown>>
  >();
  private readonly measures = new Map<
    number,
    (event: ISymbioteEvent) => void
  >();

  constructor(private readonly host: ICellHost<ItemT>) {}

  beginPass(epoch: unknown[]): void {
    const previous = this.epoch;
    this.epoch = epoch;
    if (
      previous === undefined ||
      previous.length !== epoch.length ||
      !previous.every((value, index) => value === epoch[index])
    ) {
      this.contexts.clear();
    }
  }

  clear(): void {
    this.contexts.clear();
    this.nextContexts.clear();
  }

  // A cell that left the window is absent from the pass that just ran, so the old map is the
  // garbage and the new one is exactly the live set
  endPass(): void {
    this.contexts = this.nextContexts;
    this.nextContexts = new Map<string, IVListItemContext<ItemT>>();
  }

  windowCell(
    index: number,
    key: string,
    includeSeparator: boolean,
    isSticky: boolean,
  ): IWindowCell<ItemT> {
    const item = this.host.itemAt(index);
    return {
      key,
      index,
      context: this.contextFor(key, index, item),
      measure: this.measureFor(index),
      separatorContext: includeSeparator
        ? this.separatorContextFor(index, item)
        : undefined,
      isSticky,
    };
  }

  private contextFor(
    key: string,
    index: number,
    item: ItemT,
  ): IVListItemContext<ItemT> {
    const cached = this.contexts.get(key);
    if (
      cached !== undefined &&
      cached.$implicit === item &&
      cached.index === index
    ) {
      this.nextContexts.set(key, cached);
      return cached;
    }
    const context: IVListItemContext<ItemT> = {
      $implicit: item,
      index,
      separators: this.makeSeparators(index),
    };
    this.nextContexts.set(key, context);
    return context;
  }

  private separatorContextFor(
    index: number,
    item: ItemT,
  ): IVListSeparatorContext<ItemT> {
    const overrides = this.separatorOverrides.get(index);
    const highlighted = overrides?.highlighted ?? false;
    const context: IVListSeparatorContext<ItemT> = {
      $implicit: highlighted,
      highlighted,
      leadingItem: item,
      trailingItem: this.host.itemAt(index + 1),
    };
    // Custom `updateProps` keys ride the index signature, typed fields stay authoritative
    if (overrides !== undefined) {
      for (const key of Object.keys(overrides)) {
        if (
          key === 'highlighted' ||
          key === 'leadingItem' ||
          key === 'trailingItem'
        )
          continue;
        context[key] = overrides[key];
      }
    }
    return context;
  }

  private measureFor(index: number): (event: ISymbioteEvent) => void {
    const existing = this.measures.get(index);
    if (existing !== undefined) return existing;
    const measure = (event: ISymbioteEvent): void => {
      const horizontal = this.host.isHorizontal();
      const length = readLayoutLength(event, horizontal);
      if (length === undefined) return;
      const offset = readLayoutOffset(event, horizontal);
      dlog(
        `Angular VirtualizedList cell ${index} measured length=${length} offset=${offset ?? 'none'}`,
      );
      this.host.measured(index, length, offset);
    };
    this.measures.set(index, measure);
    return measure;
  }

  private mergeSeparator(
    gapIndex: number,
    patch: Partial<ISeparatorProps<unknown>>,
  ): void {
    if (!isSeparatorGapInRange(gapIndex, this.host.itemCount())) return;
    this.separatorOverrides.set(gapIndex, {
      ...this.separatorOverrides.get(gapIndex),
      ...patch,
    });
    this.host.markForCheck();
  }

  private makeSeparators(index: number): ISeparators {
    return {
      highlight: (): void => {
        dlog(`Angular VirtualizedList separator highlight cell=${index}`);
        this.mergeSeparator(index - 1, { highlighted: true });
        this.mergeSeparator(index, { highlighted: true });
      },
      unhighlight: (): void => {
        dlog(`Angular VirtualizedList separator unhighlight cell=${index}`);
        this.mergeSeparator(index - 1, { highlighted: false });
        this.mergeSeparator(index, { highlighted: false });
      },
      updateProps: (
        select: keyof typeof SEPARATOR_GAP_OFFSET,
        newProps: Record<string, unknown>,
      ): void => {
        this.mergeSeparator(index + SEPARATOR_GAP_OFFSET[select], newProps);
      },
    };
  }
}
