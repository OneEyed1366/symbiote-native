// Ported from expo-standard-web-crypto (upstream: packages/expo-standard-web-crypto/src/index.ts,
// verified identical on origin/main and origin/sdk-57) — a partial W3C Web Crypto API polyfill
// exposing `crypto.getRandomValues`. Upstream delegates to expo-crypto's own getRandomValues; this
// port delegates to @symbiote-native/crypto's getRandomValues instead, which already wraps the
// same native random source, so there is no native call left to re-wrap here. React Native has no
// reliable `window` global, so `globalThis` replaces every `window`/bare `crypto` reference
// upstream used.
import { getRandomValues as getNativeRandomValues } from '@symbiote-native/crypto';
import type { ITypedArray } from '@symbiote-native/crypto';

export type IWebCrypto = {
  getRandomValues<TArray extends ArrayBufferView>(values: TArray): TArray;
};

// @symbiote-native/crypto's getRandomValues only accepts the integer TypedArrays it can hand to
// the native module (ITypedArray) — narrower than the W3C spec's ArrayBufferView. This guard
// narrows the incoming view at the one call site that needs it, so the class below can still
// expose the full ArrayBufferView-typed method the upstream Crypto class does.
function isSupportedTypedArray(value: ArrayBufferView): value is ITypedArray {
  return (
    value instanceof Int8Array ||
    value instanceof Uint8Array ||
    value instanceof Int16Array ||
    value instanceof Uint16Array ||
    value instanceof Int32Array ||
    value instanceof Uint32Array
  );
}

class Crypto implements IWebCrypto {
  getRandomValues<TArray extends ArrayBufferView>(values: TArray): TArray {
    if (!isSupportedTypedArray(values)) {
      throw new TypeError('The provided ArrayBuffer view is not a supported integer-typed array');
    }
    return getNativeRandomValues(values);
  }
}

function isWebCrypto(value: unknown): value is IWebCrypto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'getRandomValues' in value && typeof value.getRandomValues === 'function';
}

// No ambient `declare global { var crypto }` here on purpose — it would collide with lib.dom.d.ts's
// own `crypto` global the moment any consumer's tsconfig pulls in the DOM lib (as this package's
// own Angular build does), producing a duplicate-declaration error. Reflect.get sidesteps that:
// it reads an untyped global property without asserting one into existence.
function readGlobalCrypto(): IWebCrypto | undefined {
  const value: unknown = Reflect.get(globalThis, 'crypto');
  return isWebCrypto(value) ? value : undefined;
}

const webCrypto: IWebCrypto = readGlobalCrypto() ?? new Crypto();

export default webCrypto;

export function polyfillWebCrypto(): void {
  if (readGlobalCrypto() === undefined) {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      enumerable: true,
      get: () => webCrypto,
    });
  }
}
