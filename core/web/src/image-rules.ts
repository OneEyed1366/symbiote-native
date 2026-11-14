// Пропсы Image без своего style-ключа, `srcSet` главнее `src`, а он главнее `source`

import { isRecord } from '@symbiote-native/engine';
import type { IAttributes } from './dom-attributes';
import type { ICssDeclarations } from './css-values';

export type IImageRules = { attributes: IAttributes; css: ICssDeclarations };

export type IImageProps = {
  source?: unknown;
  src?: unknown;
  srcSet?: unknown;
  resizeMode?: unknown;
  alt?: unknown;
};

type IScaledSource = { uri: string; scale: number };

// У `repeat` нет `object-fit`, остаётся поведение элемента по умолчанию
const OBJECT_FIT: Readonly<Record<string, string>> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'scale-down',
};

function scaledSourceOf(entry: unknown): IScaledSource | undefined {
  if (!isRecord(entry) || typeof entry.uri !== 'string' || entry.uri === '') {
    return undefined;
  }
  return {
    uri: entry.uri,
    scale: typeof entry.scale === 'number' ? entry.scale : 1,
  };
}

// `source` приходит массивом, одиночный объект читаем так же
function scaledSourcesOf(source: unknown): IScaledSource[] {
  const entries = Array.isArray(source) ? source : [source];
  return entries.flatMap(entry => scaledSourceOf(entry) ?? []);
}

function sourceAttributes(props: IImageProps): IAttributes {
  if (typeof props.srcSet === 'string') return { srcset: props.srcSet };
  if (typeof props.src === 'string') return { src: props.src };
  const sources = scaledSourcesOf(props.source);
  const [first] = sources;
  if (first === undefined) return {};
  if (sources.length === 1) return { src: first.uri };
  const srcset = sources.map(({ uri, scale }) => `${uri} ${scale}x`).join(', ');
  return { src: first.uri, srcset };
}

export function imageRules(props: IImageProps): IImageRules {
  const attributes = sourceAttributes(props);
  if (typeof props.alt === 'string') attributes.alt = props.alt;
  const fit =
    typeof props.resizeMode === 'string'
      ? OBJECT_FIT[props.resizeMode]
      : undefined;
  return { attributes, css: fit === undefined ? {} : { 'object-fit': fit } };
}
