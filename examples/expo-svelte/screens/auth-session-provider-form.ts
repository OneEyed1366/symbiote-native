import type {
  FacebookAuthRequest,
  GoogleAuthRequest,
  IAuthSessionResult,
} from '@symbiote-native/auth-session/svelte';

export const MODE = {
  off: 'off',
  google: 'google',
  googleIdToken: 'googleIdToken',
  facebook: 'facebook',
} as const;
export type IMode = (typeof MODE)[keyof typeof MODE];
export const MODES: readonly { label: string; value: IMode }[] = [
  { label: 'off', value: MODE.off },
  { label: 'useGoogleAuthRequest', value: MODE.google },
  { label: 'useGoogleIdTokenAuthRequest', value: MODE.googleIdToken },
  { label: 'useFacebookAuthRequest', value: MODE.facebook },
];

export type IProviderForm = {
  clientId: string;
  webClientId: string;
  iosClientId: string;
  androidClientId: string;
  loginHint: string;
  selectAccount: boolean;
  shouldAutoExchangeCode: boolean;
  scheme: string;
};

export const INITIAL_PROVIDER_FORM: IProviderForm = {
  clientId: '',
  webClientId: '',
  iosClientId: '',
  androidClientId: '',
  loginHint: '',
  selectAccount: false,
  shouldAutoExchangeCode: true,
  scheme: 'canaryexpo',
};

export function describe(
  request: GoogleAuthRequest | FacebookAuthRequest | null,
  result: IAuthSessionResult | null,
): string {
  return `${request === null ? 'request loading' : 'request ready'}, result ${result?.type ?? 'none'}`;
}

export function googleConfig(form: IProviderForm) {
  return {
    clientId: form.clientId,
    webClientId: form.webClientId,
    iosClientId: form.iosClientId,
    androidClientId: form.androidClientId,
    loginHint: form.loginHint === '' ? undefined : form.loginHint,
    selectAccount: form.selectAccount,
    shouldAutoExchangeCode: form.shouldAutoExchangeCode,
  };
}
