// An item cell with its separators around it, as in RN's `ItemWithSeparator`
// The state of those separators lives in a board shared by all cells, т.к. `highlight()` also
// lights the previous cell's one, this directive ties one cell to its key in that board

import {
  ChangeDetectorRef,
  Directive,
  Input,
  inject,
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
  type TemplateRef,
} from '@angular/core';
import {
  createCellSeparators,
  SEPARATOR_SIDE,
  type ICellSeparatorState,
  type ISeparatorBoard,
  type ISeparatorGap,
  type ISeparators,
  type ISeparatorSide,
} from '@symbiote-native/components';
import type { IVListSeparatorContext } from '../virtualized-list';
import type { ISection } from './directives';

export type ISeparatorSlot<ItemT> = {
  template: TemplateRef<IVListSeparatorContext<ItemT>> | undefined;
  gap: ISeparatorGap<ItemT, ISection<ItemT>>;
  side: ISeparatorSide;
};

// The separator props RN passes, the app's `updateProps` overrides laid over them
export function separatorContextOf<ItemT>(
  slot: ISeparatorSlot<ItemT>,
  state: ICellSeparatorState<Record<string, unknown>>,
): IVListSeparatorContext<ItemT> | undefined {
  if (slot.template === undefined || slot.gap.props === undefined)
    return undefined;
  const isLeading = slot.side === SEPARATOR_SIDE.leading;
  const override = isLeading ? state.leadingOverride : state.trailingOverride;
  const isHighlighted = isLeading
    ? state.leadingHighlighted
    : state.trailingHighlighted;
  const bag: IVListSeparatorContext<ItemT> = {
    $implicit: isHighlighted,
    highlighted: isHighlighted,
    ...slot.gap.props,
    ...override,
  };
  return { ...bag, props: bag };
}

@Directive({
  selector: '[vSectionCell]',
  exportAs: 'vSectionCell',
  standalone: true,
})
export class VSectionCellDirective implements OnChanges, OnDestroy {
  @Input({ required: true }) board!: ISeparatorBoard<Record<string, unknown>>;
  @Input({ required: true }) cellKey!: string;
  @Input() prevCellKey?: string;
  @Input() hasLeading = false;
  @Input() hasTrailing = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private unsubscribe: (() => void) | undefined;
  private subscribedKey: string | undefined;

  // Built on first read, once the inputs are set, and stable so a template holding it keeps working
  private cachedSeparators: ISeparators | undefined;
  get separators(): ISeparators {
    this.cachedSeparators ??= createCellSeparators(this.board, () => ({
      cellKey: this.cellKey,
      prevCellKey: this.prevCellKey,
      has: { leading: this.hasLeading, trailing: this.hasTrailing },
    }));
    return this.cachedSeparators;
  }

  contextOf<ItemT>(
    slot: ISeparatorSlot<ItemT>,
  ): IVListSeparatorContext<ItemT> | undefined {
    return separatorContextOf(slot, this.board.read(this.cellKey));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cellKey'] === undefined && changes['board'] === undefined)
      return;
    this.detach();
    this.subscribedKey = this.cellKey;
    this.unsubscribe = this.board.subscribe(this.cellKey, () =>
      this.cdr.markForCheck(),
    );
  }

  ngOnDestroy(): void {
    this.detach();
  }

  // A recycled cell starts clean, as a remounted RN cell does
  private detach(): void {
    this.unsubscribe?.();
    if (this.subscribedKey !== undefined)
      this.board.release(this.subscribedKey);
    this.unsubscribe = undefined;
    this.subscribedKey = undefined;
  }
}
