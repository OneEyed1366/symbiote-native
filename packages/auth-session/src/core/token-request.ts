import invariant from 'invariant';
import * as Base64 from './base64';
import type { IDiscoveryDocument } from './discovery';
import { TokenError } from './errors';
import type { IResponseErrorConfig } from './errors';
import type { IFetchHeaders } from './fetch';
import { requestAsync } from './fetch';
import type {
  IAccessTokenRequestConfig,
  IRefreshTokenRequestConfig,
  IRevokeTokenRequestConfig,
  IServerTokenResponseConfig,
  ITokenRequestConfig,
  ITokenResponseConfig,
  ITokenType,
  TokenTypeHint,
} from './token-request.types';
import { GrantType } from './token-request.types';

export function getCurrentTimeInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function asTokenType(value: string | undefined): ITokenType | undefined {
  return value === 'bearer' || value === 'mac' ? value : undefined;
}

/** https://tools.ietf.org/html/rfc6749#section-5.1 */
export class TokenResponse implements ITokenResponseConfig {
  static isTokenFresh(
    token: Pick<TokenResponse, 'expiresIn' | 'issuedAt'>,
    /** -10 minutes in seconds. */
    secondsMargin: number = 60 * 10 * -1,
  ): boolean {
    if (!token) {
      return false;
    }
    if (token.expiresIn) {
      const now = getCurrentTimeInSeconds();
      return now < token.issuedAt + token.expiresIn + secondsMargin;
    }
    return true;
  }

  static fromQueryParams(params: Record<string, string>): TokenResponse {
    return new TokenResponse({
      accessToken: params.access_token ?? '',
      refreshToken: params.refresh_token,
      scope: params.scope,
      state: params.state,
      idToken: params.id_token,
      tokenType: asTokenType(params.token_type),
      expiresIn: params.expires_in ? Number(params.expires_in) : undefined,
      issuedAt: params.issued_at ? Number(params.issued_at) : undefined,
    });
  }

  accessToken: string;
  tokenType: ITokenType;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  state?: string;
  idToken?: string;
  issuedAt: number;
  /** Unprocessed token response, for fields outside RFC 6749. */
  rawResponse?: unknown;

  constructor(response: ITokenResponseConfig, rawResponse?: unknown) {
    this.rawResponse = rawResponse;
    this.accessToken = response.accessToken;
    this.tokenType = response.tokenType ?? 'bearer';
    this.expiresIn = response.expiresIn;
    this.refreshToken = response.refreshToken;
    this.scope = response.scope;
    this.state = response.state;
    this.idToken = response.idToken;
    this.issuedAt = response.issuedAt ?? getCurrentTimeInSeconds();
  }

  private applyResponseConfig(response: ITokenResponseConfig): void {
    this.accessToken = response.accessToken ?? this.accessToken;
    this.tokenType = response.tokenType ?? this.tokenType ?? 'bearer';
    this.expiresIn = response.expiresIn ?? this.expiresIn;
    this.refreshToken = response.refreshToken ?? this.refreshToken;
    this.scope = response.scope ?? this.scope;
    this.state = response.state ?? this.state;
    this.idToken = response.idToken ?? this.idToken;
    this.issuedAt =
      response.issuedAt ?? this.issuedAt ?? getCurrentTimeInSeconds();
  }

  getRequestConfig(): ITokenResponseConfig {
    return {
      accessToken: this.accessToken,
      idToken: this.idToken,
      refreshToken: this.refreshToken,
      scope: this.scope,
      state: this.state,
      tokenType: this.tokenType,
      issuedAt: this.issuedAt,
      expiresIn: this.expiresIn,
    };
  }

  async refreshAsync(
    config: Omit<ITokenRequestConfig, 'grantType' | 'refreshToken'>,
    discovery: Pick<IDiscoveryDocument, 'tokenEndpoint'>,
  ): Promise<TokenResponse> {
    const request = new RefreshTokenRequest({
      ...config,
      refreshToken: this.refreshToken,
    });
    const response = await request.performAsync(discovery);
    response.refreshToken = response.refreshToken ?? this.refreshToken;
    this.applyResponseConfig(response.getRequestConfig());
    return this;
  }

  shouldRefresh(): boolean {
    return !(TokenResponse.isTokenFresh(this) || !this.refreshToken);
  }
}

function sanitizeExtraHeaders(
  extra: Record<string, string> | undefined,
  hasClientSecret: boolean,
): Record<string, string> | undefined {
  if (!extra) {
    return undefined;
  }
  const extraHeaders = { ...extra };
  delete extraHeaders['Content-Type'];
  delete extraHeaders['content-type'];
  if (hasClientSecret) {
    delete extraHeaders.authorization;
    delete extraHeaders.Authorization;
  }
  return extraHeaders;
}

