// A string input must be base64-encoded
export type IBinaryInput = string | Uint8Array | ArrayBuffer;

export enum AESKeySize {
  AES128 = 128,
  // Unsupported on web
  AES192 = 192,
  AES256 = 256,
}

// GCM tag length in bytes: 16 is the default and the only value Apple supports for encryption
export type IGcmTagByteLength = 16 | 15 | 14 | 13 | 12 | 8 | 4;

export type IAesSealedDataConfig = {
  /** @default 12 */
  ivLength: number;
  /** @default 16 */
  tagLength: IGcmTagByteLength;
};

export type IAesDecryptOptions = {
  /** @default 'bytes' */
  output?: 'bytes' | 'base64';
  // GCM additional authenticated data, base64 when a string
  additionalData?: IBinaryInput;
};

export type IBase64DecryptOptions = IAesDecryptOptions & { output: 'base64' };

export type IBytesDecryptOptions = IAesDecryptOptions & { output?: 'bytes' };

export type IGcmNonceParam =
  | {
      /** Byte length of the nonce to generate. @default 12 */
      length: number;
    }
  | {
      bytes: IBinaryInput;
    };

export type IAesEncryptOptions = {
  /** @default { length: 12 } */
  nonce?: IGcmNonceParam;
  // Ignored on Apple, where the tag is always 16 bytes
  tagLength?: IGcmTagByteLength;
  // GCM additional authenticated data, base64 when a string
  additionalData?: IBinaryInput;
};
