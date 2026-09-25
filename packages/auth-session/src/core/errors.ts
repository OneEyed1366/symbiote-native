// Hand-ported from expo-modules-core's CodedError (src/errors/CodedError.ts) - this package
// depends on none of the rest of expo-modules-core, so a single small class is copied rather
// than pulling in the whole native-module runtime as a dependency.
class CodedError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type IResponseErrorConfig = Record<string, unknown> & {
  error: string;
  error_description?: string;
  error_uri?: string;
};

export type IAuthErrorConfig = IResponseErrorConfig & {
  /** Required only if `state` was used in the initial request. */
  state?: string;
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: `The request is missing a required parameter, includes an invalid parameter value, includes a parameter more than once, or is otherwise malformed.`,
  unauthorized_client: `The client is not authorized to request an authorization code using this method.`,
  access_denied: `The resource owner or authorization server denied the request.`,
  unsupported_response_type: `The authorization server does not support obtaining an authorization code using this method.`,
  invalid_scope: 'The requested scope is invalid, unknown, or malformed.',
  server_error:
    'The authorization server encountered an unexpected condition that prevented it from fulfilling the request.',
  temporarily_unavailable:
    'The authorization server is currently unable to handle the request due to a temporary overloading or maintenance of the server.',
  interaction_required:
    'Auth server requires user interaction of some form to proceed.',
  login_required: 'Auth server requires user authentication.',
  account_selection_required:
    'User is required to select a session at the auth server.',
  consent_required: 'Auth server requires user consent.',
  invalid_request_uri:
    'The `request_uri` in the auth request returns an error or contains invalid data.',
  invalid_request_object:
    'The request parameter contains an invalid request object.',
  request_not_supported:
    'The OP does not support use of the `request` parameter.',
  request_uri_not_supported:
    'The OP does not support use of the `request_uri` parameter.',
  registration_not_supported:
    'The OP does not support use of the `registration` parameter.',
};

const TOKEN_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: `The request is missing a required parameter, includes an unsupported parameter value (other than grant type), repeats a parameter, includes multiple credentials, utilizes more than one mechanism for authenticating the client, or is otherwise malformed.`,
  invalid_client: `Client authentication failed (e.g., unknown client, no client authentication included, or unsupported authentication method).`,
  invalid_grant: `The provided authorization grant (e.g., authorization code, resource owner credentials) or refresh token is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.`,
  unauthorized_client: `The authenticated client is not authorized to use this authorization grant type.`,
  unsupported_grant_type: `The authorization grant type is not supported by the authorization server.`,
};

/** https://tools.ietf.org/html/rfc6749#section-4.1.2.1 */
export class ResponseError extends CodedError {
  description?: string;
  uri?: string;
  params: Record<string, unknown>;

  constructor(params: IResponseErrorConfig, errorCodeType: 'auth' | 'token') {
    const { error, error_description, error_uri } = params;
    const message = (
      errorCodeType === 'auth' ? AUTH_ERROR_MESSAGES : TOKEN_ERROR_MESSAGES
    )[error];
    let errorMessage: string;
    if (message) {
      errorMessage =
        message +
        (error_description ? `\nMore info: ${error_description}` : '');
    } else if (error_description) {
      errorMessage = error_description;
    } else {
      errorMessage = 'An unknown error occurred';
    }
    super(error, errorMessage);
    this.description = error_description ?? message;
    this.uri = error_uri;
    this.params = params;
  }
}

/** https://tools.ietf.org/html/rfc6749#section-5.2 */
export class AuthError extends ResponseError {
  state?: string;

  constructor(response: IAuthErrorConfig) {
    super(response, 'auth');
    this.state = response.state;
  }
}

export class TokenError extends ResponseError {
  constructor(response: IResponseErrorConfig) {
    super(response, 'token');
  }
}