function encodeBasicAuth(clientId: string, clientSecret: string): string {
  const credentials = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
  return Base64.encodeNoWrap(credentials);
}

abstract class BaseRequest<TConfig, TResult> {
  constructor(protected request: TConfig) {}
  abstract performAsync(discovery: IDiscoveryDocument): Promise<TResult>;
  abstract getRequestConfig(): TConfig;
  abstract getQueryBody(): Record<string, string>;
}

/** A generic token request. */
export class TokenRequest<T extends ITokenRequestConfig>
  extends BaseRequest<T, TokenResponse>
  implements ITokenRequestConfig
{
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly scopes?: string[];
  readonly extraParams?: Record<string, string>;
  readonly extraHeaders?: Record<string, string>;

  constructor(
    request: T,
    public grantType: GrantType,
  ) {
    super(request);
    this.clientId = request.clientId;
    this.clientSecret = request.clientSecret;
    this.extraParams = request.extraParams;
    this.scopes = request.scopes;
    this.extraHeaders = sanitizeExtraHeaders(
      request.extraHeaders,
      typeof request.clientSecret !== 'undefined',
    );
  }

  getHeaders(): IFetchHeaders {
    const headers: IFetchHeaders = {
      ...this.extraHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (typeof this.clientSecret !== 'undefined') {
      headers.Authorization = `Basic ${encodeBasicAuth(this.clientId, this.clientSecret)}`;
    }
    return headers;
  }

  async performAsync(
    discovery: Pick<IDiscoveryDocument, 'tokenEndpoint'>,
  ): Promise<TokenResponse> {
    invariant(
      discovery.tokenEndpoint,
      'Cannot invoke `performAsync()` without a valid tokenEndpoint',
    );
    const response = await requestAsync<
      IServerTokenResponseConfig | IResponseErrorConfig
    >(discovery.tokenEndpoint, {
      dataType: 'json',
      method: 'POST',
      headers: this.getHeaders(),
      body: this.getQueryBody(),
    });

    if ('error' in response) {
      throw new TokenError(response);
    }

    return new TokenResponse(
      {
        accessToken: response.access_token,
        tokenType: response.token_type,
        expiresIn: response.expires_in,
        refreshToken: response.refresh_token,
        scope: response.scope,
        idToken: response.id_token,
        issuedAt: response.issued_at,
      },
      response,
    );
  }

  getRequestConfig(): T {
    return this.request;
  }

  getQueryBody(): Record<string, string> {
    const queryBody: Record<string, string> = { grant_type: this.grantType };
    if (!this.clientSecret) {
      queryBody.client_id = this.clientId;
    }
    if (this.scopes) {
      queryBody.scope = this.scopes.join(' ');
    }
    for (const extra in this.extraParams) {
      const param = this.extraParams[extra];
      if (param != null && !(extra in queryBody)) {
        queryBody[extra] = param;
      }
    }
    return queryBody;
  }
}

/** https://tools.ietf.org/html/rfc6749#section-4.1.3 */
export class AccessTokenRequest
  extends TokenRequest<IAccessTokenRequestConfig>
  implements IAccessTokenRequestConfig
{
  readonly code: string;
  readonly redirectUri: string;

  constructor(options: IAccessTokenRequestConfig) {
    invariant(
      options.redirectUri,
      '`AccessTokenRequest` requires a valid `redirectUri`.',
    );
    invariant(
      options.code,
      '`AccessTokenRequest` requires a valid authorization `code`.',
    );
    super(options, GrantType.AuthorizationCode);
    this.code = options.code;
    this.redirectUri = options.redirectUri;
  }

  override getQueryBody(): Record<string, string> {
    return {
      ...super.getQueryBody(),
      redirect_uri: this.redirectUri,
      code: this.code,
    };
  }

  override getRequestConfig(): IAccessTokenRequestConfig & {
    grantType: GrantType;
  } {
    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      grantType: this.grantType,
      code: this.code,
      redirectUri: this.redirectUri,
      extraParams: this.extraParams,
      extraHeaders: this.extraHeaders,
      scopes: this.scopes,
    };
  }
}

