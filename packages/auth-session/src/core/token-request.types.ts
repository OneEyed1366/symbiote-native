/** https://tools.ietf.org/html/rfc6749#section-7.1 */
export type ITokenType = 'bearer' | 'mac';

/** A hint about the type of the token submitted for revocation. */
export enum TokenTypeHint {
  AccessToken = 'access_token',
  RefreshToken = 'refresh_token',
}

export type ITokenRequestConfig = {
  clientId: string;
  clientSecret?: string;
  extraParams?: Record<string, string>;
  extraHeaders?: Record<string, string>;
  scopes?: string[];
};

export type IAccessTokenRequestConfig = ITokenRequestConfig & {
  code: string;
  /** Must match the `redirectUri` used in the `AuthRequest`. */
  redirectUri: string;
};

export type IRefreshTokenRequestConfig = ITokenRequestConfig & {
  refreshToken?: string;
};

export type IRevokeTokenRequestConfig = Partial<ITokenRequestConfig> & {
  token: string;
  tokenTypeHint?: TokenTypeHint;
};

/** https://tools.ietf.org/html/rfc6749#appendix-A.10 */
export enum GrantType {
  AuthorizationCode = 'authorization_code',
  Implicit = 'implicit',
  RefreshToken = 'refresh_token',
  ClientCredentials = 'client_credentials',
}

export type IServerTokenResponseConfig = {
  access_token: string;
  token_type?: ITokenType;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  issued_at?: number;
};

export type ITokenResponseConfig = {
  accessToken: string;
  tokenType?: ITokenType;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  state?: string;
  idToken?: string;
  issuedAt?: number;
};
