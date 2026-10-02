import type { IBlobPropertyBag } from './types';

/** ASCII-printable-only, lowercased; anything else normalizes to `''`. */
export function normalizedContentType(type?: string): string {
  const str = `${type}`;
  const asciiPrintable = /^[\x20-\x7E]+$/;
  if (type === undefined || !asciiPrintable.test(str)) return '';
  return str.toLowerCase();
}

export function isTypedArray(value: unknown): value is ArrayBufferView {
  return (
    value instanceof Int8Array ||
    value instanceof Int16Array ||
    value instanceof Int32Array ||
    value instanceof BigInt64Array ||
    value instanceof Uint8Array ||
    value instanceof Uint16Array ||
    value instanceof Uint32Array ||
    value instanceof BigUint64Array ||
    value instanceof Float32Array ||
    value instanceof Float64Array
  );
}

export function preprocessOptions(
  options?: IBlobPropertyBag,
): IBlobPropertyBag | undefined {
  if (!options) return options;
  if (!(options instanceof Object)) {
    throw new TypeError(
      `The 'options' argument must be a dictionary. Received type ${typeof options}`,
    );
  }

  let endings: string | undefined = options.endings;
  let type: string | undefined = options.type;
  if (endings && typeof endings === 'object') {
    endings = String(endings);
  }
  if (type && typeof type === 'object') {
    type = String(type);
  }
  if (
    endings !== undefined &&
    endings !== 'native' &&
    endings !== 'transparent'
  ) {
    throw new TypeError(
      `Provided '${endings}' endings value is not a valid enum value of EndingType, try 'native' or 'transparent'`,
    );
  }

  return { endings, type: normalizedContentType(type) };
}

/** Not spec-mandated — a widely-adopted default (matches Node's own stream chunk size). */
export const DEFAULT_CHUNK_SIZE = 65_536;
