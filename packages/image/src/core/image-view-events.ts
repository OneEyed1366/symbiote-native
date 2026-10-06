import type { ISymbioteEvent } from '@symbiote-native/engine';
import type {
  IImageErrorEventData,
  IImageLoadEventData,
  IImageProgressEventData,
  IImageViewProps,
} from './types';

function field(value: unknown, key: string): unknown {
  return Reflect.get(Object(value), key);
}

function isLoad(value: unknown): value is IImageLoadEventData {
  return (
    typeof field(value, 'cacheType') === 'string' &&
    typeof field(value, 'source') === 'object'
  );
}

function isProgress(value: unknown): value is IImageProgressEventData {
  return (
    typeof field(value, 'loaded') === 'number' &&
    typeof field(value, 'total') === 'number'
  );
}

function isError(value: unknown): value is IImageErrorEventData {
  return typeof field(value, 'error') === 'string';
}

/** The native payload sits in `nativeEvent`, callbacks get it as the event itself */
export function toImageEvents(props: IImageViewProps) {
  return {
    onLoadStart: () => props.onLoadStart?.(),
    onLoad: (event: ISymbioteEvent) => {
      if (isLoad(event.nativeEvent)) props.onLoad?.(event.nativeEvent);
      props.onLoadEnd?.();
    },
    onProgress: (event: ISymbioteEvent) => {
      if (isProgress(event.nativeEvent)) props.onProgress?.(event.nativeEvent);
    },
    onError: (event: ISymbioteEvent) => {
      if (isError(event.nativeEvent)) props.onError?.(event.nativeEvent);
      props.onLoadEnd?.();
    },
  };
}
