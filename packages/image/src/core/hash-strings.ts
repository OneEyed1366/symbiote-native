import type { IImageSource } from './types';

type IImageHashType = 'blurhash' | 'thumbhash';

const DEFAULT_HASH_SIZE = 16;

function hashToUri(type: IImageHashType, hash: string): string {
  const encoded = encodeURI(hash).replace(/#/g, '%23').replace(/\?/g, '%3F');
  return `${type}:/${encoded}`;
}

/** `blurhash:/<hash>/<width>/<height>` or `<hash>/<width>/<height>` */
export function resolveBlurhashString(str: string): IImageSource {
  const [hash = '', width = '', height = ''] = str
    .replace(/^blurhash:\//, '')
    .split('/');
  return {
    uri: hashToUri('blurhash', hash),
    width: parseInt(width, 10) || DEFAULT_HASH_SIZE,
    height: parseInt(height, 10) || DEFAULT_HASH_SIZE,
  };
}

/** `thumbhash:/<hash>` or `<hash>` */
export function resolveThumbhashString(str: string): IImageSource {
  // A slash at the start of the hash would break the uri path
  const hash = str.replace(/^thumbhash:\//, '').replace(/\//g, '\\');
  return { uri: hashToUri('thumbhash', hash) };
}
