// The config each provider hook derives before it loads a request, kept pure so every adapter's
// hook shares one copy of upstream's `useMemo` blocks

import { Platform } from 'react-native';
import { applicationId } from '@symbiote-native/application';
import { Prompt, ResponseType } from '../auth-request.types';
import { makeRedirectUri } from '../auth-session';
import type { IAuthSessionRedirectUriOptions } from '../auth-session.types';
import type { IFacebookAuthRequestConfig } from './facebook';
import type { IGoogleAuthRequestConfig } from './google';
import { invariantClientId } from './provider-utils';

type IClientIdProperty = 'iosClientId' | 'androidClientId' | 'webClientId';

function clientIdProperty(): IClientIdProperty {
  return Platform.select<IClientIdProperty>({
    ios: 'iosClientId',
    android: 'androidClientId',
    default: 'webClientId',
  });
}

function pickClientId(
  config: Partial<IGoogleAuthRequestConfig | IFacebookAuthRequestConfig>,
  providerName: string,
): string {
  const propertyName = clientIdProperty();
  const clientId = config[propertyName] ?? config.clientId;
  invariantClientId(propertyName, clientId, providerName);
  return clientId;
}

/** What the automatic code exchange needs, upstream reads the same fields off the hook config */
export type IGoogleExchangeParams = {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string[];
  shouldAutoExchangeCode?: boolean;
};

export type IGoogleRequestSetup = {
  requestConfig: IGoogleAuthRequestConfig;
  exchange: IGoogleExchangeParams;
};

function resolveGoogleResponseType(
  config: Partial<IGoogleAuthRequestConfig>,
): IGoogleAuthRequestConfig['responseType'] {
  // Allow overrides
  if (typeof config.responseType !== 'undefined') return config.responseType;
  // Installed apps auto exchange the code for the token and the id token, no secret needed
  return ResponseType.Code;
}

function resolveGoogleExtraParams(
  config: Partial<IGoogleAuthRequestConfig>,
): Record<string, string> {
  const output: Record<string, string> = { ...config.extraParams };
  if (config.language) output.hl = config.language;
  if (config.loginHint) output.login_hint = config.loginHint;
  if (config.selectAccount) output.prompt = Prompt.SelectAccount;
  return output;
}

export function resolveGoogleRequestSetup(
  config: Partial<IGoogleAuthRequestConfig> = {},
  redirectUriOptions: Partial<IAuthSessionRedirectUriOptions> = {},
): IGoogleRequestSetup {
  const clientId = pickClientId(config, 'Google');
  const redirectUri =
    config.redirectUri ??
    makeRedirectUri({
      native: `${applicationId}:/oauthredirect`,
      ...redirectUriOptions,
    });
  return {
    requestConfig: {
      ...config,
      responseType: resolveGoogleResponseType(config),
      extraParams: resolveGoogleExtraParams(config),
      clientId,
      redirectUri,
    },
    exchange: {
      clientId,
      clientSecret: config.clientSecret,
      redirectUri,
      scopes: config.scopes,
      shouldAutoExchangeCode: config.shouldAutoExchangeCode,
    },
  };
}

/** Upstream only asks for `id_token` directly on web, so off web the default flow applies */
export function toGoogleIdTokenConfig(
  config: Partial<IGoogleAuthRequestConfig>,
): Partial<IGoogleAuthRequestConfig> {
  return { ...config, responseType: undefined };
}

export function resolveFacebookRequestSetup(
  config: Partial<IFacebookAuthRequestConfig> = {},
  redirectUriOptions: Partial<IAuthSessionRedirectUriOptions> = {},
): IFacebookAuthRequestConfig {
  const clientId = pickClientId(config, 'Facebook');
  const redirectUri =
    config.redirectUri ??
    makeRedirectUri({
      // The redirect URI is fb + client ID on native
      native: `fb${clientId}://authorize`,
      ...redirectUriOptions,
    });
  const extraParams: Record<string, string> = { ...config.extraParams };
  if (config.language) extraParams.locale = config.language;
  return { ...config, extraParams, clientId, redirectUri };
}