/** https://tools.ietf.org/html/rfc6749#section-6 */
export class RefreshTokenRequest
  extends TokenRequest<IRefreshTokenRequestConfig>
  implements IRefreshTokenRequestConfig
{
  readonly refreshToken?: string;

  constructor(options: IRefreshTokenRequestConfig) {
    invariant(
      options.refreshToken,
      '`RefreshTokenRequest` requires a valid `refreshToken`.',
    );
    super(options, GrantType.RefreshToken);
    this.refreshToken = options.refreshToken;
  }

  override getQueryBody(): Record<string, string> {
    const queryBody = super.getQueryBody();
    if (this.refreshToken) {
      queryBody.refresh_token = this.refreshToken;
    }
    return queryBody;
  }

  override getRequestConfig(): IRefreshTokenRequestConfig & {
    grantType: GrantType;
  } {
    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      grantType: this.grantType,
      refreshToken: this.refreshToken,
      extraParams: this.extraParams,
      extraHeaders: this.extraHeaders,
      scopes: this.scopes,
    };
  }
}

/** https://tools.ietf.org/html/rfc7009#section-2.1 */
export class RevokeTokenRequest
  extends BaseRequest<IRevokeTokenRequestConfig, boolean>
  implements IRevokeTokenRequestConfig
{
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly token: string;
  readonly tokenTypeHint?: TokenTypeHint;
  readonly extraHeaders?: Record<string, string>;

  constructor(request: IRevokeTokenRequestConfig) {
    super(request);
    invariant(
      request.token,
      '`RevokeTokenRequest` requires a valid `token` to revoke.',
    );
    this.clientId = request.clientId;
    this.clientSecret = request.clientSecret;
    this.token = request.token;
    this.tokenTypeHint = request.tokenTypeHint;
    this.extraHeaders = sanitizeExtraHeaders(
      request.extraHeaders,
      typeof request.clientSecret !== 'undefined',
    );
  }

  getHeaders(): IFetchHeaders {
    const headers: IFetchHeaders = {
      ...this.extraHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (typeof this.clientSecret !== 'undefined' && this.clientId) {
      headers.Authorization = `Basic ${encodeBasicAuth(this.clientId, this.clientSecret)}`;
    }
    return headers;
  }

  async performAsync(
    discovery: Pick<IDiscoveryDocument, 'revocationEndpoint'>,
  ): Promise<boolean> {
    invariant(
      discovery.revocationEndpoint,
      'Cannot invoke `performAsync()` without a valid revocationEndpoint',
    );
    await requestAsync(discovery.revocationEndpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.getQueryBody(),
    });
    return true;
  }

  getRequestConfig(): IRevokeTokenRequestConfig {
    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      token: this.token,
      tokenTypeHint: this.tokenTypeHint,
      extraHeaders: this.extraHeaders,
    };
  }

  getQueryBody(): Record<string, string> {
    const queryBody: Record<string, string> = { token: this.token };
    if (this.tokenTypeHint) {
      queryBody.token_type_hint = this.tokenTypeHint;
    }
    if (this.clientId) {
      queryBody.client_id = this.clientId;
    }
    if (this.clientSecret) {
      queryBody.client_secret = this.clientSecret;
    }
    return queryBody;
  }
}

/** Exchange an authorization code for an access token. */
export function exchangeCodeAsync(
  config: IAccessTokenRequestConfig,
  discovery: Pick<IDiscoveryDocument, 'tokenEndpoint'>,
): Promise<TokenResponse> {
  return new AccessTokenRequest(config).performAsync(discovery);
}

/** Refresh an access token. See `TokenResponse.isTokenFresh()`/`shouldRefresh()`. */
export function refreshAsync(
  config: IRefreshTokenRequestConfig,
  discovery: Pick<IDiscoveryDocument, 'tokenEndpoint'>,
): Promise<TokenResponse> {
  return new RefreshTokenRequest(config).performAsync(discovery);
}

/** Revoke a token, effectively requiring the user to sign in again. */
export function revokeAsync(
  config: IRevokeTokenRequestConfig,
  discovery: Pick<IDiscoveryDocument, 'revocationEndpoint'>,
): Promise<boolean> {
  return new RevokeTokenRequest(config).performAsync(discovery);
}

/** Fetch generic user info from the provider's OpenID Connect `userInfoEndpoint`, if supported. */
export function fetchUserInfoAsync(
  config: Pick<TokenResponse, 'accessToken'>,
  discovery: Pick<IDiscoveryDocument, 'userInfoEndpoint'>,
): Promise<Record<string, unknown>> {
  if (!discovery.userInfoEndpoint) {
    throw new Error(
      'User info endpoint is not defined in the service config discovery document',
    );
  }
  return requestAsync<Record<string, unknown>>(discovery.userInfoEndpoint, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${config.accessToken}`,
    },
    dataType: 'json',
    method: 'GET',
  });
}
