<script lang="ts" generics="ItemT">
  // Item cell with its separators around it, as in RN's `ItemWithSeparator`
  // Their state sits in a shared board, т.к. `highlight()` also lights the previous cell's one
  import { untrack, type Snippet } from 'svelte';
  import {
    createCellSeparators,
    type ISeparatorBoard,
    type ISeparatorGap,
    type ISeparatorProps,
  } from '@symbiote-native/components';
  import type {
    ISection,
    ISectionCellInfo,
  } from './virtualized-section-list-props';

  type ICellProps = {
    board: ISeparatorBoard<Record<string, unknown>>;
    cellKey: string;
    prevCellKey: string | undefined;
    item: ItemT;
    index: number;
    section: ISection<ItemT>;
    renderItem: Snippet<[ISectionCellInfo<ItemT>]>;
    leadingGap: ISeparatorGap<ItemT, ISection<ItemT>>;
    trailingGap: ISeparatorGap<ItemT, ISection<ItemT>>;
    leadingSeparator: Snippet<[ISeparatorProps<ItemT>]> | undefined;
    trailingSeparator: Snippet<[ISeparatorProps<ItemT>]> | undefined;
    isInverted: boolean;
  };

  let {
    board,
    cellKey,
    prevCellKey,
    item,
    index,
    section,
    renderItem,
    leadingGap,
    trailingGap,
    leadingSeparator,
    trailingSeparator,
    isInverted,
  }: ICellProps = $props();

  let cellState = $state.raw(untrack(() => board.read(cellKey)));
  $effect(() => {
    const key = cellKey;
    cellState = board.read(key);
    const unsubscribe = board.subscribe(key, () => {
      cellState = board.read(key);
    });
    return () => {
      unsubscribe();
      board.release(key);
    };
  });

  const separators = createCellSeparators(board, () => ({
    cellKey,
    prevCellKey,
    has: {
      leading: leadingSeparator !== undefined,
      trailing: trailingSeparator !== undefined,
    },
  }));

  const leadingProps = $derived({
    highlighted: cellState.leadingHighlighted,
    ...leadingGap.props,
    ...cellState.leadingOverride,
  });
  const trailingProps = $derived({
    highlighted: cellState.trailingHighlighted,
    ...trailingGap.props,
    ...cellState.trailingOverride,
  });
</script>

{#snippet leading()}
  {@render leadingSeparator?.(leadingProps)}
{/snippet}

{#snippet trailing()}
  {@render trailingSeparator?.(trailingProps)}
{/snippet}

{#if isInverted}
  {@render trailing()}
  {@render renderItem({ item, index, section, separators })}
  {@render leading()}
{:else}
  {@render leading()}
  {@render renderItem({ item, index, section, separators })}
  {@render trailing()}
{/if}
