import type { IAuthSessionOpenOptions } from '@symbiote-native/web-browser';
import type { IDiscoveryDocument } from './discovery';

export enum CodeChallengeMethod {
  /** The default and recommended method for transforming the code verifier. */
  S256 = 'S256',
  /** Not secure - the code verifier would be sent to the server as-is. */
  Plain = 'plain',
}
export type ICodeChallengeMethod = CodeChallengeMethod;

/** https://tools.ietf.org/html/rfc6749#section-3.1.1 */
export enum ResponseType {
  Code = 'code',
  Token = 'token',
  /** A custom registered type for getting an `id_token` from Google OAuth. */
  IdToken = 'id_token',
}

/** https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationRequest */
export enum Prompt {
  None = 'none',
  Login = 'login',
  Consent = 'consent',
  SelectAccount = 'select_account',
}

export type IAuthRequestPromptOptions = IAuthSessionOpenOptions & {
  /** URL to open when prompting the user; usually left undefined and generated internally. */
  url?: string;
};

/** Represents an OAuth authorization request as JSON. */
export type IAuthRequestConfig = {
  /** @default ResponseType.Code */
  responseType?: ResponseType | string;
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  clientSecret?: string;
  /** @default CodeChallengeMethod.S256 */
  codeChallengeMethod?: CodeChallengeMethod;
  codeChallenge?: string;
  prompt?: Prompt | Prompt[];
  /** Protection against Cross-Site Request Forgery. */
  state?: string;
  extraParams?: Record<string, string>;
  /** @default true */
  usePKCE?: boolean;
};

export type IAuthDiscoveryDocument = Pick<
  IDiscoveryDocument,
  'authorizationEndpoint'
>;
