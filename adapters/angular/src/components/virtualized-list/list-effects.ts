// Runs the effects the shared list reducer hands back: scrolls, edge events and the two timers the
// reducer only knows a delay for (the incremental fill and the viewability debounce)

import {
  EMPTY_OFFSET,
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

type IViewableEffect<ItemT> = Extract<
  IListEffect<ItemT>,
  { kind: typeof LIST_EFFECT_KIND.fireViewable }
>;

export class ListEffectRunner<ItemT> {
  private viewableTimer: ReturnType<typeof setTimeout> | null = null;
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: IEffectHost<ItemT>) {}

  run(effects: IListEffect<ItemT>[], inputs: IListReducerInputs<ItemT>): void {
    for (const effect of effects) this.runOne(effect, inputs);
  }

  dispose(): void {
    if (this.viewableTimer !== null) clearTimeout(this.viewableTimer);
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
        this.fireViewable(effect, inputs);
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

  private fireViewable(
    effect: IViewableEffect<ItemT>,
    inputs: IListReducerInputs<ItemT>,
  ): void {
    const fire = (): void => {
      for (const pair of inputs.viewabilityPairs) {
        pair.onViewableItemsChanged({
          ...effect.info,
          viewabilityConfig: pair.viewabilityConfig,
        });
      }
      this.host.dispatch({
        kind: LIST_ACTION_KIND.viewableFired,
        map: effect.map,
      });
    };
    if (this.viewableTimer !== null) {
      clearTimeout(this.viewableTimer);
      this.viewableTimer = null;
    }
    if (effect.delay <= EMPTY_OFFSET) {
      fire();
      return;
    }
    this.viewableTimer = setTimeout(() => {
      this.viewableTimer = null;
      fire();
    }, effect.delay);
  }
}
