import { requireNativeModule } from 'expo-modules-core';

import type { CryptoDigestAlgorithm, ICryptoDigestOptions, IDigest, ITypedArray } from './types';

const EXPO_CRYPTO_MODULE_NAME = 'ExpoCrypto';

// getRandomValues/randomUUID/digest are unconditionally implemented on both iOS and Android
// (verified against .vendors/expo's CryptoModule.swift/CryptoModule.kt at sdk-57 — both
// register the same `Name("ExpoCrypto")` with those three, plus digestStringAsync). digestAsync
// is the one method genuinely absent from the native side today — upstream's own `digest()`
// feature-detects it (`typeof ExpoCrypto.digestAsync === 'function'`) and falls back to the sync
// `digest` otherwise, so only it (and digestStringAsync, guarded the same way upstream guards it)
// stay optional here.
export type INativeCryptoModule = {
  getRandomValues(typedArray: ITypedArray): void;
  randomUUID(): string;
  digest(algorithm: CryptoDigestAlgorithm, output: Uint8Array, data: BufferSource): void;
  digestStringAsync?(
    algorithm: CryptoDigestAlgorithm,
    data: string,
    options: ICryptoDigestOptions,
  ): Promise<IDigest>;
  digestAsync?(algorithm: CryptoDigestAlgorithm, data: BufferSource): Promise<ArrayBuffer>;
};

export const expoCrypto = requireNativeModule<INativeCryptoModule>(EXPO_CRYPTO_MODULE_NAME);
