import { resolveAssetSource } from '@symbiote-native/engine';
import { SharedRef } from 'expo-modules-core';
import { SF_SYMBOL_PREFIX } from './constants';
import { resolveBlurhashString, resolveThumbhashString } from './hash-strings';
import type { IImageSource, IImageSources } from './types';

const BLURHASH_PATTERN =
  /^(blurhash:\/)+[\w#$%*+,\-.:;=?@[\]^_{}|~]+(\/[\d.]+)*$/;
const THUMBHASH_PREFIX = 'thumbhash:/';

type IImageSourceInput = IImageSource | string | number | null | undefined;

// Any native image reference, an `ImageRef` or a `VideoThumbnail`, the view takes both
export function isImageRef(value: unknown): value is SharedRef<'image'> {
  return value instanceof SharedRef && value.nativeRefType === 'image';
}

function sharedIdOf(ref: SharedRef<'image'>): number {
  const id: unknown = Reflect.get(ref, '__expo_shared_object_id__');
  return typeof id === 'number' ? id : 0;
}

function isImageSource(value: unknown): value is IImageSource {
  return typeof value === 'object' && value !== null;
}

function nativeAssetSource(id: number): IImageSource | null {
  const asset = resolveAssetSource(id);
  return isImageSource(asset) ? asset : null;
}

export function resolveSource(source: IImageSourceInput): IImageSource | null {
  if (typeof source === 'string') {
    if (BLURHASH_PATTERN.test(source)) {
      return resolveBlurhashString(source);
    }
    if (source.startsWith(THUMBHASH_PREFIX)) {
      return resolveThumbhashString(source);
    }
    if (source.startsWith(SF_SYMBOL_PREFIX)) {
      return {
        uri: `${SF_SYMBOL_PREFIX}/${source.slice(SF_SYMBOL_PREFIX.length)}`,
      };
    }
    return { uri: source };
  }
  if (typeof source === 'number') {
    return nativeAssetSource(source);
  }
  if (source?.blurhash || source?.thumbhash) {
    const { blurhash, thumbhash, ...rest } = source;
    const resolved = thumbhash
      ? resolveThumbhashString(thumbhash)
      : resolveBlurhashString(blurhash ?? '');
    return { ...resolved, ...rest };
  }
  return source ?? null;
}

function isPresent(source: IImageSource | null): source is IImageSource {
  return source !== null;
}

/** The shape the native view takes: a list of sources or a shared object id */
export function resolveSources(
  sources: IImageSources | undefined,
): IImageSource[] | number {
  if (Array.isArray(sources)) {
    return sources.map(resolveSource).filter(isPresent);
  }
  if (isImageRef(sources)) {
    return sharedIdOf(sources);
  }
  return [resolveSource(sources)].filter(isPresent);
}
