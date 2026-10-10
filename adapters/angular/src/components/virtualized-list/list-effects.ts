// Runs the effects the shared list reducer hands back: scrolls, edge events and the two timers the
// reducer only knows a delay for (the incremental fill and the viewability debounce)

import {
  LIST_ACTION_KIND,
  LIST_EFFECT_KIND,
  type IListAction,
  type IListEffect,
  type IListReducerInputs,
} from '@symbiote-native/components';

type IEmitter<TValue> = { emit: (value: TValue) => void };

export type IEffectHost<ItemT> = {
  scrollToPixel: (offset: number, animated: boolean) => void;
  dispatch: (action: IListAction<ItemT>) => void;
  endReached: IEmitter<{ distanceFromEnd: number }>;
  startReached: IEmitter<{ distanceFromStart: number }>;
  scrollToIndexFailed: IEmitter<{
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }>;
};

type IScheduledViewable = Extract<
  IListEffect<unknown>,
  { kind: typeof LIST_EFFECT_KIND.scheduleViewable }
>;

export class ListEffectRunner<ItemT> {
  // RN never cancels a `minimumViewTime` timer, each one comes due and the reducer filters it
  private readonly viewableTimers = new Set<ReturnType<typeof setTimeout>>();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: IEffectHost<ItemT>) {}

  run(effects: IListEffect<ItemT>[], inputs: IListReducerInputs<ItemT>): void {
    for (const effect of effects) this.runOne(effect, inputs);
  }

  dispose(): void {
    for (const timer of this.viewableTimers) clearTimeout(timer);
    this.viewableTimers.clear();
    if (this.batchTimer !== null) clearTimeout(this.batchTimer);
  }

  private runOne(
    effect: IListEffect<ItemT>,
    inputs: IListReducerInputs<ItemT>,
  ): void {
    switch (effect.kind) {
      case LIST_EFFECT_KIND.scrollTo:
        this.host.scrollToPixel(effect.offset, effect.animated);
        break;
      case LIST_EFFECT_KIND.fireEndReached:
        this.host.endReached.emit({ distanceFromEnd: effect.distanceFromEnd });
        break;
      case LIST_EFFECT_KIND.fireStartReached:
        this.host.startReached.emit({
          distanceFromStart: effect.distanceFromStart,
        });
        break;
      case LIST_EFFECT_KIND.fireScrollToIndexFailed:
        this.host.scrollToIndexFailed.emit({
          index: effect.index,
          highestMeasuredFrameIndex: effect.highestMeasuredFrameIndex,
          averageItemLength: effect.averageItemLength,
        });
        break;
      case LIST_EFFECT_KIND.scheduleRefill:
        this.scheduleRefill(effect.delay);
        break;
      case LIST_EFFECT_KIND.fireViewable:
        inputs.viewabilityPairs[effect.pairIndex]?.onViewableItemsChanged(
          effect.info,
        );
        break;
      case LIST_EFFECT_KIND.scheduleViewable:
        this.scheduleViewable(effect);
        break;
    }
  }

  private scheduleRefill(delay: number): void {
    if (this.batchTimer !== null) clearTimeout(this.batchTimer);
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.host.dispatch({ kind: LIST_ACTION_KIND.batchTick });
    }, delay);
  }

  private scheduleViewable(effect: IScheduledViewable): void {
    const timer = setTimeout(() => {
      this.viewableTimers.delete(timer);
      this.host.dispatch({
        kind: LIST_ACTION_KIND.viewableDue,
        pairIndex: effect.pairIndex,
        indices: effect.indices,
      });
    }, effect.delay);
    this.viewableTimers.add(timer);
  }
}
