import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  class FakeKey {
    static generate = vi.fn();
  }
  class FakeSealedData {
    static fromParts = vi.fn();
    static fromCombined = vi.fn();
  }
  return {
    module: {
      EncryptionKey: FakeKey,
      SealedData: FakeSealedData,
      encryptAsync: vi.fn(async () => 'sealed'),
      decryptAsync: vi.fn(async () => 'plain'),
    },
    FakeKey,
    FakeSealedData,
  };
});

vi.mock('./aes-native-module', () => ({ expoCryptoAes: fake.module }));

const { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync } =
  await import('./aes');
const { AESKeySize } = await import('./aes-types');

const KEY = new AESEncryptionKey();
const BYTES = new Uint8Array([1, 2, 3]);
const BYTES_BASE64 = 'AQID';

afterEach(() => {
  vi.clearAllMocks();
});

describe('AESEncryptionKey / AESSealedData', () => {
  it('extend the native classes', () => {
    expect(KEY).toBeInstanceOf(fake.FakeKey);
    expect(Object.getPrototypeOf(AESSealedData)).toBe(fake.FakeSealedData);
  });

  it('exposes the key sizes', () => {
    expect(AESKeySize).toMatchObject({ AES128: 128, AES192: 192, AES256: 256 });
  });
});

describe('AESSealedData.fromParts', () => {
  it('passes a numeric tag length through', () => {
    AESSealedData.fromParts(BYTES, BYTES, 12);

    expect(fake.FakeSealedData.fromParts).toHaveBeenCalledWith(
      BYTES,
      BYTES,
      12,
    );
  });

  it('passes an undefined tag length through', () => {
    AESSealedData.fromParts(BYTES, BYTES);

    expect(fake.FakeSealedData.fromParts).toHaveBeenCalledWith(
      BYTES,
      BYTES,
      undefined,
    );
  });

  it('forwards a separate tag as bytes', () => {
    AESSealedData.fromParts(BYTES, BYTES, new Uint8Array([9]));

    expect(fake.FakeSealedData.fromParts).toHaveBeenCalledWith(
      BYTES,
      BYTES,
      new Uint8Array([9]),
    );
  });

  it('turns an ArrayBuffer into a Uint8Array and leaves strings alone', () => {
    AESSealedData.fromParts(BYTES_BASE64, BYTES.buffer.slice(0), BYTES_BASE64);

    expect(fake.FakeSealedData.fromParts).toHaveBeenCalledWith(
      BYTES_BASE64,
      BYTES,
      BYTES_BASE64,
    );
  });
});

describe('AESSealedData.fromCombined', () => {
  it('forwards the converted input and the config', () => {
    const config = { ivLength: 16, tagLength: 12 as const };
    AESSealedData.fromCombined(BYTES.buffer.slice(0), config);

    expect(fake.FakeSealedData.fromCombined).toHaveBeenCalledWith(
      BYTES,
      config,
    );
  });
});

describe('aesEncryptAsync', () => {
  it('sends the plaintext to the native module and returns the sealed data', async () => {
    await expect(aesEncryptAsync(BYTES, KEY)).resolves.toBe('sealed');

    expect(fake.module.encryptAsync).toHaveBeenCalledWith(BYTES, KEY, {});
  });

  it('turns a nonce length into the bare number native expects', async () => {
    await aesEncryptAsync(BYTES, KEY, { nonce: { length: 16 } });

    expect(fake.module.encryptAsync).toHaveBeenCalledWith(BYTES, KEY, {
      nonce: 16,
    });
  });

  it('base64-encodes provided nonce bytes and additional data', async () => {
    await aesEncryptAsync(BYTES, KEY, {
      nonce: { bytes: BYTES },
      additionalData: BYTES,
      tagLength: 12,
    });

    expect(fake.module.encryptAsync).toHaveBeenCalledWith(BYTES, KEY, {
      nonce: BYTES_BASE64,
      additionalData: BYTES_BASE64,
      tagLength: 12,
    });
  });

  it('leaves a base64 string nonce and additional data as they are', async () => {
    await aesEncryptAsync(BYTES_BASE64, KEY, {
      nonce: { bytes: BYTES_BASE64 },
      additionalData: BYTES_BASE64,
    });

    expect(fake.module.encryptAsync).toHaveBeenCalledWith(BYTES_BASE64, KEY, {
      nonce: BYTES_BASE64,
      additionalData: BYTES_BASE64,
    });
  });

  it('base64-encodes an ArrayBuffer nonce', async () => {
    await aesEncryptAsync(BYTES, KEY, {
      nonce: { bytes: BYTES.buffer.slice(0) },
    });

    expect(fake.module.encryptAsync).toHaveBeenCalledWith(BYTES, KEY, {
      nonce: BYTES_BASE64,
    });
  });
});

describe('aesDecryptAsync', () => {
  const sealed = new AESSealedData();

  it('passes the output option and leaves absent additional data undefined', async () => {
    await expect(
      aesDecryptAsync(sealed, KEY, { output: 'base64' }),
    ).resolves.toBe('plain');

    expect(fake.module.decryptAsync).toHaveBeenCalledWith(sealed, KEY, {
      output: 'base64',
      additionalData: undefined,
    });
  });

  it('base64-encodes binary additional data', async () => {
    await aesDecryptAsync(sealed, KEY, { additionalData: BYTES });

    expect(fake.module.decryptAsync).toHaveBeenCalledWith(sealed, KEY, {
      additionalData: BYTES_BASE64,
    });
  });

  it('defaults to empty options', async () => {
    await aesDecryptAsync(sealed, KEY);

    expect(fake.module.decryptAsync).toHaveBeenCalledWith(sealed, KEY, {
      additionalData: undefined,
    });
  });
});
