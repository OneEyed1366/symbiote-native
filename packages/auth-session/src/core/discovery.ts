import invariant from 'invariant';
import type { ICodeChallengeMethod } from './auth-request.types';
import { requestAsync } from './fetch';

/** URL using the `https` scheme with no query or fragment, asserted by the OP as its issuer. */
export type IIssuer = string;

export type IProviderMetadataEndpoints = {
  issuer?: IIssuer;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  revocation_endpoint?: string;
  registration_endpoint?: string;
  end_session_endpoint?: string;
  introspection_endpoint?: string;
  device_authorization_endpoint?: string;
};

export type IProviderMetadata = Record<string, string | boolean | string[]> &
  IProviderMetadataEndpoints & {
    jwks_uri?: string;
    scopes_supported?: string[];
    response_types_supported?: string[];
    response_modes_supported?: string[];
    grant_types_supported?: string[];
    id_token_signing_alg_values_supported?: string[];
    subject_types_supported?: string[];
    token_endpoint_auth_methods_supported?: string[];
    display_values_supported?: string[];
    claim_types_supported?: string[];
    claims_supported?: string[];
    service_documentation?: string;
    claims_locales_supported?: string[];
    ui_locales_supported?: string[];
    claims_parameter_supported?: boolean;
    request_parameter_supported?: boolean;
    request_uri_parameter_supported?: boolean;
    require_request_uri_registration?: boolean;
    op_policy_uri?: string;
    op_tos_uri?: string;
    code_challenge_methods_supported?: ICodeChallengeMethod[];
    check_session_iframe?: string;
    backchannel_logout_supported?: boolean;
    backchannel_logout_session_supported?: boolean;
    frontchannel_logout_supported?: boolean;
    frontchannel_logout_session_supported?: boolean;
  };

export type IDiscoveryDocument = {
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  /** Some providers (e.g. Spotify) don't expose one despite the spec requiring it. */
  revocationEndpoint?: string;
  userInfoEndpoint?: string;
  endSessionEndpoint?: string;
  registrationEndpoint?: string;
  discoveryDocument?: IProviderMetadata;
};

export type IIssuerOrDiscovery = IIssuer | IDiscoveryDocument;

/** https://tools.ietf.org/html/rfc5785 */
export function issuerWithWellKnownUrl(issuer: IIssuer): string {
  return `${issuer}/.well-known/openid-configuration`;
}

export async function fetchDiscoveryAsync(
  issuer: IIssuer,
): Promise<IDiscoveryDocument> {
  const json = await requestAsync<IProviderMetadata>(
    issuerWithWellKnownUrl(issuer),
    {
      dataType: 'json',
      method: 'GET',
    },
  );

  return {
    discoveryDocument: json,
    authorizationEndpoint: json.authorization_endpoint,
    tokenEndpoint: json.token_endpoint,
    revocationEndpoint: json.revocation_endpoint,
    userInfoEndpoint: json.userinfo_endpoint,
    endSessionEndpoint: json.end_session_endpoint,
    registrationEndpoint: json.registration_endpoint,
  };
}

export async function resolveDiscoveryAsync(
  issuerOrDiscovery: IIssuerOrDiscovery,
): Promise<IDiscoveryDocument> {
  invariant(
    issuerOrDiscovery &&
      !['number', 'boolean'].includes(typeof issuerOrDiscovery),
    'Expected a valid discovery object or issuer URL',
  );
  if (typeof issuerOrDiscovery === 'string') {
    return await fetchDiscoveryAsync(issuerOrDiscovery);
  }
  return issuerOrDiscovery;
}
