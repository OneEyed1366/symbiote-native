// The runtime is RN's own `Dimensions`, forwarded through `react-native-host`
// These are the public type names the adapters re-export

import type { IEventSubscription } from '../native-events';

export type IDisplayMetrics = {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
};

export type IDisplayMetricsAndroid = IDisplayMetrics & {
  densityDpi: number;
};

// What native sends, both in `getConstants().Dimensions` and in the `didUpdateDimensions` event
export type IDimensionsPayload = {
  window?: IDisplayMetrics;
  screen?: IDisplayMetrics;
  windowPhysicalPixels?: IDisplayMetricsAndroid;
  screenPhysicalPixels?: IDisplayMetricsAndroid;
};

export type IDimensionsSet = {
  window: IDisplayMetrics;
  screen: IDisplayMetrics;
};

export type IDimensionsKey = keyof IDimensionsSet;

export type IDimensionsChangeListener = (set: IDimensionsSet) => void;

export type IDimensionsStatic = {
  get(dim: IDimensionsKey): IDisplayMetrics;
  set(dims: IDimensionsPayload): void;
  addEventListener(
    type: 'change',
    listener: IDimensionsChangeListener,
  ): IEventSubscription;
};
