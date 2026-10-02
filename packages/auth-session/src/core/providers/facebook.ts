import type { IAuthRequestConfig } from '../auth-request.types';
import { ResponseType } from '../auth-request.types';
import { AuthRequest } from '../auth-request';
import type { IDiscoveryDocument } from '../discovery';
import { generateHexStringAsync } from '../pkce';
import { applyRequiredScopes } from './provider-utils';
import type { IProviderAuthRequestConfig } from './provider.types';

/** Required for Firebase to work properly - a reasonable default either way. */
const MINIMUM_SCOPES = ['public_profile', 'email'];

export const discovery: IDiscoveryDocument = {
  authorizationEndpoint: 'https://www.facebook.com/v6.0/dialog/oauth',
  tokenEndpoint: 'https://graph.facebook.com/v6.0/oauth/access_token',
};

export type IFacebookAuthRequestConfig = IProviderAuthRequestConfig & {
  webClientId?: string;
  iosClientId?: string;
  androidClientId?: string;
};

/** Extends `AuthRequest`, applying Facebook's minimum scopes and an auth nonce. */
export class FacebookAuthRequest extends AuthRequest {
  nonce?: string;

  constructor({
    language,
    extraParams = {},
    clientSecret,
    ...config
  }: IFacebookAuthRequestConfig) {
    const inputParams: Record<string, string> = {
      display: 'popup',
      ...extraParams,
    };
    if (language) {
      inputParams.locale = language;
    }

    const scopes = applyRequiredScopes(config.scopes, MINIMUM_SCOPES);
    // Facebook rejects a client secret unless the code flow is used.
    const inputClientSecret =
      config.responseType && config.responseType !== ResponseType.Code
        ? clientSecret
        : undefined;

    super({
      ...config,
      responseType: config.responseType ?? ResponseType.Token,
      clientSecret: inputClientSecret,
      scopes,
      extraParams: inputParams,
    });
  }

  override async getAuthRequestConfigAsync(): Promise<IAuthRequestConfig> {
    const { extraParams = {}, ...config } =
      await super.getAuthRequestConfigAsync();
    if (!extraParams.nonce) {
      this.nonce = this.nonce ?? (await generateHexStringAsync(16));
      extraParams.auth_nonce = this.nonce;
    }
    return { ...config, extraParams };
  }
}
