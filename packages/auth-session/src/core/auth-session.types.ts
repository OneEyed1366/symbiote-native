import type { AuthError } from './errors';
import type { TokenResponse } from './token-request';

/** cancel/dismiss/opened/locked carry no extra data; error/success carry params + any token. */
export type IAuthSessionResult =
  | { type: 'cancel' | 'dismiss' | 'opened' | 'locked' }
  | {
      type: 'error' | 'success';
      /** @deprecated legacy error-code query param, use `error` instead. */
      errorCode: string | null;
      error?: AuthError | null;
      params: Record<string, string>;
      authentication: TokenResponse | null;
      url: string;
    };

export type IAuthSessionRedirectUriOptions = {
  /** Appended to `scheme`; not applied when `native` is used. */
  path?: string;
  /** URI protocol `<scheme>://` built into the native app. Ignored if `native` is set. */
  scheme?: string;
  queryParams?: Record<string, string | undefined>;
  /** `scheme:///path` when `true`, `scheme://path` otherwise. @default false */
  isTripleSlashed?: boolean;
  /** Rewrites a matched IPv4 host to `localhost` (iOS simulator convenience). @default false */
  preferLocalhost?: boolean;
  /** Manual scheme for a production build; takes precedence over every other option. */
  native?: string;
};
