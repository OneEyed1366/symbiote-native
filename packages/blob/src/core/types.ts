import type { Blob } from './blob';

export type IBlobPropertyBag = {
  endings?: 'transparent' | 'native';
  type?: string;
};

export type IBlobPart = string | ArrayBuffer | ArrayBufferView | Blob;
