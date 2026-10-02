import invariant from 'invariant';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomValues,
} from '@symbiote-native/crypto';

const CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function convertBufferToString(buffer: Uint8Array): string {
  const chars: string[] = [];
  for (const byte of buffer) {
    const char = CHARSET[byte % CHARSET.length];
    if (char != null) {
      chars.push(char);
    }
  }
  return chars.join('');
}

function convertToUrlSafeString(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function generateRandom(size: number): string {
  const buffer = getRandomValues(new Uint8Array(size));
  return convertBufferToString(buffer);
}

/** Proof Key for Code Exchange (RFC 7636), Section 4.1. */
export async function deriveChallengeAsync(code: string): Promise<string> {
  invariant(
    code.length > 42 && code.length < 129,
    'Invalid code length for PKCE.',
  );

  const buffer = await digestStringAsync(CryptoDigestAlgorithm.SHA256, code, {
    encoding: CryptoEncoding.BASE64,
  });
  return convertToUrlSafeString(buffer);
}

export async function buildCodeAsync(
  size: number = 128,
): Promise<{ codeChallenge: string; codeVerifier: string }> {
  const codeVerifier = generateRandom(size);
  const codeChallenge = await deriveChallengeAsync(codeVerifier);
  return { codeVerifier, codeChallenge };
}

/** Digests a random string with hex encoding, useful for creating `nonce`s. */
export async function generateHexStringAsync(size: number): Promise<string> {
  const value = generateRandom(size);
  const buffer = await digestStringAsync(CryptoDigestAlgorithm.SHA256, value, {
    encoding: CryptoEncoding.HEX,
  });
  return convertToUrlSafeString(buffer);
}
