import { NativeModule, requireNativeModule } from 'expo-modules-core';

import type {
  IAesDecryptOptions,
  IAesEncryptOptions,
  IAesSealedDataConfig,
  IBinaryInput,
  IGcmTagByteLength,
  AESKeySize,
} from './aes-types';

type IEncoding = 'hex' | 'base64';

declare class EncryptionKey {
  static generate(size?: AESKeySize): Promise<EncryptionKey>;
  static import(bytes: Uint8Array): Promise<EncryptionKey>;
  static import(hexString: string, encoding: IEncoding): Promise<EncryptionKey>;

  /** Key size in bits */
  size: AESKeySize;

  bytes(): Promise<Uint8Array>;
  encoded(encoding: IEncoding): Promise<string>;
}

declare class SealedData {
  static fromCombined(
    combined: IBinaryInput,
    config?: IAesSealedDataConfig,
  ): SealedData;
  static fromParts(
    iv: IBinaryInput,
    ciphertext: IBinaryInput,
    tag: IBinaryInput,
  ): SealedData;
  static fromParts(
    iv: IBinaryInput,
    ciphertextWithTag: IBinaryInput,
    tagLength?: number,
  ): SealedData;

  ciphertext(options: {
    includeTag?: boolean;
    encoding: 'base64';
  }): Promise<string>;
  ciphertext(options?: {
    includeTag?: boolean;
    encoding?: 'bytes';
  }): Promise<Uint8Array>;
  ciphertext(options: {
    includeTag?: boolean;
    encoding?: 'base64' | 'bytes';
  }): Promise<string | Uint8Array>;

  iv(encoding?: 'bytes'): Promise<Uint8Array>;
  iv(encoding: 'base64'): Promise<string>;
  iv(encoding?: 'bytes' | 'base64'): Promise<string | Uint8Array>;

  tag(encoding?: 'bytes'): Promise<Uint8Array>;
  tag(encoding: 'base64'): Promise<string>;
  tag(encoding?: 'bytes' | 'base64'): Promise<string | Uint8Array>;

  combined(encoding?: 'bytes'): Promise<Uint8Array>;
  combined(encoding: 'base64'): Promise<string>;
  combined(encoding?: 'bytes' | 'base64'): Promise<string | Uint8Array>;

  /** IV + ciphertext + tag, in bytes */
  readonly combinedSize: number;
  readonly ivSize: number;
  readonly tagSize: IGcmTagByteLength;
}

// Native takes the nonce as a bare length (to generate) or as bytes
export type INativeAesEncryptOptions = Omit<IAesEncryptOptions, 'nonce'> & {
  nonce?: number | IBinaryInput | undefined;
};

declare class NativeAesCryptoModule extends NativeModule {
  EncryptionKey: typeof EncryptionKey;
  SealedData: typeof SealedData;

  generateKey(size?: AESKeySize): Promise<EncryptionKey>;
  importKey(
    keyInput: string | Uint8Array,
    encoding?: IEncoding,
  ): Promise<EncryptionKey>;

  encryptAsync(
    plaintext: IBinaryInput,
    key: EncryptionKey,
    options?: INativeAesEncryptOptions,
  ): Promise<SealedData>;
  decryptAsync(
    sealedData: SealedData,
    key: EncryptionKey,
    options?: IAesDecryptOptions,
  ): Promise<string | Uint8Array>;
}

export const expoCryptoAes =
  requireNativeModule<NativeAesCryptoModule>('ExpoCryptoAES');
