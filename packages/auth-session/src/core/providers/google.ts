import type { IAuthRequestConfig } from '../auth-request.types';
import { Prompt, ResponseType } from '../auth-request.types';
import { AuthRequest } from '../auth-request';
import type { IDiscoveryDocument } from '../discovery';
import { generateHexStringAsync } from '../pkce';
import { applyRequiredScopes } from './provider-utils';
import type { IProviderAuthRequestConfig } from './provider.types';

const MINIMUM_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

export const discovery: IDiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
};

export type IGoogleAuthRequestConfig = IProviderAuthRequestConfig & {
  /** If the user's email is known ahead of time, supply it as the default option. */
  loginHint?: string;
  /** Lets the user switch accounts, where possible. @default false */
  selectAccount?: boolean;
  webClientId?: string;
  iosClientId?: string;
  androidClientId?: string;
};

/** Extends `AuthRequest`, applying Google's minimum scopes and an id-token nonce. */
export class GoogleAuthRequest extends AuthRequest {
  nonce?: string;

  constructor({
    language,
    loginHint,
    selectAccount,
    extraParams = {},
    clientSecret,
    ...config
  }: IGoogleAuthRequestConfig) {
    const inputParams = { ...extraParams };
    if (language) inputParams.hl = language;
    if (loginHint) inputParams.login_hint = loginHint;
    if (selectAccount) inputParams.prompt = Prompt.SelectAccount;

    const scopes = applyRequiredScopes(config.scopes, MINIMUM_SCOPES);
    const isImplicit =
      config.responseType === ResponseType.Token ||
      config.responseType === ResponseType.IdToken;
    if (isImplicit) {
      config.usePKCE = false;
    }
    // Google rejects a client secret unless the code flow is used.
    const inputClientSecret =
      config.responseType && config.responseType !== ResponseType.Code
        ? clientSecret
        : undefined;

    super({
      ...config,
      clientSecret: inputClientSecret,
      scopes,
      extraParams: inputParams,
    });
  }

  override async getAuthRequestConfigAsync(): Promise<IAuthRequestConfig> {
    const { extraParams = {}, ...config } =
      await super.getAuthRequestConfigAsync();
    if (config.responseType === ResponseType.IdToken && !extraParams.nonce) {
      this.nonce = this.nonce ?? (await generateHexStringAsync(16));
      extraParams.nonce = this.nonce;
    }
    return { ...config, extraParams };
  }
}
