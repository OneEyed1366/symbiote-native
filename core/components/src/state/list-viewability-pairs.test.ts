// RN builds one `ViewabilityHelper` per pair, each with its own thresholds and reported set
// A pending `minimumViewTime` timer is never cancelled, on firing it keeps what is still viewable
import { describe, expect, it } from 'vitest';
import {
  createInitialListState,
  reduceList,
  type IListEffect,
  type IListReducerInputs,
  type IListState,
} from './virtualized-list-reducer';
import type { IViewabilityConfigCallbackPair } from './virtualized-list';

const DATA = ['a', 'b', 'c', 'd', 'e'];
const VIEWPORT = 250;

function pair(
  viewabilityConfig: IViewabilityConfigCallbackPair<string>['viewabilityConfig'],
): IViewabilityConfigCallbackPair<string> {
  return { viewabilityConfig, onViewableItemsChanged: (): void => {} };
}

function inputs(
  pairs: IViewabilityConfigCallbackPair<string>[],
): IListReducerInputs<string> {
  return {
    data: DATA,
    getItem: (_data, index): string => DATA[index],
    getItemCount: (): number => DATA.length,
    getItemLayout: (_data, index) => ({
      length: 100,
      offset: index * 100,
      index,
    }),
    horizontal: false,
    windowSize: 21,
    initialNumToRender: 10,
    maxToRenderPerBatch: 10,
    updateCellsBatchingPeriod: 50,
    onEndReachedThreshold: 2,
    onStartReachedThreshold: 2,
    onEndReachedActive: false,
    onStartReachedActive: false,
    viewabilityPairs: pairs,
    maintainVisibleContentPosition: undefined,
    initialScrollIndex: undefined,
  };
}

function open(config: IListReducerInputs<string>): IListState<string> {
  const state = createInitialListState<string>();
  reduceList(state, { kind: 'refresh-metrics' }, config);
  reduceList(state, { kind: 'layout', length: VIEWPORT }, config);
  reduceList(state, { kind: 'refresh-metrics' }, config);
  return state;
}

function scrollTo(
  state: IListState<string>,
  offset: number,
  config: IListReducerInputs<string>,
): IListEffect<string>[] {
  reduceList(state, { kind: 'scroll', offset, timestamp: offset }, config);
  reduceList(state, { kind: 'refresh-metrics' }, config);
  return reduceList(state, { kind: 'commit' }, config).effects;
}

type IKind<K extends IListEffect<string>['kind']> = Extract<
  IListEffect<string>,
  { kind: K }
>;

const fires = (effects: IListEffect<string>[]): IKind<'fire-viewable'>[] =>
  effects.filter(effect => effect.kind === 'fire-viewable');

const schedules = (
  effects: IListEffect<string>[],
): IKind<'schedule-viewable'>[] =>
  effects.filter(effect => effect.kind === 'schedule-viewable');

const due = (
  state: IListState<string>,
  config: IListReducerInputs<string>,
  indices: number[],
): IListEffect<string>[] =>
  reduceList(state, { kind: 'viewable-due', pairIndex: 0, indices }, config)
    .effects;

describe('viewabilityConfigCallbackPairs', () => {
  it('gives each pair only the cells its own config calls viewable', () => {
    const config = inputs([
      pair({ itemVisiblePercentThreshold: 10 }),
      pair({ itemVisiblePercentThreshold: 100 }),
    ]);
    const state = open(config);

    // Scrolled to 50: cell 0 half visible, cells 1 and 2 whole, cell 3 starts at the viewport end
    const effects = scrollTo(state, 50, config);

    expect(
      fires(effects).map(effect => [
        effect.pairIndex,
        effect.info.viewableItems.map(token => token.index),
      ]),
    ).toEqual([
      [0, [0, 1, 2]],
      [1, [1, 2]],
    ]);
  });

  it('reports a pair at once without a minimumViewTime and schedules one with it', () => {
    const config = inputs([
      pair({ itemVisiblePercentThreshold: 10 }),
      pair({ itemVisiblePercentThreshold: 10, minimumViewTime: 300 }),
    ]);
    const state = open(config);

    const effects = scrollTo(state, 50, config);

    expect(fires(effects).map(effect => effect.pairIndex)).toEqual([0]);
    expect(
      schedules(effects).map(effect => [effect.pairIndex, effect.delay]),
    ).toEqual([[1, 300]]);
  });

  it('keeps the cells still viewable when a delayed report comes due', () => {
    const config = inputs([
      pair({ itemVisiblePercentThreshold: 100, minimumViewTime: 350 }),
    ]);
    const state = open(config);

    // Cells 0, 1 whole at t0, then 1, 2 at t100, each pass schedules a timer, keys are indices
    const [first] = schedules(scrollTo(state, 0, config));
    const [second] = schedules(scrollTo(state, 50, config));
    if (first === undefined || second === undefined) {
      throw new Error('expected two scheduled reports');
    }

    const early = due(state, config, first.indices);
    const late = due(state, config, second.indices);

    expect(
      fires(early).map(effect => effect.info.changed.map(token => token.key)),
    ).toEqual([['1']]);
    expect(
      fires(late).map(effect => effect.info.changed.map(token => token.key)),
    ).toEqual([['2']]);
  });

  it('reports against the new data after a prepend', () => {
    const first = inputs([pair({ itemVisiblePercentThreshold: 10 })]);
    const state = open(first);
    scrollTo(state, 0, first);

    const prepended = ['z', ...DATA];
    const second: IListReducerInputs<string> = {
      ...first,
      data: prepended,
      getItem: (_data, index): string => prepended[index],
      getItemCount: (): number => prepended.length,
      keyExtractor: item => item,
    };
    const effects = scrollTo(state, 50, second);

    expect(
      fires(effects).map(effect =>
        effect.info.viewableItems.map(token => token.key),
      ),
    ).toEqual([['z', 'a', 'b']]);
  });

  it('skips a cell that left the viewport before its timer came due', () => {
    const config = inputs([
      pair({ itemVisiblePercentThreshold: 100, minimumViewTime: 350 }),
    ]);
    const state = open(config);

    const [brief] = schedules(scrollTo(state, 0, config));
    const [stays] = schedules(scrollTo(state, 250, config));
    if (brief === undefined || stays === undefined) {
      throw new Error('expected two scheduled reports');
    }

    const early = due(state, config, brief.indices);
    const late = due(state, config, stays.indices);

    expect(fires(early)).toEqual([]);
    expect(
      fires(late).map(effect => effect.info.viewableItems.map(t => t.key)),
    ).toEqual([['3', '4']]);
  });
});
