import { requireNativeModule, SharedObject } from 'expo-modules-core';
import type { IBlobPart, IBlobPropertyBag } from './types';

const EXPO_BLOB_MODULE_NAME = 'ExpoBlob';

export declare class NativeBlob extends SharedObject {
  readonly size: number;
  readonly type: string;
  constructor(blobParts?: IBlobPart[], options?: IBlobPropertyBag);
  slice(start?: number, end?: number, contentType?: string): NativeBlob;
  bytes(): Promise<Uint8Array>;
  text(): Promise<string>;
}

export type INativeBlobModule = {
  Blob: typeof NativeBlob;
};

export const expoBlob = requireNativeModule<INativeBlobModule>(
  EXPO_BLOB_MODULE_NAME,
);
