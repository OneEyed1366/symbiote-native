import { Platform } from 'react-native';
import { dismissAuthSession } from '@symbiote-native/web-browser';
import { AuthRequest } from './auth-request';
import type { IAuthRequestConfig } from './auth-request.types';
import type { IAuthSessionRedirectUriOptions } from './auth-session.types';
import type { IIssuerOrDiscovery } from './discovery';
import { resolveDiscoveryAsync } from './discovery';

const IPV4_PATTERN =
  /\b(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/;

/** Cancels an active `AuthSession`, if there is one. */
export function dismiss(): void {
  dismissAuthSession();
}

/** Unlike upstream, never reads an app manifest - pass `native` or `scheme` explicitly. */
export function makeRedirectUri({
  native,
  scheme,
  isTripleSlashed = false,
  queryParams = {},
  path = '',
  preferLocalhost = false,
}: IAuthSessionRedirectUriOptions = {}): string {
  if (Platform.OS !== 'web' && native) {
    return native;
  }
  if (!scheme) {
    throw new Error(
      'makeRedirectUri() requires a `scheme` (or a `native` URI on non-web platforms) - there is no app manifest to infer one from.',
    );
  }

  const cleanedPath = path.replace(/^\//, '');
  const query = new URLSearchParams(
    Object.entries(queryParams).filter(
      (entry): entry is [string, string] => entry[1] != null,
    ),
  ).toString();
  const slashes = isTripleSlashed ? '///' : '//';
  const url = `${scheme}:${slashes}${cleanedPath}${query ? `?${query}` : ''}`;

  if (preferLocalhost) {
    const ipAddress = url.match(IPV4_PATTERN);
    if (ipAddress?.length) {
      const [protocol, rest] = url.split(ipAddress[0]);
      return `${protocol}localhost${rest}`;
    }
  }
  return url;
}

/** Builds an `AuthRequest` and loads its authorization URL before returning it. */
export async function loadAsync(
  config: IAuthRequestConfig,
  issuerOrDiscovery: IIssuerOrDiscovery,
): Promise<AuthRequest> {
  const request = new AuthRequest(config);
  const discovery = await resolveDiscoveryAsync(issuerOrDiscovery);
  await request.makeAuthUrlAsync(discovery);
  return request;
}
