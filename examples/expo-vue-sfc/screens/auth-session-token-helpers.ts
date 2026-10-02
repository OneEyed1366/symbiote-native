import {
  AuthError,
  ResponseError,
  TokenError,
} from '@symbiote-native/auth-session/vue';
import type { TokenResponse } from '@symbiote-native/auth-session/vue';

export function need<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`${label} first`);
  }
  return value;
}

export function tokenSummary(token: TokenResponse) {
  return {
    accessToken: `${token.accessToken.slice(0, 12)}…`,
    tokenType: token.tokenType,
    expiresIn: token.expiresIn,
    issuedAt: token.issuedAt,
    hasRefreshToken: token.refreshToken !== undefined,
    scope: token.scope,
  };
}

export function classify(error: unknown): string {
  if (error instanceof TokenError) {
    return `TokenError ${error.code}: ${error.message}`;
  }
  if (error instanceof ResponseError) {
    return `ResponseError ${error.code}: ${error.message}`;
  }
  if (error instanceof AuthError) {
    return `AuthError ${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
