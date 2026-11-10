import type { WorkletFunction } from 'react-native-worklets';
import { makeShareable } from 'react-native-worklets';
import { initialUpdaterRun } from 'react-native-reanimated/src/animation';
import type {
  AnimatedPropsAdapterWorklet,
  SharedValue,
} from 'react-native-reanimated/src/commonTypes';
import { startMapper, stopMapper } from 'react-native-reanimated/src/core';
import {
  buildWorkletsHash,
  checkSharedValueUsage,
  createAnimatedStyleHandle,
  styleUpdater,
  type AnimatedUpdaterData,
} from 'react-native-reanimated/src/hook/useAnimatedStyleCommon';
import { validateAnimatedStyles } from 'react-native-reanimated/src/hook/utils';
import { makeViewDescriptorsSet } from 'react-native-reanimated/src/ViewDescriptorsSet';
import { createSharedValue } from './shared-value';

// The public hooks put the precise style type on top, the core only moves the bag around
export type IStyleBag = object;

// Every object is a record at runtime, which is all the adapters, written against records, need
function isWorkletRecord(bag: IStyleBag): bag is Record<string, unknown> {
  'worklet';
  return typeof bag === 'object';
}
type IStyleUpdater = WorkletFunction<[], IStyleBag>;

export type IAnimatedStyleOptions = {
  adapters?: AnimatedPropsAdapterWorklet | AnimatedPropsAdapterWorklet[] | null;
  isAnimatedProps?: boolean;
};

export type IAnimatedStyleController = {
  handle: ReturnType<
    typeof createAnimatedStyleHandle<IAnimatedStyleHandleBase>
  >;
  // Registers the mapper for `updater` and stops the one standing
  start: (updater: IStyleUpdater) => void;
  stop: () => void;
  // Animations write only between these two
  activate: () => void;
  deactivate: () => void;
  // The adapters of the latest render, which `dependenciesOf` and `start` then go by
  adapt: (adapters: AnimatedPropsAdapterWorklet[]) => void;
  // Whatever the mapper depends on, a change in any of them means `start` again
  dependenciesOf: (updater: IStyleUpdater) => unknown[];
  dispose: () => void;
};

type IAnimatedStyleHandleBase = Pick<
  AnimatedUpdaterData,
  'viewDescriptors' | 'initial'
>;

type IMapperContext = {
  shareableViewDescriptors: SharedValue<
    AnimatedUpdaterData['viewDescriptors']['shareableViewDescriptors']['value']
  >;
  remoteState: AnimatedUpdaterData['remoteState'];
  animationsActive: SharedValue<boolean>;
  isAnimatedProps: boolean;
  styleUpdaterContainer: AnimatedUpdaterData['styleUpdaterContainer'];
};

function toArray<Item>(items: Item | Item[] | null | undefined): Item[] {
  if (items === null || items === undefined) return [];
  return Array.isArray(items) ? items : [items];
}

function createUpdaterData(updater: IStyleUpdater): AnimatedUpdaterData {
  const initialStyle = initialUpdaterRun(updater);
  if (__DEV__) validateAnimatedStyles(initialStyle);
  const data: AnimatedUpdaterData = {
    initial: { value: initialStyle, updater },
    remoteState: makeShareable({
      last: initialStyle,
      animations: {},
      isAnimationCancelled: false,
      isAnimationRunning: false,
    }),
    viewDescriptors: makeViewDescriptorsSet(),
    styleUpdaterContainer: { current: undefined },
  };
  if (__DEV__) checkSharedValueUsage(data.initial.value);
  return data;
}

// The adapters change the values in place, so they run inside the updater the mapper calls
function withAdapters(
  current: IStyleUpdater,
  adapters: AnimatedPropsAdapterWorklet[],
): () => IStyleBag {
  if (adapters.length === 0) return current;
  return () => {
    'worklet';
    const newValues = current();
    if (isWorkletRecord(newValues))
      adapters.forEach(adapter => adapter(newValues));
    return newValues;
  };
}

function startStyleMapper(
  context: IMapperContext,
  updaterFn: () => IStyleBag,
  inputs: unknown[],
): number {
  const { shareableViewDescriptors, remoteState, animationsActive } = context;
  const { isAnimatedProps } = context;
  const fun = (forceUpdate?: boolean) => {
    'worklet';
    styleUpdater(
      shareableViewDescriptors,
      updaterFn,
      remoteState,
      animationsActive,
      isAnimatedProps,
      forceUpdate,
    );
  };
  context.styleUpdaterContainer.current = fun;
  return startMapper(fun, inputs);
}

function styleDependencies(
  current: IStyleUpdater,
  adapters: AnimatedPropsAdapterWorklet[],
  context: IMapperContext,
): unknown[] {
  const adaptersHash = adapters.length > 0 ? [buildWorkletsHash(adapters)] : [];
  return [
    ...(current.__closure ?? []),
    current.__workletHash,
    ...adaptersHash,
    context.shareableViewDescriptors,
  ];
}

export function createAnimatedStyleController(
  updater: IStyleUpdater,
  options: IAnimatedStyleOptions = {},
): IAnimatedStyleController {
  const data = createUpdaterData(updater);
  const active = createSharedValue(true);
  const context: IMapperContext = {
    shareableViewDescriptors: data.viewDescriptors.shareableViewDescriptors,
    remoteState: data.remoteState,
    animationsActive: active.shared,
    isAnimatedProps: options.isAnimatedProps ?? false,
    styleUpdaterContainer: data.styleUpdaterContainer,
  };
  let mapperId: number | undefined;

  function stop(): void {
    if (mapperId !== undefined) stopMapper(mapperId);
    mapperId = undefined;
  }

  let adapters = toArray(options.adapters);
  return {
    adapt: next => {
      adapters = next;
    },
    handle: createAnimatedStyleHandle(
      { viewDescriptors: data.viewDescriptors, initial: data.initial },
      data.styleUpdaterContainer,
    ),
    start: current => {
      stop();
      const updaterFn = withAdapters(current, adapters);
      mapperId = startStyleMapper(context, updaterFn, current.__closure ?? []);
    },
    stop,
    activate: () => {
      active.shared.value = true;
    },
    deactivate: () => {
      active.shared.value = false;
    },
    dependenciesOf: current => styleDependencies(current, adapters, context),
    dispose: () => {
      stop();
      active.shared.value = false;
      active.dispose();
    },
  };
}

// `useAnimatedProps` upstream is the style hook told the values are props, not style
export function createAnimatedPropsController(
  updater: IStyleUpdater,
  options: Omit<IAnimatedStyleOptions, 'isAnimatedProps'> = {},
): IAnimatedStyleController {
  return createAnimatedStyleController(updater, {
    ...options,
    isAnimatedProps: true,
  });
}
