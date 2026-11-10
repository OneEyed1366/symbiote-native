// Sticky header state: the scroll value that drives each header and the cross-talk between them

import { createMemo, createSignal, type Accessor } from 'solid-js';
import {
  FIRST_INDEX,
  nextStickyHeaderY,
  readLayoutNumber,
  resolveScrollForwarding,
} from '@symbiote-native/components';
import {
  AnimatedValue,
  dlog,
  isNativeAnimatedAvailable,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import type { IVirtualizedListProps } from './virtualized-list-props';

type ICellMeasure = (event: ISymbioteEvent) => void;

export type IStickyState = {
  // Drives the `translateY` of every sticky header, held by identity
  scrollAnimatedValue: AnimatedValue;
  forwarding: Accessor<ReturnType<typeof resolveScrollForwarding>>;
  nativeStickyAvailable: () => boolean;
  makeStickyCellLayout: (
    index: Accessor<number>,
    measure: ICellMeasure,
  ) => ICellMeasure;
  nextStickyHeaderYFor: (
    index: number,
    mounted: ReadonlySet<number>,
  ) => number | undefined;
};

export function createStickyState<ItemT>(
  props: IVirtualizedListProps<ItemT>,
): IStickyState {
  // Data index to measured y, so each header learns where the NEXT one starts (its push-off point)
  // `stickyVersion` lets the previous header re-read the map
  const headerLayoutYs = new Map<number, number>();
  const [stickyVersion, setStickyVersion] = createSignal(0);
  const hasStickyHeaders = (): boolean => {
    const indices = props.stickyHeaderIndices;
    return indices !== undefined && indices.length > FIRST_INDEX;
  };
  const nativeStickyAvailable = (): boolean =>
    hasStickyHeaders() && isNativeAnimatedAvailable();
  // RN's list has no `invertStickyHeaders`, so headers always pin to the top
  const forwarding = createMemo(() =>
    resolveScrollForwarding({
      hasStickyHeaders: hasStickyHeaders(),
      nativeStickyAvailable: nativeStickyAvailable(),
      invertStickyHeaders: undefined,
      scrollEventThrottle: props.scrollEventThrottle,
      maintainVisibleContentPosition: props.maintainVisibleContentPosition,
      snapToAlignment: undefined,
    }),
  );

  // Without the measured y the header AHEAD of this one has no collision point and sticks forever
  const makeStickyCellLayout = (
    index: Accessor<number>,
    measure: ICellMeasure,
  ): ICellMeasure => {
    return (event: ISymbioteEvent): void => {
      measure(event);
      const y = readLayoutNumber(event, 'y');
      if (y === undefined || headerLayoutYs.get(index()) === y) return;
      dlog(`VirtualizedList sticky header index=${index()} y=${y}`);
      headerLayoutYs.set(index(), y);
      setStickyVersion(tick => tick + 1);
    };
  };

  // Only a header mounted right now can collide, a stale y from one that scrolled out freezes it
  // The map is deliberately not pruned, a measured y stays valid for when it scrolls back in
  const nextStickyHeaderYFor = (
    index: number,
    mounted: ReadonlySet<number>,
  ): number | undefined => {
    // Read the bump first so this stays a dependency of whichever header calls it
    stickyVersion();
    const indices = props.stickyHeaderIndices;
    if (indices === undefined) return undefined;
    const rendered = indices.filter(sticky => mounted.has(sticky));
    return nextStickyHeaderY(rendered, rendered.indexOf(index), headerLayoutYs);
  };

  return {
    scrollAnimatedValue: new AnimatedValue(0),
    forwarding,
    nativeStickyAvailable,
    makeStickyCellLayout,
    nextStickyHeaderYFor,
  };
}
