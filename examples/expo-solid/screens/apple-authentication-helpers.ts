import {
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  AppleAuthenticationCredentialState,
  AppleAuthenticationScope,
  AppleAuthenticationUserDetectionStatus,
} from '@symbiote-native/apple-authentication';

export const USER_KEY = 'canary.apple-auth.user';
export const REQUEST_STATE = 'canary-state';
const TOKEN_PREVIEW_CHARS = 12;

export const CREDENTIAL_STATE_LABEL: Record<
  AppleAuthenticationCredentialState,
  string
> = {
  [AppleAuthenticationCredentialState.REVOKED]:
    'REVOKED: the user stopped using Sign in with Apple, log them out',
  [AppleAuthenticationCredentialState.AUTHORIZED]:
    'AUTHORIZED: keep the user signed in',
  [AppleAuthenticationCredentialState.NOT_FOUND]:
    'NOT_FOUND: no such user on this device, show sign in',
  [AppleAuthenticationCredentialState.TRANSFERRED]:
    'TRANSFERRED: the app moved to another team, migrate the user',
};

export const REAL_USER_LABEL: Record<
  AppleAuthenticationUserDetectionStatus,
  string
> = {
  [AppleAuthenticationUserDetectionStatus.UNSUPPORTED]: 'unsupported',
  [AppleAuthenticationUserDetectionStatus.UNKNOWN]: 'unknown',
  [AppleAuthenticationUserDetectionStatus.LIKELY_REAL]: 'likely a real person',
};

export const BUTTON_TYPES = [
  { label: 'sign in', value: AppleAuthenticationButtonType.SIGN_IN },
  { label: 'continue', value: AppleAuthenticationButtonType.CONTINUE },
  { label: 'sign up', value: AppleAuthenticationButtonType.SIGN_UP },
];

export const BUTTON_STYLES = [
  { label: 'black', value: AppleAuthenticationButtonStyle.BLACK },
  { label: 'white', value: AppleAuthenticationButtonStyle.WHITE },
  { label: 'outline', value: AppleAuthenticationButtonStyle.WHITE_OUTLINE },
];

export const RADIUS_OPTIONS = [0, 8, 22].map(item => ({
  label: String(item),
  value: item,
}));

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' ? `${code}: ${error.message}` : error.message;
}

export function preview(token: string | null): string {
  return token === null
    ? 'null'
    : `${token.slice(0, TOKEN_PREVIEW_CHARS)}… (${token.length} chars)`;
}

export function scopesOf(
  isNameRequested: boolean,
  isEmailRequested: boolean,
): AppleAuthenticationScope[] {
  return [
    ...(isNameRequested ? [AppleAuthenticationScope.FULL_NAME] : []),
    ...(isEmailRequested ? [AppleAuthenticationScope.EMAIL] : []),
  ];
}

export const SIGN_IN_FIRST = 'sign in first';
export const SIMULATOR_NOTE = ' (the simulator always throws, use a device)';

export type ISessionStep = (user: string) => Promise<string>;

// One session call: refuses without a user, otherwise shows the step's result or its error
export async function runSessionStep(
  user: string | null,
  step: ISessionStep,
  setState: (text: string) => void,
  failureNote = '',
): Promise<void> {
  if (user === null) {
    setState(SIGN_IN_FIRST);
    return;
  }
  try {
    setState(await step(user));
  } catch (error: unknown) {
    setState(`failed: ${describeError(error)}${failureNote}`);
  }
}
