// Executes the effects the list reducer returns, timers and callbacks come from the adapter

import { LIST_ACTION_KIND, LIST_EFFECT_KIND } from './list-kinds';
import type { IListAction, IListEffect } from './list-reducer-types';
import type { IViewabilityConfigCallbackPair } from './list-viewability';

// A mutable cell, the adapter owns it so it survives a re-render (a ref, a closure variable)
export type ITimerSlot = { current: ReturnType<typeof setTimeout> | null };

// Callbacks the reducer never sees, read fresh on every effect run
export type IListCallbacks<ItemT> = {
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onScrollToIndexFailed?: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
  viewabilityPairs: IViewabilityConfigCallbackPair<ItemT>[];
};

export type IEffectHost<ItemT> = {
  callbacks: () => IListCallbacks<ItemT>;
  scrollToPixel: (offset: number, animated: boolean) => void;
  // Read lazily, a refill or a fired debounce dispatches a follow-up action
  dispatch: () => (action: IListAction<ItemT>) => void;
  viewableTimer: ITimerSlot;
  batchTimer: ITimerSlot;
};

function restart(slot: ITimerSlot, delay: number, task: () => void): void {
  if (slot.current !== null) clearTimeout(slot.current);
  slot.current = setTimeout(() => {
    slot.current = null;
    task();
  }, delay);
}

// RN never cancels a `minimumViewTime` timer, each one comes due on its own and the reducer
// keeps what is still viewable, so the pending ones are a set held beside the adapter's slot
const pendingViewable = new WeakMap<
  ITimerSlot,
  Set<ReturnType<typeof setTimeout>>
>();

function scheduleViewable<ItemT>(
  host: IEffectHost<ItemT>,
  effect: Extract<
    IListEffect<ItemT>,
    { kind: typeof LIST_EFFECT_KIND.scheduleViewable }
  >,
): void {
  const timers =
    pendingViewable.get(host.viewableTimer) ??
    new Set<ReturnType<typeof setTimeout>>();
  pendingViewable.set(host.viewableTimer, timers);
  const timer = setTimeout(() => {
    timers.delete(timer);
    host.dispatch()({
      kind: LIST_ACTION_KIND.viewableDue,
      pairIndex: effect.pairIndex,
      indices: effect.indices,
    });
  }, effect.delay);
  timers.add(timer);
}

export function clearTimers(slots: readonly ITimerSlot[]): void {
  for (const slot of slots) {
    if (slot.current !== null) clearTimeout(slot.current);
    slot.current = null;
    const timers = pendingViewable.get(slot);
    for (const timer of timers ?? []) clearTimeout(timer);
    timers?.clear();
  }
}

function runEffect<ItemT>(
  effect: IListEffect<ItemT>,
  host: IEffectHost<ItemT>,
): void {
  const callbacks = host.callbacks();
  switch (effect.kind) {
    case LIST_EFFECT_KIND.scrollTo:
      host.scrollToPixel(effect.offset, effect.animated);
      break;
    case LIST_EFFECT_KIND.fireEndReached:
      callbacks.onEndReached?.({ distanceFromEnd: effect.distanceFromEnd });
      break;
    case LIST_EFFECT_KIND.fireStartReached:
      callbacks.onStartReached?.({
        distanceFromStart: effect.distanceFromStart,
      });
      break;
    case LIST_EFFECT_KIND.fireScrollToIndexFailed:
      callbacks.onScrollToIndexFailed?.({
        index: effect.index,
        highestMeasuredFrameIndex: effect.highestMeasuredFrameIndex,
        averageItemLength: effect.averageItemLength,
      });
      break;
    case LIST_EFFECT_KIND.scheduleRefill:
      restart(host.batchTimer, effect.delay, () =>
        host.dispatch()({ kind: LIST_ACTION_KIND.batchTick }),
      );
      break;
    case LIST_EFFECT_KIND.fireViewable:
      callbacks.viewabilityPairs[effect.pairIndex]?.onViewableItemsChanged(
        effect.info,
      );
      break;
    case LIST_EFFECT_KIND.scheduleViewable:
      scheduleViewable(host, effect);
      break;
  }
}

export function runListEffects<ItemT>(
  effects: IListEffect<ItemT>[],
  host: IEffectHost<ItemT>,
): void {
  for (const effect of effects) runEffect(effect, host);
}
