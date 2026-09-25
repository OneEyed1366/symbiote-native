import { Platform } from 'react-native';
import invariant from 'invariant';
import { openAuthSessionAsync } from '@symbiote-native/web-browser';
import type { IWebBrowserAuthSessionResult } from '@symbiote-native/web-browser';
import type {
  IAuthDiscoveryDocument,
  IAuthRequestConfig,
  IAuthRequestPromptOptions,
  Prompt,
} from './auth-request.types';
import { CodeChallengeMethod, ResponseType } from './auth-request.types';
import type { IAuthSessionResult } from './auth-session.types';
import { AuthError } from './errors';
import { getQueryParams } from './query-params';
import { buildCodeAsync, generateRandom } from './pkce';
import { TokenResponse } from './token-request';

let authLock = false;

function createPromptString(
  prompt: Prompt | Prompt[] | undefined,
): string | undefined {
  if (!prompt) return undefined;
  return Array.isArray(prompt) ? prompt.join(' ') : prompt;
}

/** Manages an authorization request, https://tools.ietf.org/html/rfc6749#section-4.1.1 */
export class AuthRequest implements Omit<IAuthRequestConfig, 'state'> {
  /** Protection against Cross-Site Request Forgery. */
  public state: string;
  public url: string | null = null;
  public codeVerifier?: string;
  public codeChallenge?: string;

  readonly responseType: ResponseType | string;
  readonly clientId: string;
  readonly extraParams: Record<string, string>;
  readonly usePKCE?: boolean;
  readonly codeChallengeMethod: CodeChallengeMethod;
  readonly redirectUri: string;
  readonly scopes?: string[];
  readonly clientSecret?: string;
  readonly prompt?: Prompt | Prompt[];

  constructor(request: IAuthRequestConfig) {
    this.responseType = request.responseType ?? ResponseType.Code;
    this.clientId = request.clientId;
    this.redirectUri = request.redirectUri;
    this.scopes = request.scopes;
    this.clientSecret = request.clientSecret;
    this.prompt = request.prompt;
    this.state = request.state ?? generateRandom(10);
    this.extraParams = request.extraParams ?? {};
    this.codeChallengeMethod =
      request.codeChallengeMethod ?? CodeChallengeMethod.S256;
    this.usePKCE = request.usePKCE ?? true;

    invariant(
      this.codeChallengeMethod !== CodeChallengeMethod.Plain,
      '`AuthRequest` does not support `CodeChallengeMethod.Plain` as it is not secure.',
    );
    invariant(
      this.redirectUri,
      `\`AuthRequest\` requires a valid \`redirectUri\`. Ex: ${
        Platform.OS === 'web'
          ? 'https://yourwebsite.com/'
          : 'com.your.app:/oauthredirect'
      }`,
    );
  }

  /** Loads and returns a valid auth request config, generating PKCE fields if needed. */
  async getAuthRequestConfigAsync(): Promise<IAuthRequestConfig> {
    if (this.usePKCE) {
      await this.ensureCodeIsSetupAsync();
    }

    return {
      responseType: this.responseType,
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      scopes: this.scopes,
      clientSecret: this.clientSecret,
      codeChallenge: this.codeChallenge,
      codeChallengeMethod: this.codeChallengeMethod,
      prompt: this.prompt,
      state: this.state,
      extraParams: this.extraParams,
      usePKCE: this.usePKCE,
    };
  }

  /** Prompts the user to authorize, opening a browser session for the auth URL. */
  async promptAsync(
    discovery: IAuthDiscoveryDocument,
    { url, ...options }: IAuthRequestPromptOptions = {},
  ): Promise<IAuthSessionResult> {
    if (!url) {
      if (!this.url) {
        return this.promptAsync(discovery, {
          ...options,
          url: await this.makeAuthUrlAsync(discovery),
        });
      }
      url = this.url;
    }
    invariant(
      url,
      'No authUrl provided - it points to the page where the user signs in.',
    );

    if (authLock) {
      return { type: 'locked' };
    }
    authLock = true;

    let result: IWebBrowserAuthSessionResult;
    try {
      result = await openAuthSessionAsync(url, this.redirectUri, options);
    } finally {
      authLock = false;
    }

    if (result.type === 'opened') {
      throw new Error('An unexpected error occurred');
    }
    if (result.type !== 'success') {
      return { type: result.type };
    }
    return this.parseReturnUrl(result.url);
  }

  parseReturnUrl(url: string): IAuthSessionResult {
    const { params, errorCode } = getQueryParams(url);
    const { state, error = errorCode ?? undefined } = params;

    let parsedError: AuthError | null = null;
    let authentication: TokenResponse | null = null;
    if (state !== this.state) {
      parsedError = new AuthError({
        error: 'state_mismatch',
        error_description:
          'Cross-Site request verification failed. Cached state and returned state do not match.',
      });
    } else if (error) {
      parsedError = new AuthError({ error, ...params });
    }
    if (params.access_token) {
      authentication = TokenResponse.fromQueryParams(params);
    }

    return {
      type: parsedError ? 'error' : 'success',
      error: parsedError,
      url,
      params,
      authentication,
      errorCode,
    };
  }

  /** Builds and caches the authorization URL. */
  async makeAuthUrlAsync(discovery: IAuthDiscoveryDocument): Promise<string> {
    const request = await this.getAuthRequestConfigAsync();
    if (!request.state)
      throw new Error('Cannot make request URL without a valid `state` loaded');

    const params: Record<string, string> = {};
    if (request.codeChallenge) {
      params.code_challenge = request.codeChallenge;
    }
    for (const extra in request.extraParams) {
      const param = request.extraParams[extra];
      if (param != null) {
        params[extra] = param;
      }
    }
    if (request.usePKCE && request.codeChallengeMethod) {
      params.code_challenge_method = request.codeChallengeMethod;
    }
    if (request.clientSecret) {
      params.client_secret = request.clientSecret;
    }
    if (request.prompt) {
      params.prompt = createPromptString(request.prompt) ?? '';
    }
    params.redirect_uri = request.redirectUri;
    params.client_id = request.clientId;
    params.response_type = request.responseType ?? ResponseType.Code;
    params.state = request.state;
    if (request.scopes?.length) {
      params.scope = request.scopes.join(' ');
    }

    this.url = `${discovery.authorizationEndpoint}?${new URLSearchParams(params)}`;
    return this.url;
  }

  private async ensureCodeIsSetupAsync(): Promise<void> {
    if (this.codeVerifier) return;
    const { codeVerifier, codeChallenge } = await buildCodeAsync();
    this.codeVerifier = codeVerifier;
    this.codeChallenge = codeChallenge;
  }
}
