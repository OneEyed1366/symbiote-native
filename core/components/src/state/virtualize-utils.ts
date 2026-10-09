// The render-window math is RN's own `VirtualizeUtils`, fed through the shapes it expects
// @ts-expect-error - untyped Flow source
import * as VirtualizeUtilsUpstream from '@react-native/virtualized-lists/Lists/VirtualizeUtils';

export type IRenderRange = { first: number; last: number };

export type IWindowMetrics = {
  itemCount: number;
  getCellMetricsApprox: (index: number) => { offset: number; length: number };
};

export type IScrollMetrics = {
  offset: number;
  velocity: number;
  visibleLength: number;
  zoomScale?: number;
};

export type IWindowParams = {
  metrics: IWindowMetrics;
  maxToRenderPerBatch: number;
  windowSize: number;
  prev: IRenderRange;
  scroll: IScrollMetrics;
};

type IUpstreamProps = { data: null; getItemCount: () => number };

type IUpstreamMetrics = {
  getCellMetricsApprox: IWindowMetrics['getCellMetricsApprox'];
};

// RN's positional signature: props, max per batch, window size, previous range, metrics, scroll
type IUpstreamWindowArgs = [
  IUpstreamProps,
  number,
  number,
  IRenderRange,
  IUpstreamMetrics,
  IScrollMetrics & { dt: number },
];

type IUpstream = {
  elementsThatOverlapOffsets: (
    offsets: readonly number[],
    props: IUpstreamProps,
    listMetrics: IUpstreamMetrics,
    zoomScale: number,
  ) => Array<number | undefined>;
  newRangeCount: (prev: IRenderRange, next: IRenderRange) => number;
  computeWindowedRenderLimits: (...args: IUpstreamWindowArgs) => IRenderRange;
  keyExtractor: (item: unknown, index: number) => string | number;
};

const upstream: IUpstream = VirtualizeUtilsUpstream;

// RN reads cell metrics through its list aggregator, only `getCellMetricsApprox` of it is used
function upstreamViewOf(metrics: IWindowMetrics): {
  props: IUpstreamProps;
  listMetrics: IUpstreamMetrics;
} {
  return {
    props: { data: null, getItemCount: () => metrics.itemCount },
    listMetrics: { getCellMetricsApprox: metrics.getCellMetricsApprox },
  };
}

// Sparse on purpose, an offset no cell covers leaves its slot unset
export function elementsThatOverlapOffsets(
  offsets: readonly number[],
  metrics: IWindowMetrics,
  zoomScale = 1,
): Array<number | undefined> {
  const { props, listMetrics } = upstreamViewOf(metrics);
  return upstream.elementsThatOverlapOffsets(
    offsets,
    props,
    listMetrics,
    zoomScale,
  );
}

export const newRangeCount = upstream.newRangeCount;

// RN's default key, a number `key` or `id` becomes a string so every key map stays uniform
export function rnDefaultItemKey(item: unknown, index: number): string {
  return String(upstream.keyExtractor(item, index));
}

export function computeWindowedRenderLimits(
  params: IWindowParams,
): IRenderRange {
  const { metrics, maxToRenderPerBatch, windowSize, prev, scroll } = params;
  const { props, listMetrics } = upstreamViewOf(metrics);
  return upstream.computeWindowedRenderLimits(
    props,
    maxToRenderPerBatch,
    windowSize,
    prev,
    listMetrics,
    { ...scroll, dt: 0 },
  );
}
