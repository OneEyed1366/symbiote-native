// Типы и enum-ы `expo-apple-authentication`, порт `AppleAuthentication.types.ts`

/** Scopes for `signInAsync`, the user may deny any of them, so handle `null` fields */
export enum AppleAuthenticationScope {
  FULL_NAME = 0,
  EMAIL = 1,
}

export enum AppleAuthenticationOperation {
  /** An operation that depends on the particular kind of credential provider */
  IMPLICIT = 0,
  LOGIN = 1,
  REFRESH = 2,
  LOGOUT = 3,
}

/** The state of a credential checked with `getCredentialStateAsync` */
export enum AppleAuthenticationCredentialState {
  REVOKED,
  AUTHORIZED,
  NOT_FOUND,
  TRANSFERRED,
}

/** The system's guess of how likely the user is a real person */
export enum AppleAuthenticationUserDetectionStatus {
  /** The system does not support this determination and there is no data */
  UNSUPPORTED,
  /** The system has not determined whether the user might be a real person */
  UNKNOWN,
  /** The user appears to be a real person */
  LIKELY_REAL,
}

/** Which pre-defined text the button shows */
export enum AppleAuthenticationButtonType {
  /** "Sign in with Apple" */
  SIGN_IN,
  /** "Continue with Apple" */
  CONTINUE,
  /**
   * "Sign up with Apple"
   * @platform ios 13.2+
   */
  SIGN_UP,
}

/** Which pre-defined color scheme the button uses */
export enum AppleAuthenticationButtonStyle {
  /** White button with black text */
  WHITE,
  /** White button with a black outline and black text */
  WHITE_OUTLINE,
  /** Black button with white text */
  BLACK,
}

/** The style a name is formatted in, see `formatFullName` */
export type IAppleAuthenticationFullNameFormatStyle =
  'default' | 'short' | 'medium' | 'long' | 'abbreviated';

/** The tokenized portions of the user's name, only what the user allowed is not `null` */
export type IAppleAuthenticationFullName = {
  namePrefix: string | null;
  givenName: string | null;
  middleName: string | null;
  familyName: string | null;
  nameSuffix: string | null;
  nickname: string | null;
};

type IRequestOptions = {
  /**
   * Scopes the app asks for, they come only the first time a user signs in
   * @default []
   */
  requestedScopes?: AppleAuthenticationScope[];
  /** An arbitrary string returned unmodified in the credential, it guards against replay attacks */
  state?: string;
};

/** Options for `signInAsync`, none is required */
export type IAppleAuthenticationSignInOptions = IRequestOptions & {
  /** An arbitrary string that prevents replay attacks */
  nonce?: string;
};

/** Options for `refreshAsync`, `user` is the id of the user whose credentials refresh */
export type IAppleAuthenticationRefreshOptions = IRequestOptions & {
  user: string;
};

/** Options for `signOutAsync`, `user` is the id of the user to sign out */
export type IAppleAuthenticationSignOutOptions = {
  user: string;
  state?: string;
};

/** What a successful `signInAsync`, `refreshAsync` or `signOutAsync` resolves with */
export type IAppleAuthenticationCredential = {
  /** Stable across apps of one development team, use it to check the user later */
  user: string;
  /** The `state` the request carried, `null` when none was given */
  state: string | null;
  /** `null` without the `FULL_NAME` scope, on a denial, or after the first sign-in */
  fullName: IAppleAuthenticationFullName | null;
  /** Obscured with an Apple domain when the user withholds the address */
  email: string | null;
  realUserStatus: AppleAuthenticationUserDetectionStatus;
  /** A JSON Web Token with information about the user */
  identityToken: string | null;
  /** A short-lived session token for the app's server, it changes every session */
  authorizationCode: string | null;
};

/** What the native module accepts: the options of a call plus the operation it performs */
export type IAppleAuthenticationRequest = (
  | IAppleAuthenticationSignInOptions
  | IAppleAuthenticationRefreshOptions
  | IAppleAuthenticationSignOutOptions
) & { requestedOperation: AppleAuthenticationOperation };
