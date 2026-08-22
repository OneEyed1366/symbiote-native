export enum CryptoDigestAlgorithm {
  SHA1 = 'SHA-1',
  SHA256 = 'SHA-256',
  SHA384 = 'SHA-384',
  SHA512 = 'SHA-512',
  /** @platform ios */
  MD2 = 'MD2',
  /** @platform ios */
  MD4 = 'MD4',
  MD5 = 'MD5',
}

export enum CryptoEncoding {
  HEX = 'hex',
  /** Has trailing padding. Does not wrap lines. Does not have a trailing newline. */
  BASE64 = 'base64',
}

export type ICryptoDigestOptions = {
  /** Format the digest is returned in. */
  encoding: CryptoEncoding;
};

export type IDigest = string;

// expo-modules-core exports the equivalent constraint as `UintBasedTypedArray | IntBasedTypedArray`
// off its own internal typed-array module; we never depend on the `expo` meta-package's re-export
// path for it (see the symbiote-expo-native-module skill), so this is our own precise union over
// the standard integer TypedArrays instead.
export type IUintBasedTypedArray = Uint8Array | Uint16Array | Uint32Array;
export type IIntBasedTypedArray = Int8Array | Int16Array | Int32Array;
export type ITypedArray = IUintBasedTypedArray | IIntBasedTypedArray;
