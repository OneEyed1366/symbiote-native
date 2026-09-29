import { expoCryptoAes, type INativeAesEncryptOptions } from './native-module';
import type {
  IAesDecryptOptions,
  IAesEncryptOptions,
  IAesSealedDataConfig,
  IBase64DecryptOptions,
  IBinaryInput,
  IBytesDecryptOptions,
} from './types';

// Hermes global, absent from the ES2022 lib
declare function btoa(data: string): string;

// Native has no ArrayBuffer support, and encodes binary options as base64 strings
function convertBinaryInput(
  input: IBinaryInput,
  useBase64 = false,
): IBinaryInput {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (typeof bytes !== 'string' && useBase64) {
    return uint8ArrayToBase64(bytes);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binaryString = '';
  for (const byte of bytes) {
    binaryString += String.fromCharCode(byte);
  }
  return btoa(binaryString);
}

export class AESEncryptionKey extends expoCryptoAes.EncryptionKey {}

export class AESSealedData extends expoCryptoAes.SealedData {
  /** `tag` is a separate tag, or the tag length when the ciphertext already carries it */
  static override fromParts(
    iv: IBinaryInput,
    ciphertext: IBinaryInput,
    tag: IBinaryInput,
  ): AESSealedData;
  static override fromParts(
    iv: IBinaryInput,
    ciphertextWithTag: IBinaryInput,
    tagLength?: number,
  ): AESSealedData;

  static override fromParts(
    iv: IBinaryInput,
    ciphertext: IBinaryInput,
    tag?: IBinaryInput | number,
  ): AESSealedData {
    const processedIv = convertBinaryInput(iv);
    const processedCiphertext = convertBinaryInput(ciphertext);

    if (tag === undefined || typeof tag === 'number') {
      return expoCryptoAes.SealedData.fromParts(
        processedIv,
        processedCiphertext,
        tag,
      );
    }
    return expoCryptoAes.SealedData.fromParts(
      processedIv,
      processedCiphertext,
      convertBinaryInput(tag),
    );
  }

  /** `combined` holds IV, ciphertext and tag back to back */
  static override fromCombined(
    combined: IBinaryInput,
    config?: IAesSealedDataConfig,
  ): AESSealedData {
    return expoCryptoAes.SealedData.fromCombined(
      convertBinaryInput(combined),
      config,
    );
  }
}

/** AES-GCM encryption. A string plaintext must be base64-encoded */
export function aesEncryptAsync(
  plaintext: IBinaryInput,
  key: AESEncryptionKey,
  options: IAesEncryptOptions = {},
): Promise<AESSealedData> {
  const { nonce, additionalData, ...rest } = options;
  let nativeOptions: INativeAesEncryptOptions = { ...rest };
  if (nonce) {
    nativeOptions = {
      ...nativeOptions,
      nonce:
        'bytes' in nonce ? convertBinaryInput(nonce.bytes, true) : nonce.length,
    };
  }
  if (additionalData) {
    nativeOptions = {
      ...nativeOptions,
      additionalData: convertBinaryInput(additionalData, true),
    };
  }
  return expoCryptoAes.encryptAsync(
    convertBinaryInput(plaintext),
    key,
    nativeOptions,
  );
}

export function aesDecryptAsync(
  sealedData: AESSealedData,
  key: AESEncryptionKey,
  options: IBase64DecryptOptions,
): Promise<string>;
export function aesDecryptAsync(
  sealedData: AESSealedData,
  key: AESEncryptionKey,
  options?: IBytesDecryptOptions,
): Promise<Uint8Array>;
export function aesDecryptAsync(
  sealedData: AESSealedData,
  key: AESEncryptionKey,
  options?: IAesDecryptOptions,
): Promise<string | Uint8Array>;

export function aesDecryptAsync(
  sealedData: AESSealedData,
  key: AESEncryptionKey,
  options: IAesDecryptOptions = {},
): Promise<string | Uint8Array> {
  const { additionalData, ...rest } = options;
  return expoCryptoAes.decryptAsync(sealedData, key, {
    ...rest,
    additionalData: additionalData
      ? convertBinaryInput(additionalData, true)
      : undefined,
  });
}
